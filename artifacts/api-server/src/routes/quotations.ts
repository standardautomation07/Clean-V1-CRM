import {
  CreateQuotationBody,
  CreateQuotationResponse,
  GenerateQuotationParams,
  GenerateQuotationResponse,
  GetQuotationParams,
  GetQuotationPdfParams,
  GetQuotationResponse,
  ListLeadQuotationsParams,
  ListLeadQuotationsResponse,
  UpdateQuotationBody,
  UpdateQuotationParams,
  UpdateQuotationResponse,
} from "@workspace/api-zod";
import { activitiesTable, db, leadsTable, quotationItemsTable, quotationsTable } from "@workspace/db";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { calculateQuotation, nextQuotationNumber, type QuotationItemInput } from "../lib/quotations/calc";
import { renderQuotationPdf } from "../lib/quotations/pdf";

const router: IRouter = Router();

type Req = Parameters<Parameters<typeof router.get>[1]>[0];
type Res = Parameters<Parameters<typeof router.get>[1]>[1];

function requireUser(req: Req, res: Res): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id;
}

const num = (value: string | number) => (typeof value === "number" ? value : Number(value));
const money = (value: number) => value.toFixed(2);

function serializeQuotation(row: typeof quotationsTable.$inferSelect, items: Array<typeof quotationItemsTable.$inferSelect>) {
  const subtotal = num(row.subtotal);
  const discount = num(row.discount);
  return {
    id: row.id,
    leadId: row.leadId,
    quotationNumber: row.quotationNumber,
    status: row.status,
    currency: row.currency,
    subtotal,
    discount,
    taxableAmount: Math.round((subtotal - discount) * 100) / 100,
    taxRate: num(row.taxRate),
    taxAmount: num(row.taxAmount),
    total: num(row.total),
    validUntil: row.validUntil,
    terms: row.terms,
    notes: row.notes,
    items: items.map((item) => ({
      id: item.id,
      productModel: item.productModel,
      productName: item.productName,
      quantity: num(item.quantity),
      unit: item.unit,
      unitPrice: num(item.unitPrice),
      discount: num(item.discount),
      lineTotal: num(item.lineTotal),
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function serializeSummary(row: typeof quotationsTable.$inferSelect) {
  return {
    id: row.id,
    leadId: row.leadId,
    quotationNumber: row.quotationNumber,
    status: row.status,
    currency: row.currency,
    total: num(row.total),
    validUntil: row.validUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Every quotation read is scoped by owner_id; the lead is additionally checked
// to belong to the same owner before a quotation is attached to it.
async function findOwnedQuotation(id: number, ownerId: string) {
  const [row] = await db.select().from(quotationsTable).where(and(eq(quotationsTable.id, id), eq(quotationsTable.ownerId, ownerId)));
  if (!row) return null;
  const items = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, row.id)).orderBy(asc(quotationItemsTable.sortOrder), asc(quotationItemsTable.id));
  return { row, items };
}

async function findOwnedLead(id: number, ownerId: string) {
  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, id), eq(leadsTable.ownerId, ownerId)));
  return lead ?? null;
}

async function allocateQuotationNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await tx.select({ number: quotationsTable.quotationNumber }).from(quotationsTable).where(like(quotationsTable.quotationNumber, `RV-${year}-%`));
  return nextQuotationNumber(existing.map((r) => r.number), year);
}

async function replaceItems(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], quotationId: number, items: ReturnType<typeof calculateQuotation>["items"]) {
  await tx.delete(quotationItemsTable).where(eq(quotationItemsTable.quotationId, quotationId));
  if (!items.length) return;
  await tx.insert(quotationItemsTable).values(items.map((item, index) => ({
    quotationId,
    productModel: item.productModel,
    productName: item.productName,
    quantity: money(item.quantity),
    unit: item.unit,
    unitPrice: money(item.unitPrice),
    discount: money(item.discount),
    lineTotal: money(item.lineTotal),
    sortOrder: index,
  })));
}

router.get("/leads/:id/quotations", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = ListLeadQuotationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const lead = await findOwnedLead(params.data.id, ownerId);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const rows = await db.select().from(quotationsTable).where(and(eq(quotationsTable.leadId, lead.id), eq(quotationsTable.ownerId, ownerId))).orderBy(desc(quotationsTable.createdAt));
  res.json(ListLeadQuotationsResponse.parse(rows.map(serializeSummary)));
});

router.post("/quotations", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const parsed = CreateQuotationBody.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    res.status(400).json({ error: issue ? `${issue.path.join(".") || "quotation"}: ${issue.message}` : "Invalid quotation" });
    return;
  }
  const lead = await findOwnedLead(parsed.data.leadId, ownerId);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  // Totals are recalculated here from the user-entered prices; nothing sent by
  // the client as a total is trusted.
  const calc = calculateQuotation(parsed.data.items as QuotationItemInput[], parsed.data.taxRate);
  const created = await db.transaction(async (tx) => {
    const quotationNumber = await allocateQuotationNumber(tx);
    const [row] = await tx.insert(quotationsTable).values({
      ownerId,
      leadId: lead.id,
      quotationNumber,
      status: "Draft",
      currency: "INR",
      subtotal: money(calc.totals.subtotal),
      discount: money(calc.totals.discount),
      taxRate: money(calc.totals.taxRate),
      taxAmount: money(calc.totals.taxAmount),
      total: money(calc.totals.total),
      validUntil: parsed.data.validUntil ?? null,
      terms: parsed.data.terms,
      notes: parsed.data.notes,
    }).returning();
    await replaceItems(tx, row.id, calc.items);
    return row;
  });
  const saved = await findOwnedQuotation(created.id, ownerId);
  res.status(201).json(CreateQuotationResponse.parse(serializeQuotation(saved!.row, saved!.items)));
});

router.get("/quotations/:id", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = GetQuotationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const found = await findOwnedQuotation(params.data.id, ownerId);
  if (!found) {
    res.status(404).json({ error: "Quotation not found" });
    return;
  }
  res.json(GetQuotationResponse.parse(serializeQuotation(found.row, found.items)));
});

router.patch("/quotations/:id", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = UpdateQuotationParams.safeParse(req.params);
  const parsed = UpdateQuotationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    const error = !params.success ? params.error.message : !parsed.success ? parsed.error.issues[0]?.message ?? "Invalid quotation" : "Invalid request";
    res.status(400).json({ error });
    return;
  }
  const found = await findOwnedQuotation(params.data.id, ownerId);
  if (!found) {
    res.status(404).json({ error: "Quotation not found" });
    return;
  }
  const items: QuotationItemInput[] = parsed.data.items
    ? (parsed.data.items as QuotationItemInput[])
    : found.items.map((item) => ({ productModel: item.productModel, productName: item.productName, quantity: num(item.quantity), unit: item.unit, unitPrice: num(item.unitPrice), discount: num(item.discount) }));
  const calc = calculateQuotation(items, parsed.data.taxRate ?? num(found.row.taxRate));
  await db.transaction(async (tx) => {
    await tx.update(quotationsTable).set({
      subtotal: money(calc.totals.subtotal),
      discount: money(calc.totals.discount),
      taxRate: money(calc.totals.taxRate),
      taxAmount: money(calc.totals.taxAmount),
      total: money(calc.totals.total),
      ...(parsed.data.validUntil === undefined ? {} : { validUntil: parsed.data.validUntil }),
      ...(parsed.data.terms === undefined ? {} : { terms: parsed.data.terms }),
      ...(parsed.data.notes === undefined ? {} : { notes: parsed.data.notes }),
      updatedAt: new Date(),
    }).where(and(eq(quotationsTable.id, found.row.id), eq(quotationsTable.ownerId, ownerId)));
    if (parsed.data.items) await replaceItems(tx, found.row.id, calc.items);
  });
  const saved = await findOwnedQuotation(found.row.id, ownerId);
  res.json(UpdateQuotationResponse.parse(serializeQuotation(saved!.row, saved!.items)));
});

router.post("/quotations/:id/generate", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = GenerateQuotationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const found = await findOwnedQuotation(params.data.id, ownerId);
  if (!found) {
    res.status(404).json({ error: "Quotation not found" });
    return;
  }
  if (!found.items.length) {
    res.status(400).json({ error: "Add at least one line item before generating the quotation." });
    return;
  }
  const [row] = await db.update(quotationsTable).set({ status: "Generated", updatedAt: new Date() }).where(and(eq(quotationsTable.id, found.row.id), eq(quotationsTable.ownerId, ownerId))).returning();
  // Recorded on the lead through the existing activity mechanism.
  await db.insert(activitiesTable).values({
    leadId: row.leadId,
    createdBy: ownerId,
    type: "Quotation",
    description: `Quotation ${row.quotationNumber} generated for INR ${num(row.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })} (${found.items.length} item${found.items.length === 1 ? "" : "s"}).`,
  });
  res.json(GenerateQuotationResponse.parse(serializeQuotation(row, found.items)));
});

router.get("/quotations/:id/pdf", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const params = GetQuotationPdfParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const found = await findOwnedQuotation(params.data.id, ownerId);
  if (!found) {
    res.status(404).json({ error: "Quotation not found" });
    return;
  }
  const lead = await findOwnedLead(found.row.leadId, ownerId);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const location = lead.notes.split("\n").find((line) => line.startsWith("Location: "))?.slice("Location: ".length) ?? null;
  const quotation = serializeQuotation(found.row, found.items);
  const pdf = await renderQuotationPdf({
    ...quotation,
    createdAt: found.row.createdAt,
    customer: { companyName: lead.companyName, contactName: lead.contactName, phone: lead.phone, email: lead.email, location },
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${quotation.quotationNumber}.pdf"`);
  res.send(pdf);
});

export default router;
