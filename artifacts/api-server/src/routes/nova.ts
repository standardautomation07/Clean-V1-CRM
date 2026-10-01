import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, novaApprovalsTable } from "@workspace/db";
import { getNovaAgent, novaAgents } from "../lib/nova/agents";
import { getNovaTool, listNovaTools } from "../lib/nova/tools";
import type { NovaCommandRequest } from "../lib/nova/types";

const router: IRouter = Router();

function requireUser(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.user.id;
}

async function executeApprovedTool(
  toolName: string,
  input: unknown,
  ownerId: string,
  req: Parameters<Parameters<typeof router.post>[1]>[0],
) {
  const tool = getNovaTool(toolName);
  if (!tool) return { status: 404, body: { ok: false, error: `Unknown NOVA tool: ${toolName}` } };

  try {
    const result = await tool.execute(input ?? {}, { ownerId });
    return { status: result.ok ? 200 : 422, body: result };
  } catch (error) {
    req.log.error({ err: error, tool: tool.name }, "NOVA tool execution failed");
    return { status: 500, body: { ok: false, tool: tool.name, error: "NOVA tool execution failed." } };
  }
}

router.get("/nova", (req, res): void => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({
    name: "NOVA",
    version: "0.2.0",
    role: "AI Business Operating System",
    capabilities: ["CRM", "product intelligence", "quotation preview", "sales documents", "approvals", "marketing", "lead generation"],
    tools: listNovaTools(),
  });
});

router.get("/nova/agents", (req, res): void => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({ agents: novaAgents });
});

router.get("/nova/agents/:id", (req, res): void => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const agent = getNovaAgent(String(req.params.id).toUpperCase());
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({ agent });
});

router.get("/nova/tools", (req, res): void => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({ tools: listNovaTools() });
});

router.get("/nova/approvals", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const filters = [eq(novaApprovalsTable.ownerId, ownerId)];
  if (status) filters.push(eq(novaApprovalsTable.status, status as never));
  const rows = await db
    .select()
    .from(novaApprovalsTable)
    .where(and(...filters))
    .orderBy(desc(novaApprovalsTable.requestedAt))
    .limit(100);
  res.json({ approvals: rows });
});

router.post("/nova/execute", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const body = req.body as NovaCommandRequest;
  if (!body?.tool || typeof body.tool !== "string") {
    res.status(400).json({ error: "tool is required" });
    return;
  }

  const tool = getNovaTool(body.tool);
  if (!tool) {
    res.status(404).json({ error: `Unknown NOVA tool: ${body.tool}` });
    return;
  }

  // Approval-gated tools are never executed from this endpoint, whatever the
  // caller sends: they only run from POST /nova/approvals/:id/approve.
  if (tool.requiresApproval) {
    const [approval] = await db.insert(novaApprovalsTable).values({
      ownerId,
      toolName: tool.name,
      risk: tool.risk,
      input: body.input ?? {},
    }).returning();

    res.status(202).json({
      ok: true,
      pendingApproval: true,
      approval,
      message: "Human approval is required before this action executes.",
    });
    return;
  }

  const result = await executeApprovedTool(tool.name, body.input, ownerId, req);
  res.status(result.status).json(result.body);
});

router.post("/nova/approvals/:id/approve", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "valid approval id is required" });
    return;
  }

  const [approval] = await db
    .select()
    .from(novaApprovalsTable)
    .where(and(eq(novaApprovalsTable.id, id), eq(novaApprovalsTable.ownerId, ownerId)));

  if (!approval) {
    res.status(404).json({ error: "Approval not found" });
    return;
  }
  if (approval.status !== "Pending") {
    res.status(409).json({ error: `Approval is already ${approval.status}`, approval });
    return;
  }

  await db.update(novaApprovalsTable).set({
    status: "Approved",
    decidedAt: new Date(),
    decidedBy: ownerId,
  }).where(eq(novaApprovalsTable.id, id));

  const result = await executeApprovedTool(approval.toolName, approval.input, ownerId, req);
  const finalStatus = result.status >= 200 && result.status < 300 ? "Executed" : "Failed";

  const [updated] = await db.update(novaApprovalsTable).set({
    status: finalStatus,
    executedAt: new Date(),
    result: result.body,
    error: finalStatus === "Failed" ? String((result.body as { error?: string }).error ?? "Execution failed") : null,
  }).where(eq(novaApprovalsTable.id, id)).returning();

  res.status(result.status).json({ ...result.body, approval: updated });
});

router.post("/nova/approvals/:id/reject", async (req, res): Promise<void> => {
  const ownerId = requireUser(req, res);
  if (!ownerId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "valid approval id is required" });
    return;
  }

  const [approval] = await db
    .select()
    .from(novaApprovalsTable)
    .where(and(eq(novaApprovalsTable.id, id), eq(novaApprovalsTable.ownerId, ownerId)));

  if (!approval) {
    res.status(404).json({ error: "Approval not found" });
    return;
  }
  if (approval.status !== "Pending") {
    res.status(409).json({ error: `Approval is already ${approval.status}`, approval });
    return;
  }

  const [updated] = await db.update(novaApprovalsTable).set({
    status: "Rejected",
    decidedAt: new Date(),
    decidedBy: ownerId,
  }).where(eq(novaApprovalsTable.id, id)).returning();

  res.json({ ok: true, approval: updated });
});

export default router;
