import type { ExtractedEnquiryItem, Product, ProductMatch } from "@workspace/api-zod";

import { matchProductsToEnquiry, type ProductCategory, type RollventoProduct } from "./products";

/** Shape a catalogue product for the API (no commercial data, no images). */
export function toApiProduct(product: RollventoProduct): Product {
  return {
    id: product.id,
    model: product.model,
    productName: product.productName,
    category: product.category,
    family: product.family,
    shortDescription: product.shortDescription,
    motorType: product.motorType,
    power: product.power,
    torque: product.torque,
    voltage: product.voltage,
    capacityKg: product.capacityKg,
    keySpecifications: product.keySpecifications,
    applications: product.applications,
  };
}

/** Runs deterministic matching for every extracted item. */
export function matchEnquiryItems(items: ExtractedEnquiryItem[]): ProductMatch[] {
  return items.map((item, itemIndex) => {
    const result = matchProductsToEnquiry({
      productHint: item.productHint,
      category: (item.category as ProductCategory | null) ?? null,
      mentionedModel: item.mentionedModel,
      requiredCapacityKg: item.requiredCapacityKg,
      specifications: item.specifications,
    });
    return {
      itemIndex,
      category: result.category,
      candidates: result.candidates.map((candidate) => ({ product: toApiProduct(candidate.product), reason: candidate.reason })),
      questions: result.questions,
      unknownModel: result.unknownModel,
      noMatchReason: result.noMatchReason,
    };
  });
}
