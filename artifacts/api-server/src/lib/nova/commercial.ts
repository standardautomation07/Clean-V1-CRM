import { and, asc, eq, like } from "drizzle-orm";
import {
  commercialDocumentItemsTable,
  commercialDocumentsTable,
  db,
  leadsTable,
  quotationItemsTable,
  quotationsTable,
} from "@workspace/db";
import type { NovaTool, NovaToolResult } from "./types";

type DocumentType = "SalesOrder" | "DeliveryChallan" | "Invoice";

const money = (value: string | number) => Number(value);
const year = () => new Date().getFullYear();

async function nextDocumentNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], type: DocumentType): Promise<string> {
  const prefix = type === "SalesOrder" ? "SO" : type === "DeliveryChallan" ? "DC" : "INV";
  const existing = await tx.select({ number: commercialDocumentsTable.documentNumber })
    .from(commercialDocumentsTable)
    .where(like(commercialDocumentsTable.documentNumber, `${prefix}-${year()}-%`));
  let max = 0;
  for (const row of existing) {
    const n = Number(row.number.split("-").at(-1));
    if (Number.isInteger(n)) max = Math.max(max, n);
  }
  return `${prefix}-${year()}-${String(max + 1).padStart(4, "0")}`;
}

async function copyItems(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], sourceId: number, targetId: number) {
  const items = await tx.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, sourceId)).orderBy(asc(quotationItemsTable.sortOrder));
  await tx.insert(commercialDocumentItemsTable).values(items.map((item, index) => ({
    documentId: targetId,
    productModel: item.productModel,
    productName: item.productName,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    discount: item.discount,
    lineTotal: item.lineTotal,
    sortOrder: index,
  })));
  return items.length;
}

function pending(tool: string): NovaToolResult {
  return { ok: false, tool, requiresApproval: true, error: "Human approval is required before creating this financial/commercial document." };
}

const createSalesOrder: NovaTool = {
  name: "create_sales_order",
  description: "Create a Sales Order from an owned quotation. Requires human approval.",
  risk: "financial",
  requiresApproval: true,
  async execute(input, context) {
    const quotationId = Number((input as { quotationId?: number } | undefined)?.quotationId);
    if (!Number.isInteger(quotationId) || quotationId <= 0) return { ok: false, tool: this.name, error: "valid quotationId is required" };
    const [quotation] = await db.select().from(quotationsTable).where(and(eq(quotationsTable.id, quotationId), eq(quotationsTable.ownerId, context.ownerId)));
    if (!quotation) return { ok: false, tool: this.name, error: "Quotation not found" };
    if (quotation.status !== "Generated") return { ok: false, tool: this.name, error: "Only a generated quotation can become a Sales Order" };
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, quotation.leadId), eq(leadsTable.ownerId, context.ownerId)));
    if (!lead) return { ok: false, tool: this.name, error: "Lead not found" };

    const created = await db.transaction(async (tx) => {
      const documentNumber = await nextDocumentNumber(tx, "SalesOrder");
      const [document] = await tx.insert(commercialDocumentsTable).values({
        ownerId: context.ownerId,
        leadId: lead.id,
        documentType: "SalesOrder",
        documentNumber,
        status: "Approved",
        referenceDocumentId: quotation.id,
        customerSnapshot: { companyName: lead.companyName, contactName: lead.contactName, phone: lead.phone, email: lead.email },
        totals: { subtotal: money(quotation.subtotal), discount: money(quotation.discount), taxAmount: money(quotation.taxAmount), total: money(quotation.total), currency: quotation.currency },
        taxDetails: { taxRate: money(quotation.taxRate) },
        notes: quotation.notes,
      }).returning();
      const itemCount = await copyItems(tx, quotation.id, document.id);
      return { document, itemCount };
    });
    return { ok: true, tool: this.name, data: { id: created.document.id, documentNumber: created.document.documentNumber, status: created.document.status, itemCount: created.itemCount } };
  },
};

const createDeliveryChallan: NovaTool = {
  name: "create_delivery_challan",
  description: "Create a Delivery Challan from an owned Sales Order. Requires human approval.",
  risk: "financial",
  requiresApproval: true,
  async execute(input, context) {
    const salesOrderId = Number((input as { salesOrderId?: number } | undefined)?.salesOrderId);
    if (!Number.isInteger(salesOrderId) || salesOrderId <= 0) return { ok: false, tool: this.name, error: "valid salesOrderId is required" };
    const [order] = await db.select().from(commercialDocumentsTable).where(and(eq(commercialDocumentsTable.id, salesOrderId), eq(commercialDocumentsTable.ownerId, context.ownerId), eq(commercialDocumentsTable.documentType, "SalesOrder")));
    if (!order) return { ok: false, tool: this.name, error: "Sales Order not found" };
    if (order.status !== "Approved" && order.status !== "Issued") return { ok: false, tool: this.name, error: "Sales Order must be approved before creating a Delivery Challan" };

    const created = await db.transaction(async (tx) => {
      const documentNumber = await nextDocumentNumber(tx, "DeliveryChallan");
      const [document] = await tx.insert(commercialDocumentsTable).values({
        ownerId: context.ownerId,
        leadId: order.leadId,
        documentType: "DeliveryChallan",
        documentNumber,
        status: "Issued",
        referenceDocumentId: order.id,
        customerSnapshot: order.customerSnapshot,
        totals: order.totals,
        taxDetails: order.taxDetails,
        logistics: (input as { logistics?: Record<string, unknown> } | undefined)?.logistics ?? {},
        notes: order.notes,
      }).returning();
      const sourceItems = await tx.select().from(commercialDocumentItemsTable).where(eq(commercialDocumentItemsTable.documentId, order.id)).orderBy(asc(commercialDocumentItemsTable.sortOrder));
      await tx.insert(commercialDocumentItemsTable).values(sourceItems.map((item, index) => ({
        documentId: document.id,
        productModel: item.productModel,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discount: item.discount,
        lineTotal: item.lineTotal,
        sortOrder: index,
      })));
      return document;
    });
    return { ok: true, tool: this.name, data: { id: created.id, documentNumber: created.documentNumber, status: created.status } };
  },
};

const createInvoice: NovaTool = {
  name: "create_invoice",
  description: "Create an Invoice from an owned Delivery Challan. Requires human approval.",
  risk: "financial",
  requiresApproval: true,
  async execute(input, context) {
    const challanId = Number((input as { challanId?: number } | undefined)?.challanId);
    if (!Number.isInteger(challanId) || challanId <= 0) return { ok: false, tool: this.name, error: "valid challanId is required" };
    const [challan] = await db.select().from(commercialDocumentsTable).where(and(eq(commercialDocumentsTable.id, challanId), eq(commercialDocumentsTable.ownerId, context.ownerId), eq(commercialDocumentsTable.documentType, "DeliveryChallan")));
    if (!challan) return { ok: false, tool: this.name, error: "Delivery Challan not found" };
    if (challan.status !== "Issued") return { ok: false, tool: this.name, error: "Delivery Challan must be issued before creating an Invoice" };

    const created = await db.transaction(async (tx) => {
      const documentNumber = await nextDocumentNumber(tx, "Invoice");
      const [document] = await tx.insert(commercialDocumentsTable).values({
        ownerId: context.ownerId,
        leadId: challan.leadId,
        documentType: "Invoice",
        documentNumber,
        status: "Issued",
        referenceDocumentId: challan.id,
        customerSnapshot: challan.customerSnapshot,
        totals: challan.totals,
        taxDetails: challan.taxDetails,
        logistics: challan.logistics,
        notes: challan.notes,
      }).returning();
      const sourceItems = await tx.select().from(commercialDocumentItemsTable).where(eq(commercialDocumentItemsTable.documentId, challan.id)).orderBy(asc(commercialDocumentItemsTable.sortOrder));
      await tx.insert(commercialDocumentItemsTable).values(sourceItems.map((item, index) => ({
        documentId: document.id,
        productModel: item.productModel,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discount: item.discount,
        lineTotal: item.lineTotal,
        sortOrder: index,
      })));
      return document;
    });
    return { ok: true, tool: this.name, data: { id: created.id, documentNumber: created.documentNumber, status: created.status } };
  },
};

export const commercialNovaTools: NovaTool[] = [createSalesOrder, createDeliveryChallan, createInvoice];
