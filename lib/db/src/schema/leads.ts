import { createInsertSchema } from "drizzle-zod";
import { date, index, integer, numeric, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const leadStatusEnum = pgEnum("lead_status", ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]);
export const leadSourceEnum = pgEnum("lead_source", ["Website", "WhatsApp", "Phone", "Email", "Referral", "Other"]);

export const leadsTable = pgTable("leads", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  companyName: varchar("company_name", { length: 200 }).notNull(),
  contactName: varchar("contact_name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull().default(""),
  email: varchar("email", { length: 320 }).notNull(),
  source: leadSourceEnum("source").notNull(),
  requirement: text("requirement").notNull().default(""),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }).notNull().default("0"),
  status: leadStatusEnum("status").notNull().default("New"),
  nextFollowUp: date("next_follow_up", { mode: "string" }),
  notes: text("notes").notNull().default(""),
  ownerId: varchar("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("leads_owner_idx").on(table.ownerId),
  index("leads_owner_status_idx").on(table.ownerId, table.status),
  index("leads_owner_follow_up_idx").on(table.ownerId, table.nextFollowUp),
]);

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ ownerId: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;