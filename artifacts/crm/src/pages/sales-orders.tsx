import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getGetQuotationPdfUrl,
  listQuotations,
  QuotationStatus,
  type QuotationSummary,
} from '@workspace/api-client-react';
import { ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import { AppShell, EmptyState, PageHeading, QueryError, SectionLabel, SkeletonBlock } from '@/components/crm-ui';
import { Button } from '@/components/ui/button';
import { formatInr } from '@/lib/quotation-math';

// Sales Orders start from a generated quotation, so this page is a picker over
// every generated quotation rather than a form. Creating the order goes through
// NOVA's create_sales_order, which is financial risk and approval-gated: the
// request lands in the approval queue and is never auto-approved in bulk.

interface CommercialDocument {
  id: number;
  documentType: string;
  documentNumber: string;
  status: string;
  leadId: number;
  documentDate: string;
  totals?: { total?: number; currency?: string };
  customerSnapshot?: { companyName?: string };
}

export function SalesOrders() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null);

  const quotations = useQuery({
    queryKey: ['quotations', 'Generated'],
    queryFn: () => listQuotations({ status: QuotationStatus.Generated }),
  });

  const documents = useQuery({
    queryKey: ['documents', 'SalesOrder'],
    queryFn: async (): Promise<CommercialDocument[]> => {
      // The endpoint filters on "type" and answers with a bare array.
      const response = await fetch('/api/documents?type=SalesOrder', { credentials: 'include' });
      if (!response.ok) throw new Error('Sales orders could not be loaded.');
      const rows = (await response.json()) as CommercialDocument[];
      return Array.isArray(rows) ? rows : [];
    },
  });

  const options = quotations.data ?? [];
  const selected = useMemo(
    () => options.find((q: QuotationSummary) => String(q.id) === selectedId) ?? null,
    [options, selectedId],
  );

  async function generateSalesOrder() {
    if (!selected) return;
    setSubmitting(true);
    setOutcome(null);
    try {
      const response = await fetch('/api/nova/execute', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'create_sales_order', input: { quotationId: selected.id } }),
      });
      const result = await response.json();
      if (result?.pendingApproval) {
        setOutcome({
          ok: true,
          message: `Sales Order from ${selected.quotationNumber} sent for approval. Approve it in NOVA to create the document.`,
        });
      } else if (result?.ok) {
        setOutcome({ ok: true, message: `Sales Order ${result.data?.documentNumber ?? ''} created.` });
        await queryClient.invalidateQueries({ queryKey: ['documents', 'SalesOrder'] });
      } else {
        setOutcome({ ok: false, message: String(result?.error ?? 'The Sales Order could not be created.') });
      }
    } catch {
      setOutcome({ ok: false, message: 'The Sales Order could not be created.' });
    } finally {
      setSubmitting(false);
    }
  }

  return <AppShell>
    <PageHeading
      eyebrow="Commercial"
      title="Sales Orders"
      description="Every generated quotation and its PDF in one place. Pick one to raise a Sales Order from it."
    />

    <section className="rounded-xl border border-border bg-card p-5 md:p-6">
      <SectionLabel>Raise a Sales Order</SectionLabel>
      {quotations.isLoading
        ? <SkeletonBlock className="h-12 w-full" />
        : quotations.isError
          ? <QueryError message="Quotations could not be loaded." />
          : options.length === 0
            ? <p className="text-xs text-muted-foreground">No generated quotations yet. A quotation has to be generated before it can become a Sales Order.</p>
            : <>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <label htmlFor="select-quotation" className="text-xs font-semibold text-foreground/80">Quotation</label>
                    <select
                      id="select-quotation"
                      data-testid="select-quotation"
                      value={selectedId}
                      onChange={(e) => { setSelectedId(e.target.value); setOutcome(null); }}
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      <option value="">Select a generated quotation…</option>
                      {options.map((q: QuotationSummary) => (
                        <option key={q.id} value={String(q.id)}>
                          {q.quotationNumber} · {q.companyName ?? `Lead #${q.leadId}`} · {formatInr(q.total)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    disabled={!selected || submitting}
                    onClick={generateSalesOrder}
                    data-testid="button-generate-sales-order"
                  ><ShieldCheck className="size-4" />{submitting ? 'Submitting…' : 'Generate Sales Order'}</Button>
                </div>

                {selected && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <span className="font-mono font-bold">{selected.quotationNumber}</span>
                  <span className="text-muted-foreground">{selected.companyName ?? `Lead #${selected.leadId}`}</span>
                  <span className="font-mono font-semibold">{formatInr(selected.total)}</span>
                  <a
                    href={getGetQuotationPdfUrl(selected.id)}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="link-selected-quotation-pdf"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  ><FileText className="size-3.5" />View PDF<ExternalLink className="size-3" /></a>
                  <Link href={`/leads/${selected.leadId}`} className="text-muted-foreground hover:underline">Open lead</Link>
                </div>}

                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Creating a Sales Order is a financial action, so it goes to the approval queue in NOVA rather than
                  being created straight away, and it is never approved as part of a batch.
                </p>
              </>}

      {outcome && <p className={`mt-3 rounded-lg p-2.5 text-[11px] ${outcome.ok ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : 'bg-destructive/10 text-destructive'}`}>
        {outcome.message}
      </p>}
    </section>

    <section className="mt-6 rounded-xl border border-border bg-card p-5 md:p-6">
      <SectionLabel count={documents.data?.length ?? 0}>Sales Orders</SectionLabel>
      {documents.isLoading
        ? <SkeletonBlock className="h-12 w-full" />
        : documents.isError
          ? <QueryError message="Sales orders could not be loaded." />
          : (documents.data ?? []).length === 0
            ? <EmptyState title="No Sales Orders yet" description="Raise one from a generated quotation above." />
            : <div className="divide-y divide-border">
                {(documents.data ?? []).map((doc) => (
                  <div key={doc.id} className="grid gap-2 py-3 sm:grid-cols-[1.1fr_1.2fr_1fr_auto] sm:items-center">
                    <p className="font-mono text-xs font-bold">{doc.documentNumber}</p>
                    <p className="text-xs text-muted-foreground">{doc.customerSnapshot?.companyName ?? `Lead #${doc.leadId}`}</p>
                    <p className="font-mono text-xs font-semibold">{doc.totals?.total === undefined ? '—' : formatInr(doc.totals.total)}</p>
                    <span className="status-pill status-won">{doc.status}</span>
                  </div>
                ))}
              </div>}
    </section>
  </AppShell>;
}
