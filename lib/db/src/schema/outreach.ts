import { index, integer, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads";
import { usersTable } from "./auth";

// Outbound prospecting email. Every send is recorded, including failures, so a
// campaign can be audited: who was contacted, with what text, and what the
// provider said. Nothing is sent without an approved nova_approvals row.

export const outreachStatusEnum = pgEnum("outreach_status", ["Sent", "Failed"]);

export const outreachEmailsTable = pgTable("outreach_emails", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  ownerId: varchar("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  toEmail: varchar("to_email", { length: 320 }).notNull(),
  fromEmail: varchar("from_email", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 300 }).notNull(),
  body: text("body").notNull(),
  status: outreachStatusEnum("status").notNull(),
  // Provider message id when accepted, so a reply can be traced back.
  providerMessageId: varchar("provider_message_id", { length: 200 }),
  error: text("error").notNull().default(""),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("outreach_emails_lead_idx").on(table.leadId, table.sentAt),
  index("outreach_emails_owner_idx").on(table.ownerId, table.sentAt),
  index("outreach_emails_to_idx").on(table.toEmail),
]);

export type OutreachEmail = typeof outreachEmailsTable.$inferSelect;
