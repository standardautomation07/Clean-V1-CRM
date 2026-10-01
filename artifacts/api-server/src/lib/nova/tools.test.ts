import test from "node:test";
import assert from "node:assert/strict";

// The tool registry imports @workspace/db, which refuses to load without a
// connection string. A placeholder is enough: node-postgres only dials the
// server on the first query, and nothing below touches the database.
process.env.DATABASE_URL ??= "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";
const { getNovaTool, listNovaTools } = await import("./tools");

test("NOVA exposes deterministic business tools", () => {
  const names = listNovaTools().map((tool) => tool.name);
  for (const expected of [
    "search_products",
    "get_product",
    "match_requirement",
    "list_leads",
    "get_lead",
    "calculate_quotation_preview",
    "understand_whatsapp_reply",
    "draft_whatsapp_reply",
    "send_whatsapp_text",
  ]) {
    assert.ok(names.includes(expected), `missing NOVA tool: ${expected}`);
  }
  assert.equal(new Set(names).size, names.length, "NOVA tool names must be unique");
});

test("every external or write tool is approval gated", () => {
  for (const tool of listNovaTools()) {
    if (tool.risk === "external" || tool.risk === "write") {
      assert.equal(tool.requiresApproval, true, `${tool.name} must require approval`);
    }
  }
});

test("NOVA quotation preview uses the deterministic quotation calculator", async () => {
  const tool = getNovaTool("calculate_quotation_preview");
  assert.ok(tool);
  const result = await tool.execute({
    taxRate: 18,
    items: [{
      productModel: "RV 600",
      productName: "Rolling Shutter Motor",
      quantity: 2,
      unit: "Nos",
      unitPrice: 10000,
      discount: 10,
    }],
  }, { ownerId: "test-owner" });
  assert.equal(result.ok, true);
  assert.equal((result.data as { totals: { total: number } }).totals.total, 21240);
});

test("draft_whatsapp_reply never authorises an automatic send", () => {
  const draft = getNovaTool("draft_whatsapp_reply");
  const understand = getNovaTool("understand_whatsapp_reply");
  assert.ok(draft);
  assert.ok(understand);
  for (const tool of [draft, understand]) {
    assert.equal(tool.risk, "read");
    assert.equal(tool.requiresApproval, false);
  }
});
