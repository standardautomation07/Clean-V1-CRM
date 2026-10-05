import { getProductByModel, loadRollventoProducts } from "../knowledge/products";

// Reading a product enquiry sent from the website.
//
// The site's Enquire button opens WhatsApp with the message already written:
//
//   Enquiry: SL1000AC
//   Quantity: 10 sets
//
// The customer only presses send, so that shape arrives intact most of the
// time. It is still only a WhatsApp message: people edit it, type their own
// wording, or send a bare model number. So this reads what it can and reports
// what it could not, rather than assuming the format.

export interface ProductEnquiry {
  model: string | null;
  productName: string | null;
  quantity: number | null;
  unit: string | null;
  /** The enquiry rendered as a requirement line for the lead. */
  requirement: string | null;
}

const QUANTITY_UNITS = ["sets", "set", "nos", "no", "pcs", "pieces", "piece", "units", "unit", "pairs", "pair"];

/** Longest models first, so SL1000ACW is not matched as SL1000AC. */
function modelsByLength(): string[] {
  return loadRollventoProducts()
    .map((product) => product.model)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function findModel(text: string): string | null {
  const haystack = text.toUpperCase();
  for (const model of modelsByLength()) {
    const needle = model.toUpperCase();
    const at = haystack.indexOf(needle);
    if (at === -1) continue;
    // A model must not be part of a longer alphanumeric run, so "SL600AC" does
    // not match inside an order reference like "XSL600ACZ".
    const before = haystack[at - 1];
    const after = haystack[at + needle.length];
    const boundary = (c: string | undefined) => c === undefined || !/[A-Z0-9]/.test(c);
    if (boundary(before) && boundary(after)) return model;
  }
  return null;
}

function findQuantity(text: string): { quantity: number; unit: string | null } | null {
  // Prefer an explicit "Quantity: 10 sets" line, which is what the website sends.
  const labelled = text.match(/\b(?:quantity|qty)\s*[:\-]?\s*(\d{1,5})\s*([A-Za-z]+)?/i);
  const match = labelled ?? text.match(/\b(\d{1,5})\s*(sets?|nos?|pcs|pieces?|units?|pairs?)\b/i);
  if (!match) return null;
  const quantity = Number(match[1]);
  if (!Number.isInteger(quantity) || quantity <= 0) return null;
  const rawUnit = (match[2] ?? "").toLowerCase();
  const unit = QUANTITY_UNITS.includes(rawUnit) ? rawUnit : null;
  return { quantity, unit };
}

export function parseProductEnquiry(body: string): ProductEnquiry {
  const text = String(body ?? "").trim();
  const empty: ProductEnquiry = { model: null, productName: null, quantity: null, unit: null, requirement: null };
  if (!text) return empty;

  const model = findModel(text);
  const found = findQuantity(text);
  const quantity = found?.quantity ?? null;
  const unit = found?.unit ?? null;
  if (!model && quantity === null) return empty;

  const productName = model ? getProductByModel(model)?.productName ?? null : null;

  // A requirement the salesperson can read, and that the quotation form can be
  // started from, rather than making them re-read the raw message.
  const parts: string[] = [];
  if (model) parts.push(productName ? `${model} — ${productName}` : model);
  if (quantity !== null) parts.push(`Quantity: ${quantity}${unit ? ` ${unit}` : ""}`);

  return { model, productName, quantity, unit, requirement: parts.join(" · ") || null };
}
