import PDFDocument from "pdfkit";

import { getRollventoBrand } from "../knowledge/products";
import { formatInr } from "./calc";

// Company details that are not in the CRM yet come from environment variables.
// When unset, the PDF prints a clearly marked placeholder instead of inventing
// legal information.
function companyDetails() {
  const brand = getRollventoBrand();
  const cfg = (name: string, label: string) => process.env[name]?.trim() || `[${label}: set ${name}]`;
  return {
    legalName: brand.legalName ?? "ROLLVENTO AUTOMATION PVT. LTD.",
    tagline: brand.tagline ?? "",
    address: cfg("ROLLVENTO_COMPANY_ADDRESS", "Registered address to be configured"),
    gstin: cfg("ROLLVENTO_GSTIN", "GSTIN to be configured"),
    phone: cfg("ROLLVENTO_PHONE", "Phone to be configured"),
    email: cfg("ROLLVENTO_EMAIL", "Email to be configured"),
    website: process.env.ROLLVENTO_WEBSITE?.trim() || "www.rollvento.in",
    bank: process.env.ROLLVENTO_BANK_DETAILS?.trim() || null,
  };
}

export interface PdfQuotationItem {
  productModel: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface PdfQuotation {
  quotationNumber: string;
  status: string;
  createdAt: Date;
  validUntil: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  terms: string;
  notes: string;
  items: PdfQuotationItem[];
  customer: { companyName: string; contactName: string; phone: string; email: string; location: string | null };
}

const ACCENT = "#e8683a";
const INK = "#1f2a30";
const MUTED = "#6b7680";
const RULE = "#d9dee2";

function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function money(value: number): string {
  return formatInr(value);
}

export interface RenderOptions {
  compress?: boolean;
}

/** Renders the saved quotation to a PDF buffer. Totals are printed exactly as stored; nothing is recomputed here. */
export function renderQuotationPdf(quotation: PdfQuotation, options: RenderOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, compress: options.compress ?? true, info: { Title: `Quotation ${quotation.quotationNumber}`, Author: companyDetails().legalName } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const company = companyDetails();
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Header band
    doc.rect(0, 0, doc.page.width, 92).fill(INK);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text("ROLLVENTO", left, 30);
    doc.font("Helvetica").fontSize(9).fillColor("#c9d1d6").text(company.legalName, left, 56);
    if (company.tagline) doc.text(company.tagline, left, 68);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(ACCENT).text("QUOTATION", left, 34, { width, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#ffffff").text(quotation.quotationNumber, left, 60, { width, align: "right" });

    // Meta block
    let y = 112;
    const metaCols = [left, left + 130, left + 270, left + 410];
    const metaW = (i: number) => (i < 3 ? metaCols[i + 1] - metaCols[i] - 8 : right - metaCols[i]);
    doc.fillColor(MUTED).font("Helvetica").fontSize(8);
    ["QUOTATION NO.", "DATE", "VALID UNTIL", "STATUS"].forEach((label, i) => doc.text(label, metaCols[i], y, { width: metaW(i), lineBreak: false }));
    y += 11;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10);
    [quotation.quotationNumber, formatDate(quotation.createdAt), quotation.validUntil ? formatDate(quotation.validUntil) : "To be confirmed", quotation.status].forEach((value, i) => doc.text(value, metaCols[i], y, { width: metaW(i), lineBreak: false }));
    y += 26;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
    y += 14;

    // Parties
    const col = width / 2 - 10;
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text("QUOTATION FOR", left, y).text("FROM", left + col + 20, y);
    y += 11;
    const customerLines = [quotation.customer.companyName, quotation.customer.contactName, quotation.customer.phone, quotation.customer.email, quotation.customer.location ?? ""].filter(Boolean);
    const companyLines = [company.legalName, company.address, `GSTIN: ${company.gstin}`, `${company.phone}  ·  ${company.email}`, company.website];
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10).text(customerLines[0] ?? "", left, y, { width: col });
    doc.font("Helvetica").fontSize(9).text(customerLines.slice(1).join("\n"), left, y + 14, { width: col });
    doc.font("Helvetica-Bold").fontSize(10).text(companyLines[0], left + col + 20, y, { width: col });
    doc.font("Helvetica").fontSize(9).text(companyLines.slice(1).join("\n"), left + col + 20, y + 14, { width: col });
    y = Math.max(doc.y, y + 14 + 12 * 4) + 18;

    // Items table
    const cols = [
      { key: "product", label: "Product", x: left, w: 196, align: "left" as const },
      { key: "qty", label: "Qty", x: left + 200, w: 40, align: "right" as const },
      { key: "unit", label: "Unit", x: left + 244, w: 40, align: "left" as const },
      { key: "price", label: "Unit Price", x: left + 288, w: 84, align: "right" as const },
      { key: "disc", label: "Disc %", x: left + 376, w: 40, align: "right" as const },
      { key: "amount", label: "Amount", x: left + 420, w: width - 420, align: "right" as const },
    ];
    const drawTableHeader = () => {
      doc.rect(left, y, width, 20).fill("#f2f4f6");
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8);
      for (const c of cols) doc.text(c.label.toUpperCase(), c.x + 4, y + 6, { width: c.w - 8, align: c.align });
      y += 24;
    };
    drawTableHeader();
    doc.font("Helvetica").fontSize(9).fillColor(INK);
    for (const item of quotation.items) {
      const nameHeight = doc.heightOfString(item.productName, { width: cols[0].w - 8 });
      const rowHeight = Math.max(30, nameHeight + 18);
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 140) {
        doc.addPage();
        y = doc.page.margins.top;
        drawTableHeader();
        doc.font("Helvetica").fontSize(9).fillColor(INK);
      }
      doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(item.productModel || item.productName, cols[0].x + 4, y, { width: cols[0].w - 8 });
      if (item.productModel) doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(item.productName, cols[0].x + 4, y + 12, { width: cols[0].w - 8 });
      doc.font("Helvetica").fontSize(9).fillColor(INK);
      doc.text(String(item.quantity), cols[1].x + 4, y, { width: cols[1].w - 8, align: "right" });
      doc.text(item.unit, cols[2].x + 4, y, { width: cols[2].w - 8 });
      doc.text(money(item.unitPrice), cols[3].x + 4, y, { width: cols[3].w - 8, align: "right" });
      doc.text(item.discount ? `${item.discount}%` : "-", cols[4].x + 4, y, { width: cols[4].w - 8, align: "right" });
      doc.text(money(item.lineTotal), cols[5].x + 4, y, { width: cols[5].w - 8, align: "right" });
      y += rowHeight;
      doc.moveTo(left, y - 6).lineTo(right, y - 6).strokeColor(RULE).lineWidth(0.5).stroke();
    }

    // Totals
    y += 6;
    const totalsX = left + 312;
    const totalsW = right - totalsX;
    const line = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9).fillColor(bold ? INK : MUTED).text(label, totalsX, y, { width: totalsW - 120 });
      doc.fillColor(INK).text(value, totalsX + totalsW - 120, y, { width: 120, align: "right" });
      y += bold ? 18 : 15;
    };
    line("Subtotal", money(quotation.subtotal));
    line("Discount", quotation.discount ? `- ${money(quotation.discount)}` : money(0));
    line("Taxable amount", money(quotation.subtotal - quotation.discount));
    line(`GST @ ${quotation.taxRate}%`, money(quotation.taxAmount));
    doc.moveTo(totalsX, y).lineTo(right, y).strokeColor(ACCENT).lineWidth(1).stroke();
    y += 6;
    line("Grand Total", money(quotation.total), true);
    y += 10;

    // Notes + Terms
    if (quotation.notes.trim()) {
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("NOTES", left, y);
      y += 11;
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(quotation.notes.trim(), left, y, { width });
      y = doc.y + 14;
    }
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("TERMS & CONDITIONS", left, y);
    y += 11;
    doc.fillColor(INK).font("Helvetica").fontSize(9).text(quotation.terms.trim() || "To be confirmed.", left, y, { width });
    y = doc.y + 14;
    if (company.bank) {
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("BANK DETAILS", left, y);
      y += 11;
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(company.bank, left, y, { width });
    }

    // Footer on every page. The footer sits inside the bottom margin, so the
    // margin is lifted while writing it - otherwise PDFKit would start a new page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      const fy = doc.page.height - 36;
      doc.moveTo(left, fy - 8).lineTo(right, fy - 8).strokeColor(RULE).lineWidth(0.5).stroke();
      doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(`${company.legalName}  ·  ${company.website}  ·  This quotation is valid until ${quotation.validUntil ? formatDate(quotation.validUntil) : "the date confirmed by Rollvento"}.`, left, fy, { width: width - 60, lineBreak: false });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, right - 60, fy, { width: 60, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
