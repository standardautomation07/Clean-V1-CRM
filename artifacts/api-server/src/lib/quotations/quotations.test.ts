import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateItem, calculateQuotation, formatInr, nextQuotationNumber } from "./calc";
import { renderQuotationPdf } from "./pdf";

describe("quotation calculations", () => {
  it("calculates a line with discount", () => {
    const line = calculateItem({ productModel: "SL1000AC", productName: "SL1000AC 400W", quantity: 2, unit: "Nos", unitPrice: 25000, discount: 5 });
    assert.equal(line.gross, 50000);
    assert.equal(line.discountAmount, 2500);
    assert.equal(line.lineTotal, 47500);
  });

  it("calculates subtotal, discount, GST and grand total", () => {
    const { totals } = calculateQuotation([
      { productModel: "SL1000AC", productName: "Motor", quantity: 1, unit: "Nos", unitPrice: 25000, discount: 5 },
      { productModel: "RT01", productName: "Remote", quantity: 2, unit: "Nos", unitPrice: 1500, discount: 0 },
    ], 18);
    assert.equal(totals.subtotal, 28000);
    assert.equal(totals.discount, 1250);
    assert.equal(totals.taxableAmount, 26750);
    assert.equal(totals.taxAmount, 4815);
    assert.equal(totals.total, 31565);
  });

  it("rounds to two decimals and clamps invalid inputs", () => {
    const { totals, items } = calculateQuotation([{ productModel: "", productName: "Service", quantity: 3, unit: "Nos", unitPrice: 33.333, discount: 150 }], -5);
    assert.equal(items[0].discount, 100);
    assert.equal(items[0].lineTotal, 0);
    assert.equal(totals.taxRate, 0);
    assert.equal(totals.total, 0);
  });

  it("uses a zero GST rate correctly", () => {
    const { totals } = calculateQuotation([{ productModel: "X", productName: "X", quantity: 1, unit: "Nos", unitPrice: 100, discount: 0 }], 0);
    assert.equal(totals.taxAmount, 0);
    assert.equal(totals.total, 100);
  });

  it("formats INR", () => {
    assert.equal(formatInr(31565), "INR 31,565.00");
  });
});

describe("quotation numbering", () => {
  it("starts at 0001 for a new year", () => {
    assert.equal(nextQuotationNumber([], 2026), "RV-2026-0001");
  });
  it("increments the highest existing number of the same year and ignores other years", () => {
    assert.equal(nextQuotationNumber(["RV-2025-0042", "RV-2026-0003", "RV-2026-0010", "garbage"], 2026), "RV-2026-0011");
  });
});

describe("quotation PDF", () => {
  it("renders a PDF that carries the saved totals verbatim", async () => {
    const pdf = await renderQuotationPdf({
      quotationNumber: "RV-2026-0007",
      status: "Generated",
      createdAt: new Date("2026-09-12T10:00:00Z"),
      validUntil: "2026-10-12",
      currency: "INR",
      subtotal: 28000,
      discount: 1250,
      taxRate: 18,
      taxAmount: 4815,
      total: 31565,
      terms: "Prices are in INR and exclusive of transport.",
      notes: "",
      items: [
        { productModel: "SL1000AC", productName: "SL1000AC 400W Heavy Industrial AC Sliding Gate Motor", quantity: 1, unit: "Nos", unitPrice: 25000, discount: 5, lineTotal: 23750 },
        { productModel: "RT01", productName: "4-Channel Remote Transmitter", quantity: 2, unit: "Nos", unitPrice: 1500, discount: 0, lineTotal: 3000 },
      ],
      customer: { companyName: "ABC Industries", contactName: "Ravi Sharma", phone: "+91 98765 43210", email: "", location: "Ahmedabad" },
    }, { compress: false });
    assert.ok(pdf.length > 1000);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    // PDFKit writes page text as kerned TJ arrays of hex-encoded WinAnsi chunks;
    // join the chunks of each TJ operator so we can assert on the rendered content.
    const raw = pdf.toString("latin1");
    const text = Array.from(raw.matchAll(/\[([^\]]*)\]\s*TJ/g), (m) => Array.from(m[1].matchAll(/<([0-9a-fA-F]+)>/g), (h) => Buffer.from(h[1], "hex").toString("latin1")).join("")).join("\n");
    for (const expected of ["RV-2026-0007", "ABC Industries", "SL1000AC", "INR 31,565.00", "INR 4,815.00", "INR 28,000.00", "GST @ 18%", "ROLLVENTO"]) {
      assert.ok(text.includes(expected), `PDF should contain "${expected}"`);
    }
    // Missing company configuration is shown as a placeholder, never invented.
    assert.ok(text.includes("ROLLVENTO_GSTIN") || process.env.ROLLVENTO_GSTIN);
  });
});
