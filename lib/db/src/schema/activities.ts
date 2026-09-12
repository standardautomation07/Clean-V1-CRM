import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { leadsTable } from "./leads";
import { usersTable } from "./auth";

export const activitiesTable = pgTable("activities", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 32 }).notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: varchar("created_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
});

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({ createdAt: true });
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;