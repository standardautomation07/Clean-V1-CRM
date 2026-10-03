import { and, asc, desc, eq } from "drizzle-orm";
import { commercialDocumentItemsTable, commercialDocumentsTable, db, leadsTable, quotationItemsTable, quotationsTable } from "@workspace/db";
import { Router, type IRouter } from "express";

import { renderQuotationPdf } from "../lib/quotations/pdf";

const router: IRouter = Router();

function requireUser(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]): string | null {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return null; }
  return req.user.id;
}

router.get("/documents", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res); if (!ownerId) return;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const filters = [eq(commercialDocumentsTable.ownerId, ownerId)];
  if (type === "SalesOrder" || type === "DeliveryChallan" || type === "Invoice") filters.push(eq(commercialDocumentsTable.documentType, type));
  const rows = await db.select().from(commercialDocumentsTable).where(and(...filters)).orderBy(desc(commercialDocumentsTable.createdAt));
  res.json(rows);
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res); if (!ownerId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid document id" }); return; }
  const [document] = await db.select().from(commercialDocumentsTable).where(and(eq(commercialDocumentsTable.id, id), eq(commercialDocumentsTable.ownerId, ownerId)));
  if (!document) { res.status(404).json({ error: "Document not found" }); return; }
  const items = await db.select().from(commercialDocumentItemsTable).where(eq(commercialDocumentItemsTable.documentId, id)).orderBy(asc(commercialDocumentItemsTable.sortOrder));
  res.json({ document, items });
});

// A Sales Order prints through the same renderer as a quotation, with the
// wording changed. Totals come from the stored snapshot, never recomputed:
// the document is a record of what was agreed, not a live calculation.
router.get("/documents/:id/pdf", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res); if (!ownerId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid document id" }); return; }

  const [document] = await db.select().from(commercialDocumentsTable).where(and(eq(commercialDocumentsTable.id, id), eq(commercialDocumentsTable.ownerId, ownerId)));
  if (!document) { res.status(404).json({ error: "Document not found" }); return; }
  const items = await db.select().from(commercialDocumentItemsTable).where(eq(commercialDocumentItemsTable.documentId, id)).orderBy(asc(commercialDocumentItemsTable.sortOrder));

  // The GSTIN lives on the lead rather than in the snapshot, so a document
  // raised before the GSTIN was recorded still prints the current one.
  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, document.leadId), eq(leadsTable.ownerId, ownerId)));

  // referenceDocumentId points at the quotation a Sales Order came from.
  let reference = "";
  if (document.referenceDocumentId) {
    const [source] = await db.select({ number: quotationsTable.quotationNumber }).from(quotationsTable).where(and(eq(quotationsTable.id, document.referenceDocumentId), eq(quotationsTable.ownerId, ownerId)));
    reference = source?.number ?? "";
  }

  const totals = (document.totals ?? {}) as { subtotal?: number; discount?: number; taxAmount?: number; total?: number; currency?: string };
  const tax = (document.taxDetails ?? {}) as { taxRate?: number };
  const snapshot = (document.customerSnapshot ?? {}) as { companyName?: string; contactName?: string; phone?: string; email?: string };
  const title = document.documentType === "SalesOrder" ? "SALES ORDER" : document.documentType === "Invoice" ? "INVOICE" : "DELIVERY CHALLAN";

  const pdf = await renderQuotationPdf({
    quotationNumber: document.documentNumber,
    status: document.status,
    createdAt: document.documentDate,
    validUntil: null,
    currency: totals.currency ?? "INR",
    subtotal: Number(totals.subtotal ?? 0),
    discount: Number(totals.discount ?? 0),
    taxRate: Number(tax.taxRate ?? 0),
    taxAmount: Number(totals.taxAmount ?? 0),
    total: Number(totals.total ?? 0),
    terms: "",
    notes: document.notes,
    items: items.map((item) => ({
      productModel: item.productModel,
      productName: item.productName,
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
      lineTotal: Number(item.lineTotal),
    })),
    customer: {
      companyName: snapshot.companyName ?? lead?.companyName ?? "",
      contactName: snapshot.contactName ?? lead?.contactName ?? "",
      phone: snapshot.phone ?? lead?.phone ?? "",
      email: snapshot.email ?? lead?.email ?? "",
      location: null,
      gstin: lead?.gstin,
    },
    labels: {
      title,
      numberLabel: `${title} NO.`,
      forLabel: `${title} FOR`,
      thirdColumnLabel: "AGAINST QUOTATION",
      thirdColumnValue: reference || "—",
      footerNote: reference ? `Raised against quotation ${reference}.` : "",
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${document.documentNumber}.pdf"`);
  res.send(pdf);
});

router.get("/quotations/:id/summary", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res); if (!ownerId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid quotation id" }); return; }
  const [quotation] = await db.select().from(quotationsTable).where(and(eq(quotationsTable.id, id), eq(quotationsTable.ownerId, ownerId)));
  if (!quotation) { res.status(404).json({ error: "Quotation not found" }); return; }
  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, quotation.leadId), eq(leadsTable.ownerId, ownerId)));
  const items = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id)).orderBy(asc(quotationItemsTable.sortOrder));
  res.json({ quotation, lead, items });
});

export default router;
