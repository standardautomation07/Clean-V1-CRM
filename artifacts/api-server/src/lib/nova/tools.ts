import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
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
import type { NovaTool, NovaToolResult } from "./types";

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
  ...commercialNovaTools,
  ...hunterNovaTools,
];

export function getNovaTool(name: string): NovaTool | undefined {
  return novaTools.find((tool) => tool.name === name);
}

export function listNovaTools() {
  return novaTools.map(({ name, description, risk, requiresApproval }) => ({ name, description, risk, requiresApproval }));
}
