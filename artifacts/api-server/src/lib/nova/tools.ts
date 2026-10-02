import { and, desc, eq, ilike, or } from "drizzle-orm";
import { activitiesTable, db, leadsTable, quotationsTable, whatsappMessagesTable } from "@workspace/db";
import {
  getProductByModel,
  matchProductsToEnquiry,
  searchRollventoProducts,
  type MatchRequest,
  type ProductCategory,
} from "../knowledge/products";
import { calculateQuotation, type QuotationItemInput } from "../quotations/calc";
import { commercialNovaTools } from "./commercial";
import { hunterNovaTools } from "./hunter";
import { mapsNovaTools } from "./maps";
import { outreachNovaTools } from "./outreach";
import type { NovaTool, NovaToolResult } from "./types";

function money(value: string | number): number { return Number(value); }

function ok<T>(tool: string, data: T): NovaToolResult<T> {
  return { ok: true, tool, data };
}

function fail(tool: string, error: string): NovaToolResult {
  return { ok: false, tool, error };
}

const searchProducts: NovaTool = {
  name: "search_products",
  description: "Search the Rollvento product catalogue using deterministic catalogue data.",
  risk: "read",
  requiresApproval: false,
  async execute(input) {
    const value = (input ?? {}) as { query?: string; category?: ProductCategory; minCapacityKg?: number; limit?: number };
    return ok(this.name, searchRollventoProducts(value));
  },
};

const getProduct: NovaTool = {
  name: "get_product",
  description: "Get one exact Rollvento product by model.",
  risk: "read",
  requiresApproval: false,
  async execute(input) {
    const model = String((input as { model?: string } | undefined)?.model ?? "").trim();
    if (!model) return fail(this.name, "model is required");
    return ok(this.name, getProductByModel(model) ?? null);
  },
};

const matchRequirement: NovaTool = {
  name: "match_requirement",
  description: "Deterministically match a customer requirement to catalogue products and return missing questions.",
  risk: "read",
  requiresApproval: false,
  async execute(input) {
    const value = (input ?? {}) as MatchRequest;
    if (!value.productHint) return fail(this.name, "productHint is required");
    return ok(this.name, matchProductsToEnquiry(value));
  },
};

const listLeads: NovaTool = {
  name: "list_leads",
  description: "Search leads owned by the authenticated CRM user.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const value = (input ?? {}) as { search?: string; status?: string; limit?: number };
    const filters = [eq(leadsTable.ownerId, context.ownerId)];
    if (value.status) filters.push(eq(leadsTable.status, value.status as never));
    if (value.search?.trim()) {
      const q = `%${value.search.trim()}%`;
      filters.push(or(ilike(leadsTable.companyName, q), ilike(leadsTable.contactName, q), ilike(leadsTable.email, q))!);
    }
    const rows = await db.select().from(leadsTable).where(and(...filters)).orderBy(desc(leadsTable.createdAt)).limit(Math.min(value.limit ?? 25, 100));
    return ok(this.name, rows.map((lead) => ({ ...lead, estimatedValue: Number(lead.estimatedValue) })));
  },
};

const getLead: NovaTool = {
  name: "get_lead",
  description: "Get one CRM lead by ID, scoped to the authenticated user.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const id = Number((input as { id?: number | string } | undefined)?.id);
    if (!Number.isInteger(id) || id <= 0) return fail(this.name, "valid lead id is required");
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, id), eq(leadsTable.ownerId, context.ownerId)));
    if (!lead) return fail(this.name, "Lead not found");
    return ok(this.name, { ...lead, estimatedValue: Number(lead.estimatedValue) });
  },
};


const salesQualifyEnquiry: NovaTool = {
  name: "sales_qualify_enquiry",
  description: "Qualify a customer requirement using deterministic Rollvento product matching and return the information still needed before quotation.",
  risk: "read",
  requiresApproval: false,
  async execute(input) {
    const value = (input ?? {}) as { requirement?: string };
    const requirement = value.requirement?.trim();
    if (!requirement) return fail(this.name, "requirement is required");

    const match = matchProductsToEnquiry({
      productHint: requirement,
      category: null,
      mentionedModel: null,
      requiredCapacityKg: null,
      specifications: [],
    });

    return ok(this.name, {
      requirement,
      category: match.category,
      candidates: match.candidates,
      questions: match.questions,
      unknownModel: match.unknownModel,
      noMatchReason: match.noMatchReason,
      readyForQuotation: match.candidates.length === 1 && match.questions.length === 0,
      nextStep: match.questions.length ? "Collect the missing requirement details before preparing a quotation." : "Confirm the exact model and commercial price before requesting quotation creation.",
    });
  },
};

const salesPrepareQuotation: NovaTool = {
  name: "sales_prepare_quotation",
  description: "Prepare a quotation package from a CRM lead and customer requirement. Uses only exact Rollvento catalogue models; does not write a quotation or invent pricing.",
  risk: "financial",
  requiresApproval: false,
  async execute(input, context) {
    const value = (input ?? {}) as {
      leadId?: number;
      requirement?: string;
      productModel?: string;
      quantity?: number;
      unitPrice?: number;
      discount?: number;
      taxRate?: number;
    };
    const leadId = Number(value.leadId);
    if (!Number.isInteger(leadId) || leadId <= 0) return fail(this.name, "valid leadId is required");
    if (!value.requirement?.trim() && !value.productModel?.trim()) return fail(this.name, "requirement or productModel is required");

    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.ownerId, context.ownerId)));
    if (!lead) return fail(this.name, "Lead not found");

    let product = value.productModel ? getProductByModel(value.productModel) : undefined;
    const qualification = value.requirement ? matchProductsToEnquiry({
      productHint: value.requirement,
      category: null,
      mentionedModel: null,
      requiredCapacityKg: null,
      specifications: [],
    }) : null;

    if (!product && qualification?.candidates.length === 1) product = qualification.candidates[0].product;
    if (!product) {
      return ok(this.name, {
        lead: { id: lead.id, companyName: lead.companyName, contactName: lead.contactName },
        qualification,
        readyForQuotation: false,
        reason: "An exact catalogue model could not be selected yet.",
      });
    }

    if (!Number.isFinite(value.quantity) || Number(value.quantity) <= 0) {
      return ok(this.name, {
        lead: { id: lead.id, companyName: lead.companyName, contactName: lead.contactName },
        product: { model: product.model, productName: product.productName, category: product.category },
        qualification,
        readyForQuotation: false,
        missing: ["quantity"],
      });
    }

    if (!Number.isFinite(value.unitPrice) || Number(value.unitPrice) < 0) {
      return ok(this.name, {
        lead: { id: lead.id, companyName: lead.companyName, contactName: lead.contactName },
        product: { model: product.model, productName: product.productName, category: product.category },
        qualification,
        readyForQuotation: false,
        missing: ["unitPrice"],
        note: "Unit price must be supplied by an authorized user; NOVA never invents commercial pricing.",
      });
    }

    const item: QuotationItemInput = {
      productModel: product.model,
      productName: product.productName,
      quantity: Number(value.quantity),
      unit: "Nos",
      unitPrice: Number(value.unitPrice),
      discount: Number.isFinite(value.discount) ? Number(value.discount) : 0,
    };
    const calculation = calculateQuotation([item], Number.isFinite(value.taxRate) ? Number(value.taxRate) : 18);

    return ok(this.name, {
      lead: { id: lead.id, companyName: lead.companyName, contactName: lead.contactName, phone: lead.phone, email: lead.email },
      product: { model: product.model, productName: product.productName, category: product.category },
      qualification,
      item,
      calculation,
      readyForQuotation: true,
      nextStep: "Submit create_quotation with this exact item for approval.",
    });
  },
};


const prepareWhatsappQuotationMessage: NovaTool = {
  name: "prepare_whatsapp_quotation_message",
  description: "Prepare a customer-ready WhatsApp quotation message from an owned quotation. Does not send anything.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const quotationId = Number((input as { quotationId?: number } | undefined)?.quotationId);
    if (!Number.isInteger(quotationId) || quotationId <= 0) return fail(this.name, "valid quotationId is required");
    const [quotation] = await db.select().from(quotationsTable).where(and(eq(quotationsTable.id, quotationId), eq(quotationsTable.ownerId, context.ownerId)));
    if (!quotation) return fail(this.name, "Quotation not found");
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, quotation.leadId), eq(leadsTable.ownerId, context.ownerId)));
    if (!lead) return fail(this.name, "Lead not found");
    if (!lead.phone.trim()) return fail(this.name, "Lead has no phone number");
    return ok(this.name, {
      leadId: lead.id,
      phone: lead.phone,
      customerName: lead.contactName || lead.companyName,
      quotationNumber: quotation.quotationNumber,
      total: money(quotation.total),
      message: [
        `Dear ${lead.contactName || lead.companyName},`,
        "",
        `Please find quotation ${quotation.quotationNumber} from Rollvento Automation for your requirement.`,
        "",
        `Quotation value: INR ${money(quotation.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        "",
        "We can share the quotation PDF and assist with any technical or commercial questions.",
        "",
        "Regards,",
        "Rollvento Automation",
      ].join("\n"),
      pdfPath: `/api/quotations/${quotation.id}/pdf`,
    });
  },
};

/** Minimal shape of the Meta Graph API message response we rely on. */
interface GraphMessageResponse {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
}

const sendWhatsappText: NovaTool = {
  name: "send_whatsapp_text",
  description: "Send an approved WhatsApp text message through Meta WhatsApp Cloud API. Requires human approval and WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID.",
  risk: "external",
  requiresApproval: true,
  async execute(input, context) {
    const value = (input ?? {}) as { leadId?: number; phone?: string; message?: string; quotationId?: number };
    const leadId = Number(value.leadId);
    const message = value.message?.trim();
    if (!Number.isInteger(leadId) || leadId <= 0) return fail(this.name, "valid leadId is required");
    if (!message) return fail(this.name, "message is required");
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.ownerId, context.ownerId)));
    if (!lead) return fail(this.name, "Lead not found");
    const phone = (value.phone?.trim() || lead.phone.trim()).replace(/[^\d+]/g, "");
    if (!phone) return fail(this.name, "Lead has no phone number");
    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!token || !phoneNumberId) return fail(this.name, "WhatsApp Cloud API is not configured on the server");
    const version = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0";
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { preview_url: true, body: message } }),
    });
    const payload = (await response.json().catch(() => ({}))) as GraphMessageResponse;
    const messageId = String(payload?.messages?.[0]?.id ?? `failed-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await db.insert(whatsappMessagesTable).values({
      ownerId: context.ownerId, leadId, direction: "Outbound",
      status: response.ok ? "Sent" : "Failed", waMessageId: messageId,
      phone, messageType: "text", body: message, payload,
    });
    if (!response.ok) {
      const reason = String(payload?.error?.message ?? response.statusText);
      await db.insert(activitiesTable).values({
        leadId, createdBy: context.ownerId, type: "WhatsApp",
        description: `NOVA WhatsApp message to ${phone} failed: ${reason.slice(0, 400)}`,
      });
      return fail(this.name, `WhatsApp API error: ${reason}`);
    }
    await db.insert(activitiesTable).values({
      leadId, createdBy: context.ownerId, type: "WhatsApp",
      description: `NOVA sent WhatsApp message to ${phone}.${value.quotationId ? ` Quotation ${value.quotationId} referenced.` : ""}`,
    });
    return ok(this.name, { leadId, phone, messageId: payload?.messages?.[0]?.id ?? messageId, provider: "Meta WhatsApp Cloud API" });
  },
};

const scheduleSalesFollowup: NovaTool = {
  name: "schedule_sales_followup",
  description: "Set the next follow-up date for an owned lead and record the follow-up activity. Requires human approval.",
  risk: "write",
  requiresApproval: true,
  async execute(input, context) {
    const value = (input ?? {}) as { leadId?: number; date?: string; note?: string };
    const leadId = Number(value.leadId);
    if (!Number.isInteger(leadId) || leadId <= 0) return fail(this.name, "valid leadId is required");
    if (!value.date || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return fail(this.name, "date must be YYYY-MM-DD");
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.ownerId, context.ownerId)));
    if (!lead) return fail(this.name, "Lead not found");
    const [updated] = await db.update(leadsTable).set({ nextFollowUp: value.date, updatedAt: new Date() }).where(and(eq(leadsTable.id, leadId), eq(leadsTable.ownerId, context.ownerId))).returning();
    await db.insert(activitiesTable).values({ leadId, createdBy: context.ownerId, type: "FollowUp", description: `NOVA scheduled follow-up for ${value.date}.${value.note ? ` ${value.note}` : ""}` });
    return ok(this.name, { leadId: updated.id, nextFollowUp: updated.nextFollowUp });
  },
};


const understandWhatsappReply: NovaTool = {
  name: "understand_whatsapp_reply",
  description: "Interpret an inbound WhatsApp reply for an owned lead using CRM and catalogue context. Returns a suggested next action but never sends or changes financial data.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const value = (input ?? {}) as { leadId?: number; message?: string };
    const leadId = Number(value.leadId);
    const message = value.message?.trim();
    if (!Number.isInteger(leadId) || leadId <= 0) return fail(this.name, "valid leadId is required");
    if (!message) return fail(this.name, "message is required");
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.ownerId, context.ownerId)));
    if (!lead) return fail(this.name, "Lead not found");

    const lower = message.toLowerCase();
    const asksForPrice = /price|cost|rate|quotation|quote|offer|price list/.test(lower);
    const accepts = /accept|approved|confirm|confirmed|proceed|go ahead|place order/.test(lower);
    const asksTechnical = /technical|specification|spec|load|capacity|dimension|voltage|warranty|datasheet|manual/.test(lower);
    const needsHuman = /call me|speak|sales person|human|manager|urgent|complaint|problem|issue/.test(lower);

    const match = matchProductsToEnquiry({
      productHint: message,
      category: null,
      mentionedModel: null,
      requiredCapacityKg: null,
      specifications: [],
    });

    const suggestedAction = needsHuman ? "human_followup" : accepts ? "sales_order_review" : asksForPrice ? "quotation_review" : asksTechnical ? "technical_review" : match.candidates.length ? "product_clarification" : "human_followup";

    return ok(this.name, {
      lead: { id: lead.id, companyName: lead.companyName, contactName: lead.contactName, requirement: lead.requirement, status: lead.status },
      message,
      intent: { asksForPrice, accepts, asksTechnical, needsHuman },
      productMatch: match,
      suggestedAction,
      autoReplyAllowed: false,
      note: "Inbound interpretation is advisory. External replies, quotation changes and order actions remain approval-gated.",
    });
  },
};

const draftWhatsappReply: NovaTool = {
  name: "draft_whatsapp_reply",
  description: "Create a deterministic WhatsApp reply draft from an inbound message and NOVA interpretation. Read-only; never sends.",
  risk: "read",
  requiresApproval: false,
  async execute(input, context) {
    const value = (input ?? {}) as { leadId?: number; message?: string };
    const interpretation = await understandWhatsappReply.execute({ leadId: value.leadId, message: value.message }, context);
    if (!interpretation.ok) return interpretation;
    const data = interpretation.data as {
      lead: { id: number; contactName?: string; companyName?: string };
      intent: { asksForPrice: boolean; accepts: boolean; asksTechnical: boolean; needsHuman: boolean };
      productMatch: { candidates?: Array<{ product?: { model?: string; productName?: string } }>; questions?: string[] };
      suggestedAction: string;
    };
    const customer = data.lead.contactName || data.lead.companyName || "there";
    // One acknowledgement for every enquiry. Qualifying happens with a human,
    // so the customer-facing text stays short, branded and identical whatever
    // the message said; the interpretation below still tells the employee what
    // was matched and what to do next. Editable before sending.
    const suggestedReply = `Hi ${customer}, thank you for contacting Rollvento. Our team will reach out to you shortly.`;
    return ok(this.name, { leadId: data.lead.id, suggestedReply, suggestedNextAction: data.suggestedAction, interpretation: data, autoSend: false });
  },
};

const calculateQuotationPreview: NovaTool = {
  name: "calculate_quotation_preview",
  description: "Calculate quotation totals without writing a financial document.",
  risk: "financial",
  requiresApproval: false,
  async execute(input) {
    const value = (input ?? {}) as { items?: QuotationItemInput[]; taxRate?: number };
    if (!Array.isArray(value.items) || value.items.length === 0) return fail(this.name, "at least one quotation item is required");
    const invalid = value.items.find((item) => !item.productModel || !item.productName || !Number.isFinite(item.quantity) || !Number.isFinite(item.unitPrice));
    if (invalid) return fail(this.name, "each item needs productModel, productName, quantity and unitPrice");
    return ok(this.name, calculateQuotation(value.items, Number.isFinite(value.taxRate) ? value.taxRate! : 18));
  },
};

export const novaTools: NovaTool[] = [
  searchProducts,
  getProduct,
  matchRequirement,
  listLeads,
  getLead,
  calculateQuotationPreview,
  salesQualifyEnquiry,
  salesPrepareQuotation,
  prepareWhatsappQuotationMessage,
  sendWhatsappText,
  understandWhatsappReply,
  draftWhatsappReply,
  scheduleSalesFollowup,
  ...commercialNovaTools,
  ...hunterNovaTools,
  ...mapsNovaTools,
  ...outreachNovaTools,
];

export function getNovaTool(name: string): NovaTool | undefined {
  return novaTools.find((tool) => tool.name === name);
}

export function listNovaTools() {
  return novaTools.map(({ name, description, risk, requiresApproval }) => ({ name, description, risk, requiresApproval }));
}
