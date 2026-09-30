import { jsonb, integer, index, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const novaApprovalStatusEnum = pgEnum("nova_approval_status", [
  "Pending",
  "Approved",
  "Rejected",
  "Executed",
  "Failed",
]);

export const novaApprovalsTable = pgTable("nova_approvals", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  ownerId: varchar("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  toolName: varchar("tool_name", { length: 120 }).notNull(),
  risk: varchar("risk", { length: 32 }).notNull(),
  input: jsonb("input").notNull().default({}),
  status: novaApprovalStatusEnum("status").notNull().default("Pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  decidedBy: varchar("decided_by").references(() => usersTable.id, { onDelete: "set null" }),
  result: jsonb("result"),
  error: text("error"),
}, (table) => [
  index("nova_approvals_owner_status_idx").on(table.ownerId, table.status),
  index("nova_approvals_owner_requested_idx").on(table.ownerId, table.requestedAt),
]);

export type NovaApproval = typeof novaApprovalsTable.$inferSelect;
