import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import { matchProductsToEnquiry } from "../knowledge/products";
import type { NovaTool } from "./types";

type HunterProspect = {
  companyName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  website?: string;
  location?: string;
  requirement?: string;
  sourceUrl?: string;
  evidence?: string;
  fitReason?: string;
  enrichment?: unknown;
};

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

async function tavilySearch(query: string, maxResults: number) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not configured on the API server.");

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: Math.min(Math.max(maxResults, 1), 25),
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) throw new Error(`Tavily search failed: ${response.status}`);
  const payload = (await response.json()) as { results?: TavilyResult[] };
  return payload.results ?? [];
}

function normalizeCandidate(result: TavilyResult, brief: string): HunterProspect | null {
  const sourceUrl = String(result.url ?? "").trim();
  const title = String(result.title ?? "").trim();
  if (!sourceUrl || !title) return null;

  const companyName = title.replace(/\s*[-|:].*$/, "").trim();
  if (!companyName) return null;

  return {
    companyName,
    website: sourceUrl,
    sourceUrl,
    evidence: String(result.content ?? "").trim(),
    requirement: brief,
    fitReason: "Discovered from public web research matching the HUNTER brief.",
  };
}

/**
 * Who the campaign is looking for. The qualifiers steer the search engine:
 * "channel" finds businesses that resell or fit the product, "buyer" finds
 * the end users who operate the premises. Searching for both at once returns
 * mostly the supply side, because those pages are far more numerous.
 */
export type HunterIntent = "buyer" | "channel" | "any";

const INTENT_QUALIFIERS: Record<HunterIntent, string> = {
  channel: "supplier OR distributor OR dealer OR installer OR fabricator OR integrator",
  buyer: "factory OR warehouse OR plant OR mill OR godown OR showroom OR premises",
  any: "",
};

/**
 * Directories and marketplaces: these pages are listings of many businesses,
 * never a prospect in themselves, and they crowd out real company sites.
 */
const DIRECTORY_HOSTS = [
  // B2B marketplaces and trade directories
  "indiamart.com", "tradeindia.com", "justdial.com", "exportersindia.com",
  "alibaba.com", "made-in-china.com", "sulekha.com", "yellowpages.in",
  "indiacatalog.com", "tradewheel.com", "go4worldbusiness.com", "ec21.com",
  "indiabizclub.com", "connect2india.com", "dial4trade.com",
  "indianyellowpages.com", "yellowpages.co.in", "tradeford.com",
  "exportersindia.co", "fibre2fashion.com", "pepagora.com",
  // Property portals: a page about a warehouse is not a company that owns one
  "magicbricks.com", "99acres.com", "housing.com", "propertywala.com",
  "propertyinsurat.in", "suratvrproperties.com", "olx.in", "quikr.com",
  "squareyards.com", "nobroker.in", "commonfloor.com",
  // Social, reference, retail and company registries
  "facebook.com", "linkedin.com", "youtube.com", "instagram.com", "x.com",
  "twitter.com", "pinterest.com", "wikipedia.org", "amazon.in", "flipkart.com",
  "tofler.in", "zaubacorp.com",
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isDirectoryUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return DIRECTORY_HOSTS.some((d) => host === d || host.endsWith("." + d));
}

function readIntent(value: unknown): HunterIntent {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "buyer" || v === "channel" || v === "any" ? v : "channel";
}

function buildQuery(parts: Array<string | undefined>, intent: HunterIntent): string {
  const qualifiers = INTENT_QUALIFIERS[intent];
  return [...parts, qualifiers].map((x) => x?.trim()).filter(Boolean).join(" ");
}

async function findDuplicates(ownerId: string, prospects: HunterProspect[]) {
  const output = new Map<string, { id: number; companyName: string }>();

  for (const prospect of prospects) {
    const identities = [
      prospect.email?.trim(),
      prospect.phone?.trim(),
      prospect.companyName?.trim(),
    ].filter(Boolean) as string[];

    if (!identities.length) continue;

    const identityFilters = identities.map((value) => {
      if (value === prospect.email?.trim()) return ilike(leadsTable.email, value);
      if (value === prospect.phone?.trim()) return ilike(leadsTable.phone, value);
      return ilike(leadsTable.companyName, value);
    });

    const [duplicate] = await db.select({
      id: leadsTable.id,
      companyName: leadsTable.companyName,
    }).from(leadsTable).where(and(
      eq(leadsTable.ownerId, ownerId),
      or(...identityFilters)!,
    )).limit(1);

    if (duplicate) output.set(prospect.companyName.toLowerCase(), duplicate);
  }

  return output;
}

const hunterSearch: NovaTool = {
  name: "hunter_search_prospects",
  description: "Search the existing CRM for possible prospect matches before importing a researched prospect.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const q = String((input as { query?: string } | undefined)?.query ?? "").trim();
    if (!q) return { ok: false, tool: this.name, error: "query is required" };
    const pattern = `%${q}%`;
    const rows = await db.select({
      id: leadsTable.id,
      companyName: leadsTable.companyName,
      contactName: leadsTable.contactName,
      email: leadsTable.email,
      phone: leadsTable.phone,
      status: leadsTable.status,
    }).from(leadsTable).where(and(
      eq(leadsTable.ownerId, context.ownerId),
      or(ilike(leadsTable.companyName, pattern), ilike(leadsTable.contactName, pattern), ilike(leadsTable.email, pattern), ilike(leadsTable.phone, pattern))!,
    )).orderBy(desc(leadsTable.createdAt)).limit(20);
    return { ok: true, tool: this.name, data: rows };
  },
};

const hunterWebResearch: NovaTool = {
  name: "hunter_web_research",
  description: "Discover public-web prospect candidates using product, customer type, geography and free-text criteria. Never contacts prospects.",
  risk: "read",
  requiresApproval: false,
  async execute(input) {
    const p = (input ?? {}) as {
      query?: string;
      geography?: string;
      customerType?: string;
      product?: string;
      intent?: string;
      includeDirectories?: boolean;
      maxResults?: number;
    };

    const intent = readIntent(p.intent);
    const query = buildQuery([
      p.query?.trim(),
      p.product ? `"${p.product.trim()}"` : "",
      p.customerType?.trim(),
      p.geography?.trim(),
    ], intent);

    if (!query) return { ok: false, tool: this.name, error: "query, product, customerType, or geography is required" };

    try {
      const raw = await tavilySearch(query, p.maxResults ?? 10);
      const mapped = raw.map((item) => ({
        ...normalizeCandidate(item, query),
        score: typeof item.score === "number" ? item.score : null,
      })).filter((item): item is HunterProspect & { score: number | null } => Boolean(item));
      const beforeFilter = mapped.length;
      const results = p.includeDirectories
        ? mapped
        : mapped.filter((item) => !isDirectoryUrl(item.sourceUrl ?? item.website ?? ""));

      return {
        ok: true,
        tool: this.name,
        data: {
          query,
          intent,
          results,
          directoriesFiltered: beforeFilter - results.length,
          nextStep: "Run hunter_run_campaign to normalize, duplicate-check and qualify candidates.",
        },
      };
    } catch (error) {
      return { ok: false, tool: this.name, error: error instanceof Error ? error.message : "Web research failed" };
    }
  },
};

const hunterEnrichProspect: NovaTool = {
  name: "hunter_enrich_prospect",
  description: "Deeply research one public prospect, extract company/contact/social/service evidence, and deterministically match the research to Rollvento products. Never contacts the prospect.",
  risk: "read",
  requiresApproval: false,
  async execute(input) {
    const p = (input ?? {}) as {
      companyName?: string;
      website?: string;
      location?: string;
      requirement?: string;
      productHint?: string;
    };
    const companyName = p.companyName?.trim();
    if (!companyName) return { ok: false, tool: this.name, error: "companyName is required" };

    const query = [
      `"${companyName}"`,
      p.location?.trim(),
      p.productHint?.trim(),
      "company website products services contact distributor installer automation",
    ].filter(Boolean).join(" ");

    try {
      const results = await tavilySearch(query, 8);
      const sources = results.map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        content: item.content ?? "",
        score: typeof item.score === "number" ? item.score : null,
      }));
      const combinedEvidence = sources.map((item) => item.content).join(" ");
      const productQuery = [p.requirement, p.productHint, combinedEvidence].filter(Boolean).join(" ");
      const rollventoFit = productQuery ? matchProductsToEnquiry({
        productHint: productQuery,
        category: null,
        mentionedModel: null,
        requiredCapacityKg: null,
        specifications: [],
      }) : null;
      const urls = sources.map((item) => item.url).filter(Boolean);
      return {
        ok: true,
        tool: this.name,
        data: {
          companyName,
          website: p.website ?? sources[0]?.url ?? "",
          location: p.location ?? "",
          researchQuery: query,
          sources,
          socialProfiles: urls.filter((url) => /linkedin\\.com|facebook\\.com|instagram\\.com|youtube\\.com/i.test(url)),
          contactEvidence: sources.filter((item) => /email|phone|contact|whatsapp|@/i.test(item.content)),
          servicesAndSignals: sources.map((item) => item.content).filter(Boolean).slice(0, 6),
          rollventoFit,
          nextStep: "Review enrichment, then submit hunter_create_lead for human approval.",
        },
      };
    } catch (error) {
      return { ok: false, tool: this.name, error: error instanceof Error ? error.message : "Prospect enrichment failed" };
    }
  },
};

const hunterQualify: NovaTool = {
  name: "hunter_qualify_prospect",
  description: "Qualify a researched prospect against explicit evidence and business-fit signals without contacting the prospect.",
  risk: "read",
  requiresApproval: false,
  async execute(input) {
    const p = (input ?? {}) as HunterProspect;
    if (!p.companyName?.trim()) return { ok: false, tool: this.name, error: "companyName is required" };

    const signals = [
      p.website ? "website identified" : "",
      p.location ? "location identified" : "",
      p.requirement ? "requirement identified" : "",
      p.sourceUrl ? "source evidence supplied" : "",
      p.evidence ? "research evidence supplied" : "",
      p.fitReason ? "fit rationale supplied" : "",
    ].filter(Boolean);

    return {
      ok: true,
      tool: this.name,
      data: {
        companyName: p.companyName,
        qualification: signals.length >= 5 ? "Research-ready" : signals.length >= 3 ? "Needs-more-research" : "Insufficient-evidence",
        signals,
        fitReason: p.fitReason ?? "",
      },
    };
  },
};

const hunterRunCampaign: NovaTool = {
  name: "hunter_run_campaign",
  description: "Run a complete read-only HUNTER campaign: web discovery, candidate normalization, CRM duplicate detection and evidence qualification. No lead is created and no prospect is contacted.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const p = (input ?? {}) as {
      brief?: string;
      geography?: string;
      customerType?: string;
      product?: string;
      intent?: string;
      includeDirectories?: boolean;
      maxResults?: number;
    };

    const brief = [p.brief?.trim(), p.product?.trim(), p.customerType?.trim(), p.geography?.trim()]
      .filter(Boolean).join(" ");

    if (!brief) return { ok: false, tool: this.name, error: "brief, product, customerType, or geography is required" };

    try {
      const intent = readIntent(p.intent);
      const query = buildQuery([brief], intent);

      const raw = await tavilySearch(query, p.maxResults ?? 15);
      const mapped = raw
        .map((item) => normalizeCandidate(item, brief))
        .filter((item): item is HunterProspect => Boolean(item));
      const beforeFilter = mapped.length;
      const candidates = p.includeDirectories
        ? mapped
        : mapped.filter((item) => !isDirectoryUrl(item.sourceUrl ?? item.website ?? ""));

      const duplicates = await findDuplicates(context.ownerId, candidates);

      const qualified = candidates.map((candidate) => {
        const duplicate = duplicates.get(candidate.companyName.toLowerCase());
        const signals = [
          candidate.website,
          candidate.location,
          candidate.requirement,
          candidate.sourceUrl,
          candidate.evidence,
          candidate.fitReason,
        ].filter(Boolean).length;

        return {
          ...candidate,
          qualification: signals >= 5 ? "Research-ready" : signals >= 3 ? "Needs-more-research" : "Insufficient-evidence",
          duplicate: duplicate ? { id: duplicate.id, companyName: duplicate.companyName } : null,
          importable: !duplicate && Boolean(candidate.website || candidate.email || candidate.phone),
        };
      });

      return {
        ok: true,
        tool: this.name,
        data: {
          brief,
          query,
          intent,
          directoriesFiltered: beforeFilter - candidates.length,
          discovered: qualified.length,
          newCandidates: qualified.filter((candidate) => !candidate.duplicate).length,
          candidates: qualified,
          nextStep: "Select candidates and submit hunter_create_lead requests. Lead creation remains approval-gated.",
        },
      };
    } catch (error) {
      return { ok: false, tool: this.name, error: error instanceof Error ? error.message : "HUNTER campaign failed" };
    }
  },
};

const hunterCreateLead: NovaTool = {
  name: "hunter_create_lead",
  description: "Create a CRM lead from a researched prospect after human approval.",
  risk: "write",
  requiresApproval: true,
  async execute(input, context) {
    const p = (input ?? {}) as HunterProspect;
    if (!p.companyName?.trim()) return { ok: false, tool: this.name, error: "companyName is required" };
    if (!p.email?.trim() && !p.phone?.trim() && !p.website?.trim()) {
      return { ok: false, tool: this.name, error: "At least one contact or website identifier is required" };
    }

    const duplicateFilters = [eq(leadsTable.ownerId, context.ownerId)];
    const identityFilters = [];
    if (p.email?.trim()) identityFilters.push(ilike(leadsTable.email, p.email.trim()));
    if (p.phone?.trim()) identityFilters.push(ilike(leadsTable.phone, p.phone.trim()));
    identityFilters.push(ilike(leadsTable.companyName, p.companyName.trim()));
    duplicateFilters.push(or(...identityFilters)!);

    const [duplicate] = await db.select().from(leadsTable).where(and(...duplicateFilters)).limit(1);
    if (duplicate) {
      return { ok: false, tool: this.name, error: `Possible duplicate lead: #${duplicate.id} ${duplicate.companyName}` };
    }

    const notes = [
      p.website ? `Website: ${p.website}` : "",
      p.location ? `Location: ${p.location}` : "",
      p.sourceUrl ? `Source: ${p.sourceUrl}` : "",
      p.evidence ? `Evidence: ${p.evidence}` : "",
      p.fitReason ? `Fit: ${p.fitReason}` : "",
      p.enrichment ? `Enrichment: ${JSON.stringify(p.enrichment).slice(0, 12000)}` : "",
    ].filter(Boolean).join("\n");

    const [lead] = await db.insert(leadsTable).values({
      ownerId: context.ownerId,
      companyName: p.companyName.trim(),
      contactName: p.contactName?.trim() || "Unknown",
      phone: p.phone?.trim() || "",
      email: p.email?.trim() || "",
      source: "Other",
      requirement: p.requirement?.trim() || "",
      estimatedValue: "0",
      status: "New",
      notes,
    }).returning();

    return { ok: true, tool: this.name, data: lead };
  },
};

export const hunterNovaTools: NovaTool[] = [
  hunterSearch,
  hunterWebResearch,
  hunterEnrichProspect,
  hunterRunCampaign,
  hunterQualify,
  hunterCreateLead,
];
