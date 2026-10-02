import { and, eq, ilike, or } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import { isDirectoryUrl } from "./hunter";
import type { NovaTool, NovaToolResult } from "./types";

// Google Maps prospecting via Apify. Web search finds pages; Maps is a
// business directory, so it returns the thing HUNTER actually needs — a
// company with an address and a phone number — in bulk.
//
// Runs are started asynchronously and polled, because a scrape of any size
// outlives a serverless request. When the wait is exhausted the run keeps
// going and hunter_maps_results collects it later by runId.

const ACTOR = "compass~crawler-google-places";
const API = "https://api.apify.com/v2";

function ok<T>(tool: string, data: T): NovaToolResult<T> {
  return { ok: true, tool, data };
}

function fail(tool: string, error: string): NovaToolResult {
  return { ok: false, tool, error };
}

function token(): string | null {
  return process.env.APIFY_TOKEN?.trim() || null;
}

interface ApifyPlace {
  title?: string;
  categoryName?: string;
  address?: string;
  city?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  url?: string;
  totalScore?: number;
  reviewsCount?: number;
  emails?: string[];
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
}

export interface MapsProspect {
  companyName: string;
  phone?: string;
  email?: string;
  website?: string;
  location?: string;
  category?: string;
  rating?: number | null;
  reviewsCount?: number | null;
  sourceUrl?: string;
  evidence?: string;
  fitReason?: string;
}

/** A Maps place only becomes a prospect if it can actually be contacted. */
export function normalizePlace(place: ApifyPlace): MapsProspect | null {
  const companyName = String(place.title ?? "").trim();
  if (!companyName) return null;
  if (place.permanentlyClosed) return null;

  const website = String(place.website ?? "").trim();
  const phone = String(place.phone ?? place.phoneUnformatted ?? "").trim();
  const email = (place.emails ?? []).map((e) => String(e).trim()).find(Boolean) ?? "";
  if (!phone && !email && !website) return null;
  // A listing whose only link is a directory is not a company website.
  const usableWebsite = website && !isDirectoryUrl(website) ? website : "";

  const location = [place.address, place.city].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");

  return {
    companyName,
    phone: phone || undefined,
    email: email || undefined,
    website: usableWebsite || undefined,
    location: location || undefined,
    category: String(place.categoryName ?? "").trim() || undefined,
    rating: typeof place.totalScore === "number" ? place.totalScore : null,
    reviewsCount: typeof place.reviewsCount === "number" ? place.reviewsCount : null,
    sourceUrl: String(place.url ?? "").trim() || undefined,
    evidence: [place.categoryName, location, place.temporarilyClosed ? "Temporarily closed" : ""]
      .filter(Boolean)
      .join(" · "),
    fitReason: "Discovered from Google Maps matching the HUNTER brief.",
  };
}

async function findDuplicate(ownerId: string, prospect: MapsProspect) {
  const identity = [
    prospect.email ? ilike(leadsTable.email, prospect.email) : null,
    prospect.phone ? ilike(leadsTable.phone, prospect.phone) : null,
    ilike(leadsTable.companyName, prospect.companyName),
  ].filter(Boolean);
  const [row] = await db
    .select({ id: leadsTable.id, companyName: leadsTable.companyName })
    .from(leadsTable)
    .where(and(eq(leadsTable.ownerId, ownerId), or(...(identity as never[]))!))
    .limit(1);
  return row ?? null;
}

async function qualify(ownerId: string, places: ApifyPlace[], includeDirectories: boolean) {
  const prospects = places
    .map(normalizePlace)
    .filter((p): p is MapsProspect => Boolean(p))
    .filter((p) => includeDirectories || !isDirectoryUrl(p.sourceUrl ?? ""));

  const out = [];
  for (const prospect of prospects) {
    const duplicate = await findDuplicate(ownerId, prospect);
    const contactPoints = [prospect.phone, prospect.email, prospect.website].filter(Boolean).length;
    out.push({
      ...prospect,
      qualification: contactPoints >= 2 ? "Research-ready" : "Needs-more-research",
      duplicate: duplicate ? { id: duplicate.id, companyName: duplicate.companyName } : null,
      importable: !duplicate,
    });
  }
  return out;
}

async function datasetItems(datasetId: string, limit: number): Promise<ApifyPlace[]> {
  const r = await fetch(`${API}/datasets/${datasetId}/items?clean=true&format=json&limit=${limit}&token=${token()}`);
  if (!r.ok) throw new Error(`Apify dataset read failed: ${r.status}`);
  return (await r.json()) as ApifyPlace[];
}

const mapsCampaign: NovaTool = {
  name: "hunter_maps_campaign",
  description: "Find businesses on Google Maps with address, phone and website in bulk, then duplicate-check and qualify them. Read-only; contacts nobody. Requires APIFY_TOKEN.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const p = (input ?? {}) as {
      query?: string;
      location?: string;
      maxPlaces?: number;
      waitSeconds?: number;
      includeDirectories?: boolean;
      scrapeContacts?: boolean;
    };
    const query = p.query?.trim();
    if (!query) return fail(this.name, "query is required, for example \"rolling shutter dealers\"");
    if (!token()) return fail(this.name, "Google Maps prospecting is not configured on the server (APIFY_TOKEN)");

    const maxPlaces = Math.min(Math.max(Number(p.maxPlaces) || 50, 1), 300);
    const waitMs = Math.min(Math.max(Number(p.waitSeconds) || 40, 5), 50) * 1000;

    const started = await fetch(`${API}/acts/${ACTOR}/runs?token=${token()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [query],
        locationQuery: p.location?.trim() || undefined,
        maxCrawledPlacesPerSearch: maxPlaces,
        language: "en",
        skipClosedPlaces: true,
        // Visits each business's own site for an email. Costs more per place.
        scrapeContacts: p.scrapeContacts === true,
      }),
    });
    if (!started.ok) {
      const text = await started.text().catch(() => "");
      return fail(this.name, `Apify run could not be started: ${started.status} ${text.slice(0, 300)}`);
    }
    const run = ((await started.json()) as { data?: { id?: string; defaultDatasetId?: string } }).data ?? {};
    const runId = run.id;
    const datasetId = run.defaultDatasetId;
    if (!runId || !datasetId) return fail(this.name, "Apify did not return a run id");

    const deadline = Date.now() + waitMs;
    let status = "RUNNING";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await fetch(`${API}/actor-runs/${runId}?token=${token()}`);
      status = ((await s.json()) as { data?: { status?: string } }).data?.status ?? "RUNNING";
      if (status !== "RUNNING" && status !== "READY") break;
    }

    if (status !== "SUCCEEDED") {
      return ok(this.name, {
        query,
        runId,
        datasetId,
        status,
        candidates: [],
        pending: true,
        nextStep: `The scrape is still running. Call hunter_maps_results with runId ${runId} in a minute to collect it.`,
      });
    }

    const places = await datasetItems(datasetId, maxPlaces);
    const candidates = await qualify(context.ownerId, places, p.includeDirectories === true);
    return ok(this.name, {
      query,
      location: p.location?.trim() ?? null,
      runId,
      datasetId,
      status,
      scraped: places.length,
      discovered: candidates.length,
      newCandidates: candidates.filter((c) => !c.duplicate).length,
      withPhone: candidates.filter((c) => c.phone).length,
      withEmail: candidates.filter((c) => c.email).length,
      candidates,
      nextStep: "Select candidates and submit hunter_create_lead requests. Lead creation remains approval-gated.",
    });
  },
};

const mapsResults: NovaTool = {
  name: "hunter_maps_results",
  description: "Collect the results of a Google Maps prospecting run started earlier, by runId. Read-only.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const p = (input ?? {}) as { runId?: string; maxPlaces?: number; includeDirectories?: boolean };
    const runId = p.runId?.trim();
    if (!runId) return fail(this.name, "runId is required");
    if (!token()) return fail(this.name, "Google Maps prospecting is not configured on the server (APIFY_TOKEN)");

    const s = await fetch(`${API}/actor-runs/${runId}?token=${token()}`);
    if (!s.ok) return fail(this.name, `Apify run ${runId} could not be read: ${s.status}`);
    const data = ((await s.json()) as { data?: { status?: string; defaultDatasetId?: string } }).data ?? {};
    if (data.status !== "SUCCEEDED") {
      return ok(this.name, { runId, status: data.status ?? "UNKNOWN", pending: true, candidates: [] });
    }

    const places = await datasetItems(data.defaultDatasetId!, Math.min(Math.max(Number(p.maxPlaces) || 300, 1), 300));
    const candidates = await qualify(context.ownerId, places, p.includeDirectories === true);
    return ok(this.name, {
      runId,
      status: data.status,
      scraped: places.length,
      discovered: candidates.length,
      newCandidates: candidates.filter((c) => !c.duplicate).length,
      withPhone: candidates.filter((c) => c.phone).length,
      withEmail: candidates.filter((c) => c.email).length,
      candidates,
    });
  },
};

export const mapsNovaTools: NovaTool[] = [mapsCampaign, mapsResults];
