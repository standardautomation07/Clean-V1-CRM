// Starting a quotation from what the customer actually asked for.
//
// A lead converted from a WhatsApp enquiry carries a requirement built by the
// server, for example:
//
//   RV-400 — RV-400 1000 kg Rolling Shutter Motor · Quantity: 5 sets
//
// Opening the pricing form empty after all that is wasted work and invites a
// transcription mistake, so the first line is filled in from it.
//
// The price is deliberately left blank. Prices come from an authorised person
// in this system and are never suggested, so the one field that must be typed
// is the one that carries commercial risk.

export interface PrefilledLine {
  productModel: string;
  productName: string;
  quantity: string;
}

export interface CatalogueProduct {
  model: string;
  productName: string;
}

/** Reads a model and quantity out of a lead's requirement, if they are there. */
export function lineFromRequirement(requirement: string, catalogue: CatalogueProduct[]): PrefilledLine | null {
  const text = String(requirement ?? "").trim();
  if (!text) return null;

  // Longest first, so RV-1500 is not matched as something shorter, and with
  // separators optional, because the requirement may have come from a customer
  // who wrote "RV400".
  const byLength = [...catalogue].sort(
    (a, b) => b.model.replace(/[^A-Za-z0-9]/g, "").length - a.model.replace(/[^A-Za-z0-9]/g, "").length,
  );
  const haystack = text.toUpperCase();
  let matched: CatalogueProduct | null = null;
  for (const product of byLength) {
    const parts = product.model.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (new RegExp(`(?<![A-Z0-9])${parts.join("[\\s\\-_.]*")}(?![A-Z0-9])`).test(haystack)) {
      matched = product;
      break;
    }
  }
  if (!matched) return null;

  const quantity = text.match(/\b(?:quantity|qty)\s*[:\-]?\s*(\d{1,5})/i)?.[1]
    ?? text.match(/\b(\d{1,5})\s*(?:sets?|nos?|pcs|pieces?|units?)\b/i)?.[1]
    ?? "1";

  return { productModel: matched.model, productName: matched.productName, quantity };
}
