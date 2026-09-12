import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getProductByModel,
  getRollventoBrand,
  loadRollventoProducts,
  matchProductsToEnquiry,
  PRODUCT_CATEGORIES,
  searchRollventoProducts,
} from "./products";

describe("Rollvento product knowledge (data/rollvento-products.json)", () => {
  it("loads the catalogue", () => {
    const products = loadRollventoProducts();
    assert.ok(products.length > 50, `expected a full catalogue, got ${products.length}`);
    assert.ok(products.every((p) => (PRODUCT_CATEGORIES as readonly string[]).includes(p.category)));
    assert.equal(getRollventoBrand().legalName, "ROLLVENTO AUTOMATION PVT. LTD.");
  });

  it("finds a known product with its stated specifications", () => {
    const product = getProductByModel("sl1000ac");
    assert.ok(product);
    assert.equal(product.model, "SL1000AC");
    assert.equal(product.category, "Sliding Gate Motors");
    assert.equal(product.capacityKg, 1000);
    assert.equal(product.power, "400 W");
    assert.equal(product.voltage, "220V AC");
  });

  it("does not fabricate an unknown product", () => {
    assert.equal(getProductByModel("SL9999XYZ"), undefined);
    assert.equal(getProductByModel(""), undefined);
  });

  it("keeps missing specifications null instead of inventing them", () => {
    const product = getProductByModel("SL1000AC");
    assert.ok(product);
    assert.equal(product.torque, null); // torque is not published for SL1000AC
    assert.equal(product.torqueNm, null);
  });

  it("never exposes internal commercial pricing", () => {
    const product = getProductByModel("SL500DC") as unknown as Record<string, unknown>;
    assert.ok(!("commercial" in product));
    assert.ok(!JSON.stringify(product).toLowerCase().includes("price"));
  });
});

describe("matchProductsToEnquiry()", () => {
  it("recommends the smallest sufficient sliding gate motor for a stated gate weight", () => {
    const result = matchProductsToEnquiry({ productHint: "automatic sliding gate motor", category: "Sliding Gate Motors", mentionedModel: null, requiredCapacityKg: 1000, specifications: [] });
    assert.equal(result.category, "Sliding Gate Motors");
    assert.equal(result.candidates[0]?.product.model, "SL1000AC");
    assert.ok(result.candidates.every((c) => (c.product.capacityKg ?? 0) >= 1000));
    assert.deepEqual(result.questions, []);
  });

  it("asks for the gate weight instead of guessing when it is not stated", () => {
    const result = matchProductsToEnquiry({ productHint: "sliding gate motor", category: null, mentionedModel: null, requiredCapacityKg: null, specifications: [] });
    assert.equal(result.category, "Sliding Gate Motors");
    assert.ok(result.candidates.length > 1, "several candidates should be offered");
    assert.ok(result.questions.some((q) => /gate weight/i.test(q)));
  });

  it("reads the weight from a specification when the AI did not set requiredCapacityKg", () => {
    const result = matchProductsToEnquiry({ productHint: "sliding gate", category: "Sliding Gate Motors", mentionedModel: null, requiredCapacityKg: null, specifications: [{ name: "Gate weight", value: "1 ton" }] });
    assert.equal(result.candidates[0]?.product.model, "SL1000AC");
  });

  it("flags a mentioned model that does not exist and still offers real products", () => {
    const result = matchProductsToEnquiry({ productHint: "sliding gate motor", category: "Sliding Gate Motors", mentionedModel: "SL7777", requiredCapacityKg: null, specifications: [] });
    assert.equal(result.unknownModel, "SL7777");
    assert.ok(result.candidates.every((c) => getProductByModel(c.product.model)));
  });

  it("prioritises a model the customer literally named", () => {
    const result = matchProductsToEnquiry({ productHint: "motor", category: null, mentionedModel: "RV-1000", requiredCapacityKg: null, specifications: [] });
    assert.equal(result.candidates[0]?.product.model, "RV-1000");
    assert.equal(result.category, "Rolling Shutter Motors");
  });

  it("says so when nothing in the catalogue covers the requirement", () => {
    const result = matchProductsToEnquiry({ productHint: "sliding gate motor", category: "Sliding Gate Motors", mentionedModel: null, requiredCapacityKg: 9000, specifications: [] });
    assert.deepEqual(result.candidates, []);
    assert.match(result.noMatchReason ?? "", /No sliding gate motors/i);
  });

  it("search only returns catalogue products", () => {
    const hits = searchRollventoProducts({ query: "rolling shutter single phase", limit: 5 });
    assert.ok(hits.length > 0);
    assert.ok(hits.every((h) => getProductByModel(h.product.model)));
  });
});
