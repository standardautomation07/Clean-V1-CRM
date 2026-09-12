// All quotation money maths lives here and is the only place totals are
// computed before a quotation is written. Nothing here comes from AI.

export interface QuotationItemInput {
  productModel: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number; // percent, 0-100
}

export interface CalculatedItem extends QuotationItemInput {
  gross: number;
  discountAmount: number;
  lineTotal: number;
}

export interface QuotationTotals {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateItem(item: QuotationItemInput): CalculatedItem {
  const quantity = Math.max(0, item.quantity);
  const unitPrice = Math.max(0, item.unitPrice);
  const discount = Math.min(100, Math.max(0, item.discount));
  const gross = round2(quantity * unitPrice);
  const discountAmount = round2(gross * (discount / 100));
  const lineTotal = round2(gross - discountAmount);
  return { ...item, quantity, unitPrice, discount, gross, discountAmount, lineTotal };
}

export function calculateQuotation(items: QuotationItemInput[], taxRate: number): { items: CalculatedItem[]; totals: QuotationTotals } {
  const rate = Math.min(100, Math.max(0, taxRate));
  const calculated = items.map(calculateItem);
  const subtotal = round2(calculated.reduce((sum, item) => sum + item.gross, 0));
  const discount = round2(calculated.reduce((sum, item) => sum + item.discountAmount, 0));
  const taxableAmount = round2(subtotal - discount);
  const taxAmount = round2(taxableAmount * (rate / 100));
  const total = round2(taxableAmount + taxAmount);
  return { items: calculated, totals: { subtotal, discount, taxableAmount, taxRate: rate, taxAmount, total } };
}

/** Quotation numbers look like RV-2026-0001 and increase per calendar year. */
export function nextQuotationNumber(existingNumbers: string[], year: number): string {
  const prefix = `RV-${year}-`;
  let max = 0;
  for (const number of existingNumbers) {
    if (!number.startsWith(prefix)) continue;
    const seq = Number(number.slice(prefix.length));
    if (Number.isInteger(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function formatInr(value: number): string {
  return `INR ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}
