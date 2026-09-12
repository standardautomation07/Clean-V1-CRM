import { useMemo, useState } from 'react';
import type { Lead, Product } from '@workspace/api-client-react';
import { ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeading, SectionLabel } from '@/components/crm-ui';
import { formatInr, lineAmount, previewTotals } from '@/lib/quotation-math';
import { Field } from './fields';

export interface PricingLineState {
  key: string;
  productModel: string;
  productName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
}

export interface PricingFormState {
  lines: PricingLineState[];
  taxRate: string;
  validUntil: string;
  terms: string;
  notes: string;
}

let lineCounter = 0;
export function newLine(partial: Partial<PricingLineState> = {}): PricingLineState {
  lineCounter += 1;
  return { key: `line-${Date.now()}-${lineCounter}`, productModel: '', productName: '', quantity: '1', unit: 'Nos', unitPrice: '', discount: '0', ...partial };
}

export function toNumericLines(lines: PricingLineState[]) {
  return lines.map((line) => ({
    productModel: line.productModel.trim(),
    productName: line.productName.trim(),
    quantity: Number(line.quantity) || 0,
    unit: line.unit.trim() || 'Nos',
    unitPrice: Number(line.unitPrice) || 0,
    discount: Number(line.discount) || 0,
  }));
}

interface PricingStepProps {
  lead: Lead;
  form: PricingFormState;
  onChange: (next: PricingFormState) => void;
  catalogue: Product[];
  onSave: () => void;
  saving: boolean;
  editing: boolean;
  onBack?: () => void;
}

export function PricingStep({ lead, form, onChange, catalogue, onSave, saving, editing, onBack }: PricingStepProps) {
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const totals = useMemo(() => previewTotals(toNumericLines(form.lines), Number(form.taxRate) || 0), [form.lines, form.taxRate]);
  const missingPrices = form.lines.filter((line) => !line.unitPrice.trim() || Number(line.unitPrice) <= 0).length;
  const pickerResults = pickerOpen ? catalogue.filter((p) => !pickerQuery.trim() || `${p.model} ${p.productName} ${p.category}`.toLowerCase().includes(pickerQuery.trim().toLowerCase())).slice(0, 12) : [];

  function updateLine(key: string, patch: Partial<PricingLineState>) { onChange({ ...form, lines: form.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) }); }
  function removeLine(key: string) { onChange({ ...form, lines: form.lines.filter((line) => line.key !== key) }); }
  function addProduct(product: Product) { onChange({ ...form, lines: [...form.lines, newLine({ productModel: product.model, productName: product.productName })] }); setPickerOpen(false); setPickerQuery(''); }

  return <>
    <PageHeading eyebrow="Step 4 · Pricing" title="Quotation" description={`Enter your prices for ${lead.companyName}. The AI never suggests prices; totals are calculated and re-checked by the server.`} action={<div className="flex items-center gap-2 rounded-lg bg-accent/45 px-3 py-2 text-xs font-semibold text-accent-foreground">Currency: INR (₹)</div>} />
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <SectionLabel count={form.lines.length}>Products & prices</SectionLabel>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPickerOpen((o) => !o)} data-testid="button-add-catalogue-product" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="size-3.5" />Add Rollvento product</button>
              <button type="button" onClick={() => onChange({ ...form, lines: [...form.lines, newLine()] })} data-testid="button-add-custom-line" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><Plus className="size-3.5" />Custom line</button>
            </div>
          </div>
          {pickerOpen && <div className="mb-4 rounded-lg border border-border bg-background/60 p-3">
            <Label htmlFor="pricing-picker" className="text-xs font-semibold text-foreground/80">Search the Rollvento catalogue</Label>
            <Input id="pricing-picker" value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Model, name or category" data-testid="input-pricing-picker" className="mt-1.5 h-8 bg-background text-xs" autoFocus />
            <ul className="mt-2 max-h-52 divide-y divide-border overflow-auto rounded-md border border-border bg-card">{pickerResults.length ? pickerResults.map((product) => <li key={product.model}><button type="button" onClick={() => addProduct(product)} data-testid={`option-pricing-product-${product.model}`} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted/50"><span className="min-w-0"><span className="font-mono font-bold">{product.model}</span><span className="ml-2 truncate text-muted-foreground">{product.productName}</span></span><span className="shrink-0 text-[10px] text-muted-foreground">{product.category}</span></button></li>) : <li className="px-3 py-3 text-xs text-muted-foreground">No catalogue product matches.</li>}</ul>
          </div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm" data-testid="table-pricing">
              <thead><tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><th className="pb-2 pr-3 text-left font-medium">Product</th><th className="pb-2 px-2 text-right font-medium">Qty</th><th className="pb-2 px-2 text-left font-medium">Unit</th><th className="pb-2 px-2 text-right font-medium">Unit price (₹)</th><th className="pb-2 px-2 text-right font-medium">Disc %</th><th className="pb-2 pl-2 text-right font-medium">Amount</th><th className="pb-2 pl-2" /></tr></thead>
              <tbody className="divide-y divide-border">
                {form.lines.map((line, index) => <tr key={line.key} data-testid={`row-pricing-${index}`} className="align-top">
                  <td className="py-3 pr-3"><div className="space-y-1.5">{line.productModel ? <p className="font-mono text-xs font-bold">{line.productModel}</p> : null}<Input value={line.productName} onChange={(e) => updateLine(line.key, { productName: e.target.value })} placeholder="Description" aria-label="Product name" data-testid={`input-line-name-${index}`} className="h-8 bg-background text-xs" /></div></td>
                  <td className="py-3 px-2"><Input type="number" min={0} step="1" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} aria-label="Quantity" data-testid={`input-line-qty-${index}`} className="h-8 w-20 bg-background text-right text-xs" /></td>
                  <td className="py-3 px-2"><Input value={line.unit} onChange={(e) => updateLine(line.key, { unit: e.target.value })} aria-label="Unit" data-testid={`input-line-unit-${index}`} className="h-8 w-20 bg-background text-xs" /></td>
                  <td className="py-3 px-2"><Input type="number" min={0} step="0.01" value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })} placeholder="0.00" aria-label="Unit price" data-testid={`input-line-price-${index}`} className={`h-8 w-32 bg-background text-right text-xs ${!line.unitPrice.trim() ? 'border-primary/50' : ''}`} /></td>
                  <td className="py-3 px-2"><Input type="number" min={0} max={100} step="0.5" value={line.discount} onChange={(e) => updateLine(line.key, { discount: e.target.value })} aria-label="Discount percent" data-testid={`input-line-discount-${index}`} className="h-8 w-20 bg-background text-right text-xs" /></td>
                  <td className="py-3 pl-2 text-right font-mono text-xs font-semibold" data-testid={`text-line-amount-${index}`}>{formatInr(lineAmount(toNumericLines([line])[0]))}</td>
                  <td className="py-3 pl-2 text-right"><button type="button" onClick={() => removeLine(line.key)} aria-label="Remove line" data-testid={`button-remove-line-${index}`} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button></td>
                </tr>)}
                {!form.lines.length && <tr><td colSpan={7} className="py-8 text-center text-xs text-muted-foreground">No lines yet. Add a Rollvento product from the catalogue or a custom line.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 md:p-6">
          <SectionLabel>Tax, validity & terms</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GST %" value={form.taxRate} onChange={(v) => onChange({ ...form, taxRate: v })} type="number" min={0} step="0.5" testId="input-tax-rate" />
            <Field label="Valid until" value={form.validUntil} onChange={(v) => onChange({ ...form, validUntil: v })} type="date" testId="input-valid-until" />
          </div>
          <div className="mt-4 space-y-1.5"><Label htmlFor="input-terms" className="text-xs font-semibold text-foreground/80">Terms & conditions</Label><Textarea id="input-terms" data-testid="input-terms" value={form.terms} onChange={(e) => onChange({ ...form, terms: e.target.value })} className="min-h-[120px] bg-background text-sm" /></div>
          <div className="mt-4 space-y-1.5"><Label htmlFor="input-quote-notes" className="text-xs font-semibold text-foreground/80">Notes on the quotation (optional)</Label><Textarea id="input-quote-notes" data-testid="input-quote-notes" value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} placeholder="Delivery lead time, site conditions…" className="min-h-[70px] bg-background text-sm" /></div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 md:p-6" data-testid="panel-totals">
          <SectionLabel>Totals (preview)</SectionLabel>
          <dl className="space-y-2 text-sm">
            <Row label="Subtotal" value={formatInr(totals.subtotal)} />
            <Row label="Discount" value={totals.discount ? `− ${formatInr(totals.discount)}` : formatInr(0)} />
            <Row label="Taxable amount" value={formatInr(totals.taxableAmount)} />
            <Row label={`GST @ ${Number(form.taxRate) || 0}%`} value={formatInr(totals.taxAmount)} />
            <div className="border-t border-border pt-2"><Row label="Grand total" value={formatInr(totals.total)} bold testId="text-grand-total" /></div>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">Final figures are recalculated by the server when you save.</p>
          {missingPrices > 0 && <p className="mt-2 text-[11px] font-semibold text-primary" data-testid="text-missing-prices">{missingPrices} line{missingPrices === 1 ? '' : 's'} still need a unit price.</p>}
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={onSave} disabled={saving || !form.lines.length} data-testid="button-save-quotation" className="w-full">{saving ? 'Saving…' : editing ? 'Update quotation' : 'Create Quotation'}<ArrowUpRight className="size-4" /></Button>
            {onBack && <Button variant="outline" onClick={onBack} disabled={saving} data-testid="button-pricing-back" className="w-full">Back</Button>}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-sidebar p-5 text-sidebar-foreground">
          <p className="font-display text-base font-bold tracking-[-0.03em]">Lead #{lead.id}</p>
          <p className="mt-1 text-sm">{lead.companyName}</p>
          <p className="text-xs text-sidebar-foreground/70">{lead.contactName}{lead.phone ? ` · ${lead.phone}` : ''}</p>
          <p className="mt-3 text-[11px] leading-relaxed text-sidebar-foreground/60">{lead.requirement}</p>
        </section>
      </aside>
    </div>
  </>;
}

function Row({ label, value, bold = false, testId }: { label: string; value: string; bold?: boolean; testId?: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className={bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{label}</dt><dd className={`font-mono ${bold ? 'text-base font-bold' : 'text-xs'}`} data-testid={testId}>{value}</dd></div>;
}
