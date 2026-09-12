import type { ExtractedEnquiry, ExtractedEnquiryItem, LeadSource, Product, ProductCandidate, ProductCategory, ProductMatch } from '@workspace/api-client-react';
import { LeadSource as LeadSourceEnum } from '@workspace/api-client-react';

export type WorkflowStep = 'enquiry' | 'product' | 'lead' | 'pricing' | 'quotation' | 'followup';

export const WORKFLOW_STEPS: Array<{ key: WorkflowStep; label: string; hint: string }> = [
  { key: 'enquiry', label: 'Enquiry', hint: 'Capture' },
  { key: 'product', label: 'Product', hint: 'AI review' },
  { key: 'lead', label: 'Lead', hint: 'Create' },
  { key: 'pricing', label: 'Pricing', hint: 'Your prices' },
  { key: 'quotation', label: 'Quotation', hint: 'Generate' },
  { key: 'followup', label: 'Follow-up', hint: 'Schedule' },
];

export interface ReviewSpecification { name: string; value: string }

// Editable enquiry item plus its deterministic product matches. Text inputs are
// kept as strings while editing and converted when sent to the API.
export interface ReviewItem {
  productHint: string;
  category: ProductCategory | '';
  mentionedModel: string;
  requiredCapacityKg: string;
  quantity: string;
  unit: string;
  specifications: ReviewSpecification[];
  candidates: ProductCandidate[];
  questions: string[];
  unknownModel: string | null;
  noMatchReason: string | null;
  selectedProduct: Product | null;
}

export interface ReviewState {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  location: string;
  source: LeadSource;
  items: ReviewItem[];
  notes: string;
  missingInformation: string[];
}

export function blankReviewItem(): ReviewItem {
  return { productHint: '', category: '', mentionedModel: '', requiredCapacityKg: '', quantity: '', unit: '', specifications: [], candidates: [], questions: [], unknownModel: null, noMatchReason: null, selectedProduct: null };
}

export function applyMatch(item: ReviewItem, match: ProductMatch | undefined): ReviewItem {
  if (!match) return item;
  const candidates = match.candidates;
  const keepSelection = item.selectedProduct && candidates.some((c) => c.product.model === item.selectedProduct?.model) ? item.selectedProduct : null;
  return {
    ...item,
    category: item.category || match.category || '',
    candidates,
    questions: match.questions,
    unknownModel: match.unknownModel,
    noMatchReason: match.noMatchReason,
    // Auto-select only when exactly one product fits; otherwise the user chooses.
    selectedProduct: keepSelection ?? (candidates.length === 1 ? candidates[0].product : null),
  };
}

export function toReviewState(extracted: ExtractedEnquiry, matches: ProductMatch[]): ReviewState {
  return {
    companyName: extracted.companyName,
    contactName: extracted.contactName,
    phone: extracted.phone,
    email: extracted.email ?? '',
    location: extracted.location ?? '',
    source: LeadSourceEnum.Other,
    notes: extracted.notes ?? '',
    missingInformation: extracted.missingInformation,
    items: extracted.items.map((item, index) => applyMatch({
      productHint: item.productHint,
      category: item.category ?? '',
      mentionedModel: item.mentionedModel ?? '',
      requiredCapacityKg: item.requiredCapacityKg === null ? '' : String(item.requiredCapacityKg),
      quantity: item.quantity === null ? '' : String(item.quantity),
      unit: item.unit ?? '',
      specifications: item.specifications.map((spec) => ({ ...spec })),
      candidates: [],
      questions: [],
      unknownModel: null,
      noMatchReason: null,
      selectedProduct: null,
    }, matches.find((m) => m.itemIndex === index))),
  };
}

export function toMatchItems(items: ReviewItem[]): ExtractedEnquiryItem[] {
  return items.map((item) => ({
    productHint: item.productHint.trim(),
    category: item.category || null,
    mentionedModel: item.mentionedModel.trim() || null,
    requiredCapacityKg: item.requiredCapacityKg.trim() ? Number(item.requiredCapacityKg) || null : null,
    quantity: item.quantity.trim() ? Number(item.quantity) || null : null,
    unit: item.unit.trim() || null,
    specifications: item.specifications.filter((spec) => spec.name.trim() && spec.value.trim()).map((spec) => ({ name: spec.name.trim(), value: spec.value.trim() })),
  }));
}

/** Human summary of one confirmed item, used for the lead requirement. */
export function describeItem(item: ReviewItem): string {
  const product = item.selectedProduct ? `${item.selectedProduct.model} – ${item.selectedProduct.productName}` : item.productHint.trim();
  const quantity = item.quantity.trim();
  const qty = quantity ? ` × ${quantity}${item.unit.trim() ? ` ${item.unit.trim()}` : ''}` : '';
  const specs = item.specifications.filter((s) => s.name.trim() && s.value.trim()).map((s) => `${s.name.trim()}: ${s.value.trim()}`);
  if (item.requiredCapacityKg.trim()) specs.unshift(`Weight: ${item.requiredCapacityKg.trim()} kg`);
  return `${product}${qty}${specs.length ? ` (${specs.join(', ')})` : ''}`;
}

export function specOrTbc(value: string | null | undefined): string {
  return value && value.trim() ? value : 'To be confirmed';
}

export function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: { error?: unknown } } | null)?.data;
  if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
  if (error instanceof TypeError) return 'Could not reach the server. Check your connection and try again.';
  return fallback;
}

export function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const DEFAULT_TERMS = [
  '1. Prices are in INR and exclusive of transport and site work unless stated.',
  '2. GST is charged at the rate shown above.',
  '3. Delivery and installation schedule to be confirmed on order.',
  '4. Payment terms to be agreed before dispatch.',
  '5. This quotation is valid until the date stated above.',
].join('\n');
