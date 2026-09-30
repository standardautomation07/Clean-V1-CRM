import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { leadsTable } from "./leads";

export const whatsappMessageDirectionEnum = pgEnum("whatsapp_message_direction", ["Inbound", "Outbound"]);
export const whatsappMessageStatusEnum = pgEnum("whatsapp_message_status", ["Received", "Sent", "Failed"]);

export const whatsappMessagesTable = pgTable("whatsapp_messages", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  ownerId: varchar("owner_id").references(() => usersTable.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  direction: whatsappMessageDirectionEnum("direction").notNull(),
  status: whatsappMessageStatusEnum("status").notNull(),
  waMessageId: varchar("wa_message_id", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  messageType: varchar("message_type", { length: 40 }).notNull(),
  body: text("body").notNull().default(""),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("whatsapp_messages_lead_idx").on(table.leadId, table.createdAt),
  index("whatsapp_messages_phone_idx").on(table.phone, table.createdAt),
  index("whatsapp_messages_wa_id_idx").on(table.waMessageId),
]);

export type WhatsappMessage = typeof whatsappMessagesTable.$inferSelect;
