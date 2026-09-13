import Anthropic from "@anthropic-ai/sdk";
import { ExtractEnquiryResponse, type EnquiryInput, type ExtractedEnquiry } from "@workspace/api-zod";
import { PRODUCT_CATEGORIES, loadRollventoProducts } from "../knowledge/products";

import { logger } from "../logger";

/** The server has no AI credentials configured. */
export class AiNotConfiguredError extends Error {
  override readonly name = "AiNotConfiguredError";
}

/** The AI provider request itself failed (network, auth, rate limit, provider outage). */
export class AiRequestError extends Error {
  override readonly name = "AiRequestError";
}

/** The AI responded, but the response was not a valid ExtractedEnquiry. */
export class AiInvalidOutputError extends Error {
  override readonly name = "AiInvalidOutputError";
}

const DEFAULT_MODEL = "claude-opus-5";
const REQUEST_TIMEOUT_MS = 60_000;

// Only the category names and model codes are shared with the model so it can
// interpret the customer's wording. Product selection itself is deterministic
// (see lib/knowledge/products.ts) and never trusts a model code the AI outputs
// unless it exists in the catalogue.
function buildSystemPrompt(): string {
  const models = loadRollventoProducts().map((p) => p.model).join(", ");
  return `You extract structured information from customer sales enquiries for Rollvento Automation, an Indian gate, door, shutter and access automation company.
The enquiry is provided as form fields plus a free-text requirement written by a salesperson.

Rollvento catalogue categories (the only allowed values for "category"): ${PRODUCT_CATEGORIES.join(" | ")}.
Rollvento model codes that exist (for recognising a model the customer literally names): ${models}.

Rules:
- Return only what the enquiry actually says. Never invent, assume or infer information that is not stated.
- Do not invent product specifications, quantities, units, prices, locations or contact details.
- If something is missing or unclear, use null (or an empty array / empty string) instead of guessing.
- Preserve the customer's own wording for values (for example keep "approx. 6 metres" rather than converting units).
- Form fields provided by the user are authoritative for company, contact, phone, email and location. Only fill a field from the requirement text when the form field is blank and the text states it explicitly.
- items: one entry per distinct product or service requested. productHint is only the product/category named or clearly implied by the wording (for example "automatic sliding gate motor", "rolling shutter motor", "remote transmitters").
- category: the catalogue category implied by the wording, or null when it is genuinely unclear. Do not recommend or select products.
- mentionedModel: a model code only if the customer literally wrote it (for example "SL1000AC"); otherwise null. Never infer or suggest a model.
- requiredCapacityKg: the gate, shutter or leaf weight in kg only when stated (convert "1 ton" to 1000). Otherwise null. Never estimate weight from dimensions.
- quantity is a number only when a quantity is explicitly given; otherwise null. unit is the unit the customer used (for example "nos", "sets", "sq ft") or null.
- missingInformation: short questions the salesperson should ask because the enquiry does not state something needed to choose a product (typically gate/shutter weight, opening size, single or three phase supply, quantity). Ask only useful questions; empty array when nothing important is missing.
- specifications: name/value pairs for dimensions, materials, scope (supply, installation, AMC), timelines or other explicit details. Leave the array empty when nothing is specified.
- notes: any other useful context stated in the enquiry (urgency, site conditions, preferences). Do not repeat item specifications. Null when there is nothing extra.
- Do not include prices, estimated values or recommendations anywhere in the output.`;
}

// JSON schema for structured output. Mirrors the ExtractedEnquiry schema in
// lib/api-spec/openapi.yaml; the response is still validated with the generated
// ExtractEnquiryResponse zod schema before it leaves the server.
export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["companyName", "contactName", "phone", "email", "location", "items", "notes", "missingInformation"],
  properties: {
    companyName: { type: "string" },
    contactName: { type: "string" },
    phone: { type: "string" },
    email: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["productHint", "category", "mentionedModel", "requiredCapacityKg", "quantity", "unit", "specifications"],
        properties: {
          productHint: { type: "string" },
          // Anthropic structured outputs reject an enum on a multi-type field, so the
          // nullable enum is expressed as anyOf: a string enum branch or null.
          category: { anyOf: [{ type: "string", enum: [...PRODUCT_CATEGORIES] }, { type: "null" }] },
          mentionedModel: { type: ["string", "null"] },
          requiredCapacityKg: { type: ["number", "null"] },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          specifications: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "value"],
              properties: {
                name: { type: "string" },
                value: { type: "string" },
              },
            },
          },
        },
      },
    },
    notes: { type: ["string", "null"] },
    missingInformation: { type: "array", items: { type: "string" } },
  },
} as const;

// The generated response schema wraps the extraction with product matches; the
// model only produces the enquiry part.
const ExtractedEnquirySchema = ExtractEnquiryResponse.shape.enquiry;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Non-streaming message call; injectable so tests can fake the model. */
export type CreateMessage = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

export interface ExtractEnquiryOptions {
  createMessage?: CreateMessage;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function buildUserMessage(input: EnquiryInput): string {
  const field = (label: string, value: string | undefined) => `${label}: ${clean(value) || "(not provided)"}`;
  return [
    "Extract the structured enquiry from the following form submission.",
    "",
    field("Company / customer name", input.companyName),
    field("Contact person", input.contactName),
    field("Phone / WhatsApp", input.phone),
    field("Email", input.email),
    field("Location", input.location),
    "",
    "Requirement (free text written by the salesperson):",
    "<requirement>",
    input.requirement.trim(),
    "</requirement>",
  ].join("\n");
}

function describeProviderError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The AI provider rejected the server's API key.";
  if (err instanceof Anthropic.PermissionDeniedError) return "The AI provider denied access for the configured API key.";
  if (err instanceof Anthropic.RateLimitError) return "The AI provider is rate limiting requests. Please try again in a moment.";
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "The AI request timed out. Please try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the AI provider. Please try again.";
  if (err instanceof Anthropic.APIError) return `The AI provider returned an error (${err.status ?? "unknown"}).`;
  return "The AI request failed unexpectedly.";
}

/**
 * Sends the enquiry to the AI model and returns a validated ExtractedEnquiry.
 * Form fields the user filled in are always preserved verbatim; the model only
 * fills blanks from the requirement text and structures the items.
 */
export async function extractEnquiry(input: EnquiryInput, options: ExtractEnquiryOptions = {}): Promise<ExtractedEnquiry> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !options.createMessage) {
    throw new AiNotConfiguredError("AI extraction is not configured on this server (ANTHROPIC_API_KEY is missing).");
  }
  if (!input.requirement.trim()) {
    throw new AiInvalidOutputError("Requirement text is empty.");
  }

  const createMessage: CreateMessage = options.createMessage ?? ((params) => {
    const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
    return client.messages.create(params);
  });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  let response: Anthropic.Message;
  try {
    response = await createMessage({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserMessage(input) }],
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
    });
  } catch (err) {
    logger.warn({ err, model }, "AI enquiry extraction request failed");
    throw new AiRequestError(describeProviderError(err));
  }

  if (response.stop_reason === "refusal") {
    throw new AiRequestError("The AI declined to process this enquiry. Please review the text and try again.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiInvalidOutputError("The AI response was cut short. Please shorten the requirement and try again.");
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    logger.warn({ model, preview: text.slice(0, 200) }, "AI enquiry extraction returned non-JSON output");
    throw new AiInvalidOutputError("The AI response was not valid JSON. Please try again.");
  }

  const parsed = ExtractedEnquirySchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ model, issues: parsed.error.issues.slice(0, 5) }, "AI enquiry extraction failed schema validation");
    throw new AiInvalidOutputError("The AI response did not match the expected structure. Please try again.");
  }

  // Form fields the user typed are authoritative; never let the model rewrite them.
  const ai = parsed.data;
  return {
    ...ai,
    companyName: clean(input.companyName) || clean(ai.companyName),
    contactName: clean(input.contactName) || clean(ai.contactName),
    phone: clean(input.phone) || clean(ai.phone),
    email: clean(input.email) || clean(ai.email) || null,
    location: clean(input.location) || clean(ai.location) || null,
    notes: clean(ai.notes) || null,
    missingInformation: ai.missingInformation.map((q) => clean(q)).filter(Boolean),
    items: ai.items
      .map((item) => ({
        productHint: clean(item.productHint),
        category: item.category,
        mentionedModel: clean(item.mentionedModel) || null,
        requiredCapacityKg: item.requiredCapacityKg !== null && item.requiredCapacityKg > 0 ? item.requiredCapacityKg : null,
        quantity: item.quantity,
        unit: clean(item.unit) || null,
        specifications: item.specifications
          .map((spec) => ({ name: clean(spec.name), value: clean(spec.value) }))
          .filter((spec) => spec.name && spec.value),
      }))
      .filter((item) => item.productHint),
  };
}
