import { integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leadsTable } from "./leads";
import { usersTable } from "./auth";

export const commercialDocumentTypeEnum = pgEnum("commercial_document_type", ["SalesOrder", "DeliveryChallan", "Invoice"]);
export const commercialDocumentStatusEnum = pgEnum("commercial_document_status", ["Draft", "PendingApproval", "Approved", "Issued", "Cancelled"]);

export const commercialDocumentsTable = pgTable("commercial_documents", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  ownerId: varchar("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  documentType: commercialDocumentTypeEnum("document_type").notNull(),
  documentNumber: varchar("document_number", { length: 40 }).notNull(),
  status: commercialDocumentStatusEnum("status").notNull().default("Draft"),
  referenceDocumentId: integer("reference_document_id"),
  documentDate: timestamp("document_date", { withTimezone: true }).notNull().defaultNow(),
  customerSnapshot: jsonb("customer_snapshot").notNull().default({}),
  totals: jsonb("totals").notNull().default({}),
  taxDetails: jsonb("tax_details").notNull().default({}),
  logistics: jsonb("logistics").notNull().default({}),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("commercial_documents_number_idx").on(table.documentNumber),
  index("commercial_documents_owner_idx").on(table.ownerId),
  index("commercial_documents_lead_idx").on(table.leadId),
  index("commercial_documents_reference_idx").on(table.referenceDocumentId),
]);

export const commercialDocumentItemsTable = pgTable("commercial_document_items", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  documentId: integer("document_id").notNull().references(() => commercialDocumentsTable.id, { onDelete: "cascade" }),
  productModel: varchar("product_model", { length: 64 }).notNull(),
  productName: varchar("product_name", { length: 300 }).notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
  unit: varchar("unit", { length: 32 }).notNull().default("Nos"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 5, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [index("commercial_document_items_document_idx").on(table.documentId)]);

// "id" is generated-always, so drizzle-zod already leaves it out of the insert
// schema; omitting it again throws "Unrecognized key" when this module loads.
export const insertCommercialDocumentSchema = createInsertSchema(commercialDocumentsTable).omit({ createdAt: true, updatedAt: true });
export type InsertCommercialDocument = z.infer<typeof insertCommercialDocumentSchema>;
export type CommercialDocument = typeof commercialDocumentsTable.$inferSelect;
export type CommercialDocumentItem = typeof commercialDocumentItemsTable.$inferSelect;
