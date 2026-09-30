import { Router, type IRouter } from "express";
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

router.get("/nova", (req, res): void => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({
    name: "NOVA",
    version: "0.1.0",
    role: "AI Business Operating System",
    capabilities: ["CRM", "product intelligence", "quotation preview", "sales documents", "marketing", "lead generation"],
    tools: listNovaTools(),
  });
});

router.get("/nova/tools", (req, res): void => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({ tools: listNovaTools() });
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
  if (tool.requiresApproval && !body.approved) {
    res.status(409).json({ ok: false, tool: tool.name, requiresApproval: true, error: "Human approval is required for this action." });
    return;
  }
  try {
    const result = await tool.execute(body.input ?? {}, { ownerId });
    res.status(result.ok ? 200 : 422).json(result);
  } catch (error) {
    req.log.error({ err: error, tool: tool.name }, "NOVA tool execution failed");
    res.status(500).json({ ok: false, tool: tool.name, error: "NOVA tool execution failed." });
  }
});

export default router;
