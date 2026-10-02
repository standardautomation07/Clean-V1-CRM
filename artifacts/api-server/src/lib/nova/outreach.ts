import { and, desc, eq } from "drizzle-orm";
import { activitiesTable, db, leadsTable, outreachEmailsTable } from "@workspace/db";
import { getRollventoBrand, matchProductsToEnquiry } from "../knowledge/products";
import type { NovaTool, NovaToolResult } from "./types";

// Prospecting email. The text is a fixed branded template, not model-written:
// a cold intro is the first thing a prospect reads, so it must never make a
// claim nobody authorised. The AI's part is finding and qualifying the
// prospect; what gets said is deterministic. Prices are never included.

function ok<T>(tool: string, data: T): NovaToolResult<T> {
  return { ok: true, tool, data };
}

function fail(tool: string, error: string): NovaToolResult {
  return { ok: false, tool, error };
}

interface EmailDraft {
  subject: string;
  body: string;
  toEmail: string;
  matchedModels: string[];
}

/** Company footer from configuration. Anything unset is simply left out. */
function companyLines(): string[] {
  const brand = getRollventoBrand();
  return [
    brand.legalName ?? "Rollvento Automation",
    process.env.ROLLVENTO_COMPANY_ADDRESS?.trim(),
    process.env.ROLLVENTO_PHONE?.trim() ? `Phone: ${process.env.ROLLVENTO_PHONE!.trim()}` : undefined,
    process.env.ROLLVENTO_EMAIL?.trim() ? `Email: ${process.env.ROLLVENTO_EMAIL!.trim()}` : undefined,
    process.env.ROLLVENTO_WEBSITE?.trim(),
  ].filter((line): line is string => Boolean(line));
}

export function buildProspectEmail(lead: {
  companyName: string;
  contactName: string;
  email: string;
  requirement: string;
}): EmailDraft {
  const brand = getRollventoBrand();
  // Legal names often already end in a period ("... PVT. LTD."), which would
  // otherwise produce a double full stop mid-sentence.
  const company = (brand.legalName ?? "Rollvento Automation").replace(/\.+$/, "");
  const greeting = lead.contactName?.trim() || lead.companyName?.trim() || "there";

  // Only models the catalogue actually matched; never an invented product.
  const match = matchProductsToEnquiry({
    productHint: lead.requirement || lead.companyName,
    category: null,
    mentionedModel: null,
    requiredCapacityKg: null,
    specifications: [],
  });
  const matchedModels = (match.candidates ?? [])
    .slice(0, 3)
    .map((c) => c.product?.model)
    .filter((m): m is string => Boolean(m));

  const productLines = matchedModels.length
    ? ["", "Based on your line of work, these may be relevant:", ...matchedModels.map((m) => `• ${m}`)]
    : [];

  const body = [
    `Hello ${greeting},`,
    "",
    `I am writing from ${company}. We manufacture and supply gate, shutter and door automation — rolling shutter motors, sliding and swing gate motors, boom barriers and the related controls and accessories.`,
    ...productLines,
    "",
    "If you fit, service or specify these products, I would be glad to share our catalogue and dealer terms. Happy to send technical details for anything specific you are working on.",
    "",
    "If this is not relevant, reply with STOP and we will not contact you again.",
    "",
    "Regards,",
    ...companyLines(),
  ].join("\n");

  return {
    subject: `${company} — gate and shutter automation supply`,
    body,
    toEmail: lead.email.trim(),
    matchedModels,
  };
}

async function ownedLead(leadId: number, ownerId: string) {
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.ownerId, ownerId)));
  return lead ?? null;
}

const draftProspectEmail: NovaTool = {
  name: "draft_prospect_email",
  description: "Draft a deterministic introduction email for an owned lead, listing only catalogue products. Read-only; never sends and never includes prices.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const leadId = Number((input as { leadId?: number } | undefined)?.leadId);
    if (!Number.isInteger(leadId) || leadId <= 0) return fail(this.name, "valid leadId is required");
    const lead = await ownedLead(leadId, context.ownerId);
    if (!lead) return fail(this.name, "Lead not found");
    if (!lead.email.trim()) return fail(this.name, "Lead has no email address");

    const draft = buildProspectEmail(lead);
    const [last] = await db
      .select({ sentAt: outreachEmailsTable.sentAt, status: outreachEmailsTable.status })
      .from(outreachEmailsTable)
      .where(eq(outreachEmailsTable.leadId, leadId))
      .orderBy(desc(outreachEmailsTable.sentAt))
      .limit(1);

    return ok(this.name, {
      leadId,
      ...draft,
      alreadyContacted: Boolean(last),
      lastContactedAt: last?.sentAt ?? null,
      autoSend: false,
      note: "Editable before sending. Sending requires human approval.",
    });
  },
};

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
}

const sendProspectEmail: NovaTool = {
  name: "send_prospect_email",
  description: "Send an approved introduction email to an owned lead. Requires human approval and RESEND_API_KEY plus OUTREACH_FROM_EMAIL.",
  risk: "external",
  requiresApproval: true,
  async execute(input, context) {
    const value = (input ?? {}) as { leadId?: number; subject?: string; body?: string };
    const leadId = Number(value.leadId);
    if (!Number.isInteger(leadId) || leadId <= 0) return fail(this.name, "valid leadId is required");
    const lead = await ownedLead(leadId, context.ownerId);
    if (!lead) return fail(this.name, "Lead not found");

    const toEmail = lead.email.trim();
    if (!toEmail) return fail(this.name, "Lead has no email address");

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.OUTREACH_FROM_EMAIL?.trim();
    if (!apiKey || !fromEmail) return fail(this.name, "Email outreach is not configured on the server (RESEND_API_KEY, OUTREACH_FROM_EMAIL)");
    const fromName = process.env.OUTREACH_FROM_NAME?.trim() || getRollventoBrand().legalName || "Rollvento Automation";
    const replyTo = process.env.OUTREACH_REPLY_TO?.trim();

    const fallback = buildProspectEmail(lead);
    const subject = value.subject?.trim() || fallback.subject;
    const body = value.body?.trim() || fallback.body;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [toEmail],
        subject,
        text: body,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as ResendResponse;

    await db.insert(outreachEmailsTable).values({
      ownerId: context.ownerId,
      leadId,
      toEmail,
      fromEmail,
      subject,
      body,
      status: response.ok ? "Sent" : "Failed",
      providerMessageId: payload.id ?? null,
      error: response.ok ? "" : String(payload.message ?? response.statusText).slice(0, 2000),
    });

    if (!response.ok) {
      const reason = String(payload.message ?? response.statusText);
      await db.insert(activitiesTable).values({
        leadId,
        createdBy: context.ownerId,
        type: "Email",
        description: `Introduction email to ${toEmail} failed: ${reason.slice(0, 400)}`,
      });
      return fail(this.name, `Email provider error: ${reason}`);
    }

    await db.insert(activitiesTable).values({
      leadId,
      createdBy: context.ownerId,
      type: "Email",
      description: `Introduction email sent to ${toEmail}.`,
    });

    return ok(this.name, { leadId, toEmail, subject, providerMessageId: payload.id ?? null, provider: "Resend" });
  },
};

export const outreachNovaTools: NovaTool[] = [draftProspectEmail, sendProspectEmail];
