// Client-side preview of quotation totals. The server recalculates everything
// before saving (artifacts/api-server/src/lib/quotations/calc.ts); the values
// shown after save always come from the server response.

export interface PricingLine {
  productModel: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function lineAmount(line: PricingLine): number {
  const gross = round2(Math.max(0, line.quantity) * Math.max(0, line.unitPrice));
  return round2(gross - round2(gross * (Math.min(100, Math.max(0, line.discount)) / 100)));
}

export function previewTotals(lines: PricingLine[], taxRate: number) {
  const subtotal = round2(lines.reduce((sum, line) => sum + round2(Math.max(0, line.quantity) * Math.max(0, line.unitPrice)), 0));
  const discount = round2(lines.reduce((sum, line) => sum + round2(round2(Math.max(0, line.quantity) * Math.max(0, line.unitPrice)) * (Math.min(100, Math.max(0, line.discount)) / 100)), 0));
  const taxableAmount = round2(subtotal - discount);
  const taxAmount = round2(taxableAmount * (Math.min(100, Math.max(0, taxRate)) / 100));
  return { subtotal, discount, taxableAmount, taxAmount, total: round2(taxableAmount + taxAmount) };
}

export function formatInr(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)}`;
}
