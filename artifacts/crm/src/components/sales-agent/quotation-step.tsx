import type { Lead, Quotation } from '@workspace/api-client-react';
import { getGetQuotationPdfUrl } from '@workspace/api-client-react';
import { ArrowUpRight, CheckCircle2, FileText, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeading, SectionLabel } from '@/components/crm-ui';
import { formatInr } from '@/lib/quotation-math';
import { CalendarDateLabel } from './follow-up-step';

interface QuotationStepProps {
  lead: Lead;
  quotation: Quotation;
  onEdit: () => void;
  onGenerate: () => void;
  generating: boolean;
  onContinue: () => void;
}

export function quotationPdfHref(id: number): string {
  return getGetQuotationPdfUrl(id);
}

export function QuotationStep({ lead, quotation, onEdit, onGenerate, generating, onContinue }: QuotationStepProps) {
  const generated = quotation.status === 'Generated';
  return <>
    <PageHeading eyebrow="Step 5 · Quotation" title={quotation.quotationNumber} description={generated ? 'Generated and recorded on the lead. Download the PDF or continue to schedule the follow-up.' : 'Review the saved quotation. Generate it to lock the number on the lead and produce the PDF.'} action={<span className={`status-pill ${generated ? 'status-won' : 'status-proposal'}`} data-testid="text-quotation-status">{quotation.status}</span>} />
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 md:p-6">
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Meta label="Customer" value={lead.companyName} sub={lead.contactName} />
            <Meta label="Quotation date" value={<CalendarDateLabel value={quotation.createdAt.slice(0, 10)} />} />
            <Meta label="Valid until" value={quotation.validUntil ? <CalendarDateLabel value={quotation.validUntil} /> : 'To be confirmed'} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm" data-testid="table-quotation-items">
              <thead><tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><th className="pb-2 pr-3 text-left font-medium">Product</th><th className="pb-2 px-2 text-right font-medium">Qty</th><th className="pb-2 px-2 text-left font-medium">Unit</th><th className="pb-2 px-2 text-right font-medium">Unit price</th><th className="pb-2 px-2 text-right font-medium">Disc</th><th className="pb-2 pl-2 text-right font-medium">Amount</th></tr></thead>
              <tbody className="divide-y divide-border">{quotation.items.map((item) => <tr key={item.id}><td className="py-2.5 pr-3">{item.productModel && <p className="font-mono text-xs font-bold">{item.productModel}</p>}<p className="text-xs text-muted-foreground">{item.productName}</p></td><td className="py-2.5 px-2 text-right font-mono text-xs">{item.quantity}</td><td className="py-2.5 px-2 text-xs">{item.unit}</td><td className="py-2.5 px-2 text-right font-mono text-xs">{formatInr(item.unitPrice)}</td><td className="py-2.5 px-2 text-right font-mono text-xs">{item.discount ? `${item.discount}%` : '—'}</td><td className="py-2.5 pl-2 text-right font-mono text-xs font-semibold">{formatInr(item.lineTotal)}</td></tr>)}</tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatInr(quotation.subtotal)} />
            <Row label="Discount" value={quotation.discount ? `− ${formatInr(quotation.discount)}` : formatInr(0)} />
            <Row label="Taxable amount" value={formatInr(quotation.taxableAmount)} />
            <Row label={`GST @ ${quotation.taxRate}%`} value={formatInr(quotation.taxAmount)} />
            <div className="border-t border-border pt-1.5"><Row label="Grand total" value={formatInr(quotation.total)} bold testId="text-quotation-total" /></div>
          </dl>
          {quotation.terms && <div className="mt-5 border-t border-border pt-4"><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Terms & conditions</p><p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{quotation.terms}</p></div>}
        </section>
      </div>
      <aside className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-5 md:p-6">
          <SectionLabel>Actions</SectionLabel>
          <div className="flex flex-col gap-2">
            {!generated && <Button onClick={onGenerate} disabled={generating} data-testid="button-generate-quotation" className="w-full">{generating ? 'Generating…' : 'Generate Quotation'}<FileText className="size-4" /></Button>}
            {generated && <a href={quotationPdfHref(quotation.id)} target="_blank" rel="noreferrer" data-testid="link-download-pdf" className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-primary-border bg-primary px-4 text-sm font-medium text-primary-foreground"><FileText className="size-4" />Download / View Quotation PDF</a>}
            <Button variant="outline" onClick={onEdit} disabled={generating} data-testid="button-edit-quotation" className="w-full"><Pencil className="size-4" />Edit pricing</Button>
            {generated && <Button onClick={onContinue} data-testid="button-continue-follow-up" className="w-full" variant="secondary">Next: schedule follow-up<ArrowUpRight className="size-4" /></Button>}
          </div>
          {generated && <p className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#39715e]" />Recorded on the lead's activity history. Nothing is sent to the customer automatically.</p>}
        </section>
      </aside>
    </div>
  </>;
}

function Meta({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return <div><p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>;
}

function Row({ label, value, bold = false, testId }: { label: string; value: string; bold?: boolean; testId?: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className={bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{label}</dt><dd className={`font-mono ${bold ? 'text-base font-bold' : 'text-xs'}`} data-testid={testId}>{value}</dd></div>;
}
