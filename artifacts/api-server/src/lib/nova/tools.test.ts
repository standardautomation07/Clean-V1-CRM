import test from "node:test";
import assert from "node:assert/strict";
import { getNovaTool, listNovaTools } from "./tools";

test("NOVA exposes deterministic business tools", () => {
  const names = listNovaTools().map((tool) => tool.name);
  assert.deepEqual(names, [
    "search_products",
    "get_product",
    "match_requirement",
    "list_leads",
    "get_lead",
    "calculate_quotation_preview",
  ]);
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
