import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { ExtractEnquiryBody, ExtractEnquiryResponse } from "@workspace/api-zod";

import { matchEnquiryItems } from "../knowledge/match-items";
import { PRODUCT_CATEGORIES } from "../knowledge/products";

import {
  AiInvalidOutputError,
  AiNotConfiguredError,
  AiRequestError,
  extractEnquiry,
  OUTPUT_SCHEMA,
  type CreateMessage,
} from "./extract-enquiry";

const input = {
  companyName: "ABC Industries",
  contactName: "Ravi Sharma",
  phone: "+91 98765 43210",
  email: "",
  location: "",
  requirement: "ABC Industries needs an automatic sliding gate for their factory entrance. Opening is approximately 6 metres wide and 2.4 metres high. They need supply and installation.",
};

const ExtractedEnquirySchema = ExtractEnquiryResponse.shape.enquiry;

const validExtraction = {
  companyName: "ABC Industries",
  contactName: "Ravi Sharma",
  phone: "+91 98765 43210",
  email: null,
  location: null,
  missingInformation: ["Please confirm the approximate gate weight (kg)."],
  items: [
    {
      productHint: "automatic sliding gate",
      category: "Sliding Gate Motors",
      mentionedModel: null,
      requiredCapacityKg: null,
      quantity: null,
      unit: null,
      specifications: [
        { name: "Opening width", value: "approximately 6 metres" },
        { name: "Opening height", value: "2.4 metres" },
        { name: "Scope", value: "supply and installation" },
      ],
    },
  ],
  notes: null,
};

function fakeModel(text: string, stopReason: Anthropic.StopReason = "end_turn"): CreateMessage {
  return async () => ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, cache_creation: null, server_tool_use: null, service_tier: null, inference_geo: null, iterations: null, speed: null, output_tokens_details: null },
    container: null,
    context_management: null,
  } as unknown as Anthropic.Message);
}

// Walks every schema node so the checks cover nested objects and array items.
function schemaNodes(node: unknown, path = "$"): Array<{ path: string; node: Record<string, unknown> }> {
  if (!node || typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  const out = [{ path, node: record }];
  for (const [key, value] of Object.entries(record)) {
    if (key === "enum" || key === "required" || key === "type") continue;
    if (Array.isArray(value)) value.forEach((child, i) => out.push(...schemaNodes(child, `${path}.${key}[${i}]`)));
    else if (value && typeof value === "object") out.push(...schemaNodes(value, `${path}.${key}`));
  }
  return out;
}

describe("Anthropic structured-output schema (OUTPUT_SCHEMA)", () => {
  it("never declares an enum on a multi-type node (the 400 Anthropic returned)", () => {
    for (const { path, node } of schemaNodes(OUTPUT_SCHEMA)) {
      if ("enum" in node) {
        assert.equal(typeof node.type, "string", `${path}: enum must sit on a single-type node, got ${JSON.stringify(node.type)}`);
        assert.ok((node.enum as unknown[]).every((v) => typeof v === node.type), `${path}: every enum value must match type ${String(node.type)}`);
      }
    }
  });

  it("allows category to be exactly a Rollvento catalogue category or null", () => {
    const category = OUTPUT_SCHEMA.properties.items.items.properties.category as unknown as { anyOf: Array<Record<string, unknown>> };
    assert.ok(Array.isArray(category.anyOf));
    const stringBranch = category.anyOf.find((b) => b.type === "string");
    const nullBranch = category.anyOf.find((b) => b.type === "null");
    assert.ok(stringBranch && nullBranch, "category must offer a string branch and a null branch");
    assert.deepEqual(stringBranch.enum, [...PRODUCT_CATEGORIES]);
    assert.ok(!("enum" in nullBranch));
  });

  it("keeps mentionedModel as string-or-null and every object closed", () => {
    const item = OUTPUT_SCHEMA.properties.items.items;
    assert.deepEqual(item.properties.mentionedModel, { type: ["string", "null"] });
    for (const { path, node } of schemaNodes(OUTPUT_SCHEMA)) {
      if (node.type === "object") {
        assert.equal(node.additionalProperties, false, `${path}: objects must be closed`);
        assert.deepEqual([...(node.required as string[])].sort(), Object.keys(node.properties as object).sort(), `${path}: all properties must be required`);
      }
    }
  });

  it("has no price, amount or total field anywhere", () => {
    for (const { path, node } of schemaNodes(OUTPUT_SCHEMA)) {
      for (const key of Object.keys((node.properties as object | undefined) ?? {})) assert.ok(!/price|amount|total|cost|gst|tax/i.test(key), `${path}.${key}`);
    }
  });

  it("matches the generated Zod response schema field for field", () => {
    const zodKeys = Object.keys(ExtractedEnquirySchema.shape).sort();
    assert.deepEqual(Object.keys(OUTPUT_SCHEMA.properties).sort(), zodKeys);
    const zodItemKeys = Object.keys(ExtractedEnquirySchema.shape.items.element.shape).sort();
    assert.deepEqual(Object.keys(OUTPUT_SCHEMA.properties.items.items.properties).sort(), zodItemKeys);
  });
});

describe("ExtractEnquiryBody (request validation)", () => {
  it("rejects an empty requirement", () => {
    assert.equal(ExtractEnquiryBody.safeParse({ ...input, requirement: "" }).success, false);
  });
  it("accepts a form with only a requirement", () => {
    assert.equal(ExtractEnquiryBody.safeParse({ requirement: "Need a rolling shutter" }).success, true);
  });
});

describe("ExtractedEnquiry schema (AI output validation)", () => {
  it("accepts a well-formed extraction", () => {
    assert.equal(ExtractedEnquirySchema.safeParse(validExtraction).success, true);
  });
  it("rejects a quantity that is not a number", () => {
    const bad = { ...validExtraction, items: [{ ...validExtraction.items[0], quantity: "six" }] };
    assert.equal(ExtractedEnquirySchema.safeParse(bad).success, false);
  });
  it("rejects a response with missing required fields", () => {
    const { items: _items, ...missingItems } = validExtraction;
    assert.equal(ExtractedEnquirySchema.safeParse(missingItems).success, false);
  });
  it("rejects a category that is not in the Rollvento catalogue", () => {
    const bad = { ...validExtraction, items: [{ ...validExtraction.items[0], category: "Elevators" }] };
    assert.equal(ExtractedEnquirySchema.safeParse(bad).success, false);
  });
  it("has no field where the AI could return a price or total", () => {
    const keys = Object.keys(ExtractedEnquirySchema.shape).concat(Object.keys(ExtractedEnquirySchema.shape.items.element.shape));
    assert.ok(keys.every((k) => !/price|amount|total|cost|value|gst|tax/i.test(k)), keys.join(","));
  });
});

describe("extractEnquiry()", () => {
  let savedKey: string | undefined;
  beforeEach(() => { savedKey = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey; });

  it("throws AiNotConfiguredError when no API key is set", async () => {
    await assert.rejects(extractEnquiry(input), AiNotConfiguredError);
  });

  it("returns the validated extraction and preserves user-typed form fields", async () => {
    const result = await extractEnquiry(
      { ...input, contactName: "Priya Mehta" },
      { createMessage: fakeModel(JSON.stringify(validExtraction)) },
    );
    assert.equal(result.contactName, "Priya Mehta");
    assert.equal(result.companyName, "ABC Industries");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].specifications.length, 3);
  });

  it("rejects non-JSON model output", async () => {
    await assert.rejects(
      extractEnquiry(input, { createMessage: fakeModel("Sure! Here is the gate you asked for.") }),
      AiInvalidOutputError,
    );
  });

  it("rejects JSON that does not match the schema", async () => {
    await assert.rejects(
      extractEnquiry(input, { createMessage: fakeModel(JSON.stringify({ companyName: "ABC", items: "gate" })) }),
      AiInvalidOutputError,
    );
  });

  it("rejects a truncated response", async () => {
    await assert.rejects(
      extractEnquiry(input, { createMessage: fakeModel("{\"companyName\":", "max_tokens") }),
      AiInvalidOutputError,
    );
  });

  it("strips a price the model returns anyway and never fabricates a model", async () => {
    const withPrice = { ...validExtraction, items: [{ ...validExtraction.items[0], mentionedModel: "SL7777", price: 25000 }], estimatedValue: 99999 };
    const result = await extractEnquiry(input, { createMessage: fakeModel(JSON.stringify(withPrice)) });
    assert.ok(!("price" in result.items[0]));
    assert.ok(!("estimatedValue" in result));
    const matches = matchEnquiryItems(result.items);
    assert.equal(matches[0].unknownModel, "SL7777");
    assert.ok(matches[0].candidates.every((c) => c.product.model !== "SL7777"));
  });

  it("carries missing-information questions through to the caller", async () => {
    const result = await extractEnquiry(input, { createMessage: fakeModel(JSON.stringify(validExtraction)) });
    assert.deepEqual(result.missingInformation, ["Please confirm the approximate gate weight (kg)."]);
    const matches = matchEnquiryItems(result.items);
    assert.ok(matches[0].questions.length > 0);
    assert.ok(matches[0].candidates.length > 1);
  });

  it("wraps provider failures in AiRequestError", async () => {
    await assert.rejects(
      extractEnquiry(input, { createMessage: async () => { throw new Error("socket hang up"); } }),
      AiRequestError,
    );
  });
});
