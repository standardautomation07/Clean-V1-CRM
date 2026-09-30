import { and, desc, eq } from "drizzle-orm";
import { commercialDocumentsTable, db, leadsTable, quotationItemsTable, quotationsTable } from "@workspace/db";
import { Router, type IRouter } from "express";

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
  const items = await db.select().from((await import("@workspace/db")).commercialDocumentItemsTable).where(eq((await import("@workspace/db")).commercialDocumentItemsTable.documentId, id)).orderBy((await import("drizzle-orm")).asc((await import("@workspace/db")).commercialDocumentItemsTable.sortOrder));
  res.json({ document, items });
});

router.get("/quotations/:id/summary", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res); if (!ownerId) return;
  const id = Number(req.params.id);
  const [quotation] = await db.select().from(quotationsTable).where(and(eq(quotationsTable.id, id), eq(quotationsTable.ownerId, ownerId)));
  if (!quotation) { res.status(404).json({ error: "Quotation not found" }); return; }
  const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, quotation.leadId), eq(leadsTable.ownerId, ownerId)));
  const items = await db.select().from(quotationItemsTable).where(eq(quotationItemsTable.quotationId, id)).orderBy((await import("drizzle-orm")).asc(quotationItemsTable.sortOrder));
  res.json({ quotation, lead, items });
});

export default router;
