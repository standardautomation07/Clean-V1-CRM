import { and, asc, eq, like } from "drizzle-orm";
import { activitiesTable, commercialDocumentItemsTable, commercialDocumentsTable, db, leadsTable, quotationItemsTable, quotationsTable } from "@workspace/db";
import { calculateQuotation, type QuotationItemInput } from "../quotations/calc";
import { getProductByModel } from "../knowledge/products";
import type { NovaTool, NovaToolResult } from "./types";

const money = (value: string | number) => Number(value);
const year = () => new Date().getFullYear();
const fail = (tool: string, error: string): NovaToolResult => ({ ok: false, tool, error });

async function nextQuotationNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const prefix = `RV-${year()}-`;
  const existing = await tx.select({ number: quotationsTable.quotationNumber }).from(quotationsTable).where(like(quotationsTable.quotationNumber, `${prefix}%`));
  let max = 0;
  for (const row of existing) { const n = Number(row.number.slice(prefix.length)); if (Number.isInteger(n)) max = Math.max(max, n); }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

async function nextDocumentNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], type: "SalesOrder" | "DeliveryChallan" | "Invoice") {
  const prefix = type === "SalesOrder" ? "SO" : type === "DeliveryChallan" ? "DC" : "INV";
  const existing = await tx.select({ number: commercialDocumentsTable.documentNumber }).from(commercialDocumentsTable).where(like(commercialDocumentsTable.documentNumber, `${prefix}-${year()}-%`));
  let max = 0;
  for (const row of existing) { const n = Number(row.number.split("-").at(-1)); if (Number.isInteger(n)) max = Math.max(max, n); }
  return `${prefix}-${year()}-${String(max + 1).padStart(4, "0")}`;
}

const createQuotation: NovaTool = {
  name: "create_quotation",
  description: "Create a Draft quotation for an owned CRM lead using only known catalogue models. Requires human approval.",
  risk: "financial", requiresApproval: true,
  async execute(input, context) {
    const value = (input ?? {}) as { leadId?: number; items?: QuotationItemInput[]; taxRate?: number; validUntil?: string; terms?: string; notes?: string };
    const leadId = Number(value.leadId);
    if (!Number.isInteger(leadId) || leadId <= 0) return fail(this.name, "valid leadId is required");
    if (!Array.isArray(value.items) || !value.items.length) return fail(this.name, "at least one quotation item is required");
    for (const item of value.items) {
      const product = getProductByModel(item.productModel);
      if (!product) return fail(this.name, `Product model ${item.productModel} is not in the Rollvento catalogue`);
      if (item.productName !== product.productName) return fail(this.name, `Product name does not match catalogue model ${item.productModel}`);
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) return fail(this.name, `Invalid quantity for ${item.productModel}`);
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) return fail(this.name, `Invalid unit price for ${item.productModel}`);
      if (!Number.isFinite(item.discount) || item.discount < 0 || item.discount > 100) return fail(this.name, `Invalid discount for ${item.productModel}`);
    }
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.ownerId, context.ownerId)));
    if (!lead) return fail(this.name, "Lead not found");
    const calc = calculateQuotation(value.items, Number.isFinite(value.taxRate) ? value.taxRate! : 18);
    const created = await db.transaction(async (tx) => {
      const quotationNumber = await nextQuotationNumber(tx);
      const [row] = await tx.insert(quotationsTable).values({
        ownerId: context.ownerId, leadId, quotationNumber, status: "Draft", currency: "INR",
        subtotal: calc.totals.subtotal.toFixed(2), discount: calc.totals.discount.toFixed(2),
        taxRate: calc.totals.taxRate.toFixed(2), taxAmount: calc.totals.taxAmount.toFixed(2), total: calc.totals.total.toFixed(2),
        validUntil: value.validUntil ?? null, terms: value.terms ?? "", notes: value.notes ?? "",
      }).returning();
      await tx.insert(quotationItemsTable).values(calc.items.map((item, index) => ({
        quotationId: row.id, productModel: item.productModel, productName: item.productName,
        quantity: item.quantity.toFixed(2), unit: item.unit, unitPrice: item.unitPrice.toFixed(2),
        discount: item.discount.toFixed(2), lineTotal: item.lineTotal.toFixed(2), sortOrder: index,
      })));
      await tx.insert(activitiesTable).values({ leadId, createdBy: context.ownerId, type: "QuotationDrafted", description: `NOVA drafted quotation ${quotationNumber} for INR ${calc.totals.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}.` });
      return row;
    });
    return { ok: true, tool: this.name, data: { id: created.id, quotationNumber: created.quotationNumber, status: created.status, total: money(created.total), leadId: created.leadId } };
  },
};

const generateQuotation: NovaTool = {
  name: "generate_quotation",
  description: "Finalize an owned Draft quotation as Generated so its official quotation PDF can be issued. Requires human approval.",
  risk: "financial",
  requiresApproval: true,
  async execute(input, context) {
    const quotationId = Number((input as { quotationId?: number } | undefined)?.quotationId);
    if (!Number.isInteger(quotationId) || quotationId <= 0) return fail(this.name, "valid quotationId is required");
    const [quotation] = await db.select().from(quotationsTable).where(and(eq(quotationsTable.id, quotationId), eq(quotationsTable.ownerId, context.ownerId)));
    if (!quotation) return fail(this.name, "Quotation not found");
    if (quotation.status !== "Draft") return fail(this.name, `Quotation is already ${quotation.status}`);
    const items = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, quotation.id));
    if (!items.length) return fail(this.name, "Quotation has no items");
    const [updated] = await db.update(quotationsTable).set({ status: "Generated", updatedAt: new Date() }).where(and(eq(quotationsTable.id, quotation.id), eq(quotationsTable.ownerId, context.ownerId))).returning();
    await db.insert(activitiesTable).values({
      leadId: quotation.leadId,
      createdBy: context.ownerId,
      type: "Quotation",
      description: `Quotation ${updated.quotationNumber} generated for INR ${money(updated.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}.`,
    });
    return {
      ok: true,
      tool: this.name,
      data: {
        id: updated.id,
        quotationNumber: updated.quotationNumber,
        status: updated.status,
        total: money(updated.total),
        pdfPath: `/api/quotations/${updated.id}/pdf`,
      },
    };
  },
};

const createSalesOrder: NovaTool = {
  name: "create_sales_order", description: "Create a Sales Order from an owned generated quotation. Requires human approval.",
  risk: "financial", requiresApproval: true,
  async execute(input, context) {
    const quotationId = Number((input as { quotationId?: number } | undefined)?.quotationId);
    if (!Number.isInteger(quotationId) || quotationId <= 0) return fail(this.name, "valid quotationId is required");
    const [quotation] = await db.select().from(quotationsTable).where(and(eq(quotationsTable.id, quotationId), eq(quotationsTable.ownerId, context.ownerId)));
    if (!quotation) return fail(this.name, "Quotation not found");
    if (quotation.status !== "Generated") return fail(this.name, "Only a generated quotation can become a Sales Order");
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, quotation.leadId), eq(leadsTable.ownerId, context.ownerId)));
    if (!lead) return fail(this.name, "Lead not found");
    const created = await db.transaction(async (tx) => {
      const documentNumber = await nextDocumentNumber(tx, "SalesOrder");
      const [document] = await tx.insert(commercialDocumentsTable).values({
        ownerId: context.ownerId, leadId: lead.id, documentType: "SalesOrder", documentNumber, status: "Approved", referenceDocumentId: quotation.id,
        customerSnapshot: { companyName: lead.companyName, contactName: lead.contactName, phone: lead.phone, email: lead.email },
        totals: { subtotal: money(quotation.subtotal), discount: money(quotation.discount), taxAmount: money(quotation.taxAmount), total: money(quotation.total), currency: quotation.currency },
        taxDetails: { taxRate: money(quotation.taxRate) }, notes: quotation.notes,
      }).returning();
      const items = await tx.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, quotation.id)).orderBy(asc(quotationItemsTable.sortOrder));
      if (!items.length) throw new Error("Quotation has no items");
      await tx.insert(commercialDocumentItemsTable).values(items.map((item, index) => ({ documentId: document.id, productModel: item.productModel, productName: item.productName, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, discount: item.discount, lineTotal: item.lineTotal, sortOrder: index })));
      await tx.insert(activitiesTable).values({ leadId: lead.id, createdBy: context.ownerId, type: "SalesOrderCreated", description: `NOVA created Sales Order ${documentNumber} from quotation ${quotation.quotationNumber}.` });
      return document;
    });
    return { ok: true, tool: this.name, data: { id: created.id, documentNumber: created.documentNumber, status: created.status } };
  },
};

const createDeliveryChallan: NovaTool = {
  name: "create_delivery_challan", description: "Create a Delivery Challan from an owned Sales Order. Requires human approval.",
  risk: "financial", requiresApproval: true,
  async execute(input, context) {
    const salesOrderId = Number((input as { salesOrderId?: number } | undefined)?.salesOrderId);
    if (!Number.isInteger(salesOrderId) || salesOrderId <= 0) return fail(this.name, "valid salesOrderId is required");
    const [order] = await db.select().from(commercialDocumentsTable).where(and(eq(commercialDocumentsTable.id, salesOrderId), eq(commercialDocumentsTable.ownerId, context.ownerId), eq(commercialDocumentsTable.documentType, "SalesOrder")));
    if (!order) return fail(this.name, "Sales Order not found");
    if (order.status !== "Approved" && order.status !== "Issued") return fail(this.name, "Sales Order must be approved before creating a Delivery Challan");
    const created = await db.transaction(async (tx) => {
      const documentNumber = await nextDocumentNumber(tx, "DeliveryChallan");
      const [document] = await tx.insert(commercialDocumentsTable).values({
        ownerId: context.ownerId, leadId: order.leadId, documentType: "DeliveryChallan", documentNumber, status: "Issued", referenceDocumentId: order.id,
        customerSnapshot: order.customerSnapshot, totals: order.totals, taxDetails: order.taxDetails,
        logistics: (input as { logistics?: Record<string, unknown> } | undefined)?.logistics ?? {}, notes: order.notes,
      }).returning();
      const items = await tx.select().from(commercialDocumentItemsTable).where(eq(commercialDocumentItemsTable.documentId, order.id)).orderBy(asc(commercialDocumentItemsTable.sortOrder));
      if (!items.length) throw new Error("Sales Order has no items");
      await tx.insert(commercialDocumentItemsTable).values(items.map((item, index) => ({ documentId: document.id, productModel: item.productModel, productName: item.productName, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, discount: item.discount, lineTotal: item.lineTotal, sortOrder: index })));
      await tx.insert(activitiesTable).values({ leadId: order.leadId, createdBy: context.ownerId, type: "DeliveryChallanCreated", description: `NOVA created Delivery Challan ${documentNumber} from Sales Order ${order.documentNumber}.` });
      return document;
    });
    return { ok: true, tool: this.name, data: { id: created.id, documentNumber: created.documentNumber, status: created.status } };
  },
};

const createInvoice: NovaTool = {
  name: "create_invoice", description: "Create an Invoice from an owned Delivery Challan. Requires human approval.",
  risk: "financial", requiresApproval: true,
  async execute(input, context) {
    const challanId = Number((input as { challanId?: number } | undefined)?.challanId);
    if (!Number.isInteger(challanId) || challanId <= 0) return fail(this.name, "valid challanId is required");
    const [challan] = await db.select().from(commercialDocumentsTable).where(and(eq(commercialDocumentsTable.id, challanId), eq(commercialDocumentsTable.ownerId, context.ownerId), eq(commercialDocumentsTable.documentType, "DeliveryChallan")));
    if (!challan) return fail(this.name, "Delivery Challan not found");
    if (challan.status !== "Issued") return fail(this.name, "Delivery Challan must be issued before creating an Invoice");
    const created = await db.transaction(async (tx) => {
      const documentNumber = await nextDocumentNumber(tx, "Invoice");
      const [document] = await tx.insert(commercialDocumentsTable).values({
        ownerId: context.ownerId, leadId: challan.leadId, documentType: "Invoice", documentNumber, status: "Issued", referenceDocumentId: challan.id,
        customerSnapshot: challan.customerSnapshot, totals: challan.totals, taxDetails: challan.taxDetails, logistics: challan.logistics, notes: challan.notes,
      }).returning();
      const items = await tx.select().from(commercialDocumentItemsTable).where(eq(commercialDocumentItemsTable.documentId, challan.id)).orderBy(asc(commercialDocumentItemsTable.sortOrder));
      if (!items.length) throw new Error("Delivery Challan has no items");
      await tx.insert(commercialDocumentItemsTable).values(items.map((item, index) => ({ documentId: document.id, productModel: item.productModel, productName: item.productName, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, discount: item.discount, lineTotal: item.lineTotal, sortOrder: index })));
      await tx.insert(activitiesTable).values({ leadId: challan.leadId, createdBy: context.ownerId, type: "InvoiceCreated", description: `NOVA created Invoice ${documentNumber} from Delivery Challan ${challan.documentNumber}.` });
      return document;
    });
    return { ok: true, tool: this.name, data: { id: created.id, documentNumber: created.documentNumber, status: created.status } };
  },
};

export const commercialNovaTools: NovaTool[] = [createQuotation, generateQuotation, createSalesOrder, createDeliveryChallan, createInvoice];
