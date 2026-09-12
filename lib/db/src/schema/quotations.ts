import { createInsertSchema } from "drizzle-zod";
import { date, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { leadsTable } from "./leads";
import { usersTable } from "./auth";

export const quotationStatusEnum = pgEnum("quotation_status", ["Draft", "Generated"]);

// Money is stored as numeric(12,2) strings; every total is recalculated by the
// server from the items before it is written (see api-server lib/quotations).
export const quotationsTable = pgTable("quotations", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  ownerId: varchar("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  quotationNumber: varchar("quotation_number", { length: 32 }).notNull(),
  status: quotationStatusEnum("status").notNull().default("Draft"),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  validUntil: date("valid_until", { mode: "string" }),
  terms: text("terms").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("quotations_number_idx").on(table.quotationNumber),
  index("quotations_owner_idx").on(table.ownerId),
  index("quotations_lead_idx").on(table.leadId),
]);

export const quotationItemsTable = pgTable("quotation_items", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  quotationId: integer("quotation_id").notNull().references(() => quotationsTable.id, { onDelete: "cascade" }),
  productModel: varchar("product_model", { length: 64 }).notNull().default(""),
  productName: varchar("product_name", { length: 300 }).notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
  unit: varchar("unit", { length: 32 }).notNull().default("Nos"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 5, scale: 2 }).notNull().default("0"),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [index("quotation_items_quotation_idx").on(table.quotationId)]);

export const insertQuotationSchema = createInsertSchema(quotationsTable).omit({ ownerId: true, createdAt: true, updatedAt: true });
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type Quotation = typeof quotationsTable.$inferSelect;
export type QuotationItem = typeof quotationItemsTable.$inferSelect;
