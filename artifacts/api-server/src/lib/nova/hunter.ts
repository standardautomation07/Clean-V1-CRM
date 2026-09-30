import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
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
};

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

const hunterQualify: NovaTool = {
  name: "hunter_qualify_prospect",
  description: "Score a researched prospect against explicit business-fit criteria without contacting the prospect.",
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
    ].filter(Boolean);
    return {
      ok: true,
      tool: this.name,
      data: {
        companyName: p.companyName,
        qualification: signals.length >= 4 ? "Research-ready" : signals.length >= 2 ? "Needs-more-research" : "Insufficient-evidence",
        signals,
        fitReason: p.fitReason ?? "",
      },
    };
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

export const hunterNovaTools: NovaTool[] = [hunterSearch, hunterQualify, hunterCreateLead];
