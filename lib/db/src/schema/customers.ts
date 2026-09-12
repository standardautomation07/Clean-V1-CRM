import { createInsertSchema } from "drizzle-zod";
import { integer, numeric, pgTable, text, timestamp, varchar, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { leadsTable } from "./leads";
import { usersTable } from "./auth";

export const customersTable = pgTable("customers", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  leadId: integer("lead_id").notNull().unique().references(() => leadsTable.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  companyName: varchar("company_name", { length: 200 }).notNull(),
  contactName: varchar("contact_name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull().default(""),
  email: varchar("email", { length: 320 }).notNull(),
  requirement: text("requirement").notNull().default(""),
  value: numeric("value", { precision: 12, scale: 2 }).notNull().default("0"),
  convertedAt: timestamp("converted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("customers_owner_idx").on(table.ownerId)]);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ convertedAt: true, ownerId: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;