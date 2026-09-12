import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityType,
  getGetDashboardSummaryQueryKey,
  getGetLeadQueryKey,
  getListFollowUpsQueryKey,
  getListLeadActivitiesQueryKey,
  getListLeadQuotationsQueryKey,
  getListLeadsQueryKey,
  LeadStatus,
  type EnquiryInput,
  type Lead,
  type Quotation,
  useCreateLead,
  useCreateLeadActivity,
  useCreateQuotation,
  useExtractEnquiry,
  useGenerateQuotation,
  useGetLead,
  useListProducts,
  useMatchProducts,
  useUpdateLead,
  useUpdateQuotation,
} from '@workspace/api-client-react';
import { ArrowUpRight, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AppShell, PageHeading, SectionLabel } from '@/components/crm-ui';
import { useToast } from '@/hooks/use-toast';
import { Field } from '@/components/sales-agent/fields';
import { WorkflowStepper } from '@/components/sales-agent/stepper';
import { ReviewStep } from '@/components/sales-agent/review-step';
import { PricingStep, newLine, toNumericLines, type PricingFormState } from '@/components/sales-agent/pricing-step';
import { QuotationStep } from '@/components/sales-agent/quotation-step';
import { FollowUpStep } from '@/components/sales-agent/follow-up-step';
import { ProductSpecGrid } from '@/components/sales-agent/product-card';
import { DEFAULT_TERMS, applyMatch, describeItem, errorMessage, toMatchItems, toReviewState, todayPlusDays, type ReviewState, type WorkflowStep } from '@/components/sales-agent/types';

type EnquiryForm = Required<EnquiryInput>;

function blankForm(): EnquiryForm {
  return { companyName: '', contactName: '', phone: '', email: '', location: '', requirement: '' };
}

function blankPricing(): PricingFormState {
  return { lines: [], taxRate: '18', validUntil: todayPlusDays(30), terms: DEFAULT_TERMS, notes: '' };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The guided AI Sales Agent workflow:
// Enquiry -> Product (AI review) -> Lead -> Pricing -> Quotation -> Follow-up.
// Every write to the CRM happens only after an explicit user action.
export function NewEnquiry() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<WorkflowStep>('enquiry');
  const [form, setForm] = useState<EnquiryForm>(blankForm);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [pricing, setPricing] = useState<PricingFormState>(blankPricing);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const catalogue = useListProducts();
  const extract = useExtractEnquiry();
  const match = useMatchProducts();
  const createLead = useCreateLead();
  const createActivity = useCreateLeadActivity();
  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();
  const generateQuotation = useGenerateQuotation();
  const updateLead = useUpdateLead();

  // Entering from Lead Detail ("New quotation") jumps straight to pricing.
  const leadIdParam = Number(new URLSearchParams(search).get('leadId'));
  const existingLead = useGetLead(leadIdParam, { query: { enabled: Number.isFinite(leadIdParam) && leadIdParam > 0 && !lead, queryKey: getGetLeadQueryKey(leadIdParam) } });
  useEffect(() => {
    if (existingLead.data?.lead && !lead) {
      setLead(existingLead.data.lead);
      setStep('pricing');
    }
  }, [existingLead.data, lead]);

  function invalidateLead(id: number) {
    queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListLeadActivitiesQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListLeadQuotationsQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListFollowUpsQueryKey() });
  }

  function fail(title: string, error: unknown, fallback: string) {
    toast({ variant: 'destructive', title, description: errorMessage(error, fallback) });
  }

  function resetAll() {
    setStep('enquiry'); setForm(blankForm()); setReview(null); setLead(null); setPricing(blankPricing()); setQuotation(null); setScheduledDate(null);
    setLocation('/enquiry');
  }

  // ---- Step 1: enquiry -------------------------------------------------
  function startAiProcess(event: FormEvent) {
    event.preventDefault();
    if (!form.requirement.trim()) {
      toast({ variant: 'destructive', title: 'Add the requirement', description: 'Describe what the customer needs before starting the AI process.' });
      return;
    }
    const payload: EnquiryInput = { companyName: form.companyName.trim(), contactName: form.contactName.trim(), phone: form.phone.trim(), email: form.email.trim(), location: form.location.trim(), requirement: form.requirement.trim() };
    extract.mutate({ data: payload }, {
      onSuccess: (result) => { setReview(toReviewState(result.enquiry, result.matches)); setStep('product'); window.scrollTo({ top: 0 }); },
      onError: (error) => fail('AI extraction failed', error, 'The enquiry could not be processed. Please try again.'),
    });
  }

  // ---- Step 2: product review ------------------------------------------
  function rematch() {
    if (!review) return;
    match.mutate({ data: { items: toMatchItems(review.items) } }, {
      onSuccess: (matches) => setReview((current) => current ? { ...current, items: current.items.map((item, index) => applyMatch(item, matches.find((m) => m.itemIndex === index))) } : current),
      onError: (error) => fail('Could not update recommendations', error, 'Please try again.'),
    });
  }

  async function confirmAndCreateLead() {
    if (!review) return;
    const companyName = review.companyName.trim();
    const contactName = review.contactName.trim();
    const email = review.email.trim();
    if (!companyName || !contactName) { toast({ variant: 'destructive', title: 'Company and contact are required', description: 'Add both before creating the lead.' }); return; }
    if (email && !EMAIL_PATTERN.test(email)) { toast({ variant: 'destructive', title: 'Check the email address', description: 'Enter a valid email or leave it empty.' }); return; }
    setBusy(true);
    try {
      const items = review.items.filter((item) => item.productHint.trim() || item.selectedProduct);
      const requirement = items.length ? items.map(describeItem).join('; ') : form.requirement.trim();
      const noteParts: string[] = [];
      if (review.location.trim()) noteParts.push(`Location: ${review.location.trim()}`);
      const products = items.filter((item) => item.selectedProduct).map((item) => `${item.selectedProduct!.model} (${item.selectedProduct!.category})`);
      if (products.length) noteParts.push(`Rollvento products: ${products.join(', ')}`);
      if (review.notes.trim()) noteParts.push(review.notes.trim());
      const created = await createLead.mutateAsync({ data: { companyName, contactName, phone: review.phone.trim(), email, source: review.source, requirement, estimatedValue: 0, status: LeadStatus.New, nextFollowUp: null, notes: noteParts.join('\n') } });
      try {
        await createActivity.mutateAsync({ id: created.id, data: { type: ActivityType.Note, description: `Original Enquiry:\n${form.requirement.trim()}` } });
        await createActivity.mutateAsync({ id: created.id, data: { type: ActivityType.Note, description: `AI extraction performed on the original enquiry (${items.length} item${items.length === 1 ? '' : 's'}; ${products.length ? `Rollvento products selected: ${products.join(', ')}` : 'no product selected yet'}). Details were reviewed and confirmed by the user before this lead was created.` } });
      } catch (error) {
        toast({ title: 'Lead created, note not saved', description: errorMessage(error, 'The original enquiry could not be attached as a note.') });
      }
      invalidateLead(created.id);
      setLead(created);
      setPricing({ ...blankPricing(), lines: items.filter((item) => item.selectedProduct).map((item) => newLine({ productModel: item.selectedProduct!.model, productName: item.selectedProduct!.productName, quantity: item.quantity.trim() || '1', unit: item.unit.trim() || 'Nos' })) });
      setStep('lead');
      window.scrollTo({ top: 0 });
      toast({ title: 'Lead created', description: `${created.companyName} is now on the board.` });
    } catch (error) {
      fail('Lead could not be created', error, 'Please check the details and try again.');
    } finally {
      setBusy(false);
    }
  }

  // ---- Step 4/5: pricing + quotation -----------------------------------
  async function saveQuotation() {
    if (!lead) return;
    const lines = toNumericLines(pricing.lines);
    if (!lines.length) { toast({ variant: 'destructive', title: 'Add at least one line' }); return; }
    if (lines.some((line) => !line.productName)) { toast({ variant: 'destructive', title: 'Every line needs a description' }); return; }
    if (lines.some((line) => line.unitPrice <= 0)) { toast({ variant: 'destructive', title: 'Enter a unit price for every line', description: 'Prices must come from you; the AI does not suggest them.' }); return; }
    const body = { items: lines, taxRate: Number(pricing.taxRate) || 0, validUntil: pricing.validUntil || null, terms: pricing.terms, notes: pricing.notes };
    setBusy(true);
    try {
      const saved = quotation
        ? await updateQuotation.mutateAsync({ id: quotation.id, data: body })
        : await createQuotation.mutateAsync({ data: { leadId: lead.id, ...body } });
      setQuotation(saved);
      invalidateLead(lead.id);
      setStep('quotation');
      window.scrollTo({ top: 0 });
      toast({ title: quotation ? 'Quotation updated' : `Quotation ${saved.quotationNumber} saved`, description: 'Totals were calculated by the server.' });
    } catch (error) {
      fail('Quotation could not be saved', error, 'Please check the pricing and try again.');
    } finally {
      setBusy(false);
    }
  }

  function editQuotation() {
    if (quotation) {
      setPricing({ lines: quotation.items.map((item) => newLine({ productModel: item.productModel, productName: item.productName, quantity: String(item.quantity), unit: item.unit, unitPrice: String(item.unitPrice), discount: String(item.discount) })), taxRate: String(quotation.taxRate), validUntil: quotation.validUntil ?? '', terms: quotation.terms, notes: quotation.notes });
    }
    setStep('pricing');
  }

  function generate() {
    if (!quotation || !lead) return;
    generateQuotation.mutate({ id: quotation.id }, {
      onSuccess: (generated) => { setQuotation(generated); invalidateLead(lead.id); toast({ title: `Quotation ${generated.quotationNumber} generated`, description: 'Recorded on the lead. You can now download the PDF.' }); },
      onError: (error) => fail('Quotation could not be generated', error, 'Please try again.'),
    });
  }

  // ---- Step 6: follow-up -------------------------------------------------
  function schedule(date: string) {
    if (!lead) return;
    updateLead.mutate({ id: lead.id, data: { nextFollowUp: date } }, {
      onSuccess: (updated) => { setLead(updated); setScheduledDate(date); invalidateLead(lead.id); toast({ title: 'Follow-up scheduled' }); },
      onError: (error) => fail('Follow-up could not be scheduled', error, 'Please try again.'),
    });
  }

  // ---- Render ----------------------------------------------------------
  const products = catalogue.data ?? [];
  const stepper = <WorkflowStepper current={step} />;

  if (step === 'product' && review) {
    return <AppShell>{stepper}<ReviewStep review={review} onChange={setReview} originalRequirement={form.requirement} catalogue={products} onRematch={rematch} rematching={match.isPending} onBack={() => setStep('enquiry')} onConfirm={confirmAndCreateLead} confirming={busy} /></AppShell>;
  }
  if (step === 'lead' && lead) {
    const selected = review?.items.filter((item) => item.selectedProduct) ?? [];
    return <AppShell>{stepper}
      <PageHeading eyebrow="Step 3 · Lead" title="Lead created" description="The lead is in the pipeline with the original enquiry attached. Next, enter your prices to build the quotation." />
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <section className="rounded-xl border border-border bg-card p-6" data-testid="panel-lead-created">
          <div className="mb-4 flex items-center gap-3"><div className="avatar-tile avatar-tile-large">{lead.companyName.slice(0, 2).toUpperCase()}</div><div><p className="font-display text-2xl font-bold tracking-[-0.05em]">{lead.companyName}</p><p className="text-sm text-muted-foreground">{lead.contactName}{lead.phone ? ` · ${lead.phone}` : ''} · Lead #{lead.id} · <span className="status-pill status-new">New</span></p></div></div>
          <p className="text-sm leading-relaxed">{lead.requirement}</p>
          {selected.length > 0 && <div className="mt-5 border-t border-border pt-4"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Selected Rollvento products</p><div className="grid gap-2 sm:grid-cols-2">{selected.map((item, i) => <div key={i} className="rounded-lg border border-border bg-background/60 p-3"><p className="font-mono text-xs font-bold">{item.selectedProduct!.model}</p><p className="mb-2 text-[11px] text-muted-foreground">{item.selectedProduct!.productName}</p><ProductSpecGrid product={item.selectedProduct!} compact /></div>)}</div></div>}
          <div className="mt-6 flex flex-wrap gap-2"><Button onClick={() => setStep('pricing')} data-testid="button-continue-pricing">Continue to pricing<ArrowUpRight className="size-4" /></Button><Button variant="outline" onClick={() => setLocation(`/leads/${lead.id}`)} data-testid="button-open-lead">Open lead instead</Button></div>
        </section>
        <aside className="rounded-xl border border-border bg-sidebar p-5 text-sidebar-foreground"><CheckCircle2 className="mb-4 size-5 text-sidebar-primary" /><p className="font-display text-base font-bold tracking-[-0.03em]">Recorded on the lead</p><ul className="mt-3 space-y-2 text-[12px] text-sidebar-foreground/75"><li>Original enquiry text as a note.</li><li>AI extraction record with the products you confirmed.</li><li>Status New, no estimated value — the quotation will set the value.</li></ul></aside>
      </div>
    </AppShell>;
  }
  if (step === 'pricing' && lead) {
    return <AppShell>{stepper}<PricingStep lead={lead} form={pricing} onChange={setPricing} catalogue={products} onSave={saveQuotation} saving={busy} editing={Boolean(quotation)} onBack={quotation ? () => setStep('quotation') : review ? () => setStep('lead') : undefined} /></AppShell>;
  }
  if (step === 'quotation' && lead && quotation) {
    return <AppShell>{stepper}<QuotationStep lead={lead} quotation={quotation} onEdit={editQuotation} onGenerate={generate} generating={generateQuotation.isPending} onContinue={() => setStep('followup')} /></AppShell>;
  }
  if (step === 'followup' && lead) {
    return <AppShell>{stepper}<FollowUpStep lead={lead} quotation={quotation} onSchedule={schedule} scheduling={updateLead.isPending} scheduledDate={scheduledDate} onStartAnother={resetAll} /></AppShell>;
  }
  if (leadIdParam > 0 && existingLead.isLoading) {
    return <AppShell>{stepper}<p className="text-sm text-muted-foreground">Loading lead…</p></AppShell>;
  }

  return <AppShell>{stepper}
    <PageHeading eyebrow="Step 1 · Enquiry" title="New Enquiry" description="Capture the enquiry as it came in. The AI structures it and matches Rollvento products; you confirm before anything is saved." />
    <form onSubmit={startAiProcess} className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <section className="rounded-xl border border-border bg-card p-5 md:p-6">
        <SectionLabel>Customer</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company / Customer name" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} placeholder="ABC Industries" testId="input-enquiry-company" />
          <Field label="Contact person" value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} placeholder="Ravi Sharma" testId="input-enquiry-contact" />
          <Field label="Phone / WhatsApp" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+91 98765 43210" type="tel" testId="input-enquiry-phone" />
          <Field label="Email (optional)" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="ravi@abcindustries.com" type="email" testId="input-enquiry-email" />
        </div>
        <div className="mt-4"><Field label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="Factory, Ahmedabad" testId="input-enquiry-location" /></div>
        <div className="mt-6 border-t border-border pt-5">
          <SectionLabel>Requirement</SectionLabel>
          <div className="space-y-1.5">
            <Label htmlFor="input-enquiry-requirement" className="text-xs font-semibold text-foreground/80">What does the customer need?</Label>
            <Textarea id="input-enquiry-requirement" data-testid="input-enquiry-requirement" value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} placeholder={'ABC Industries needs an automatic sliding gate for their factory entrance.\nOpening is approximately 6 metres wide and 2.5 metres high.\nThey need a motor for a 1000 kg gate.'} className="min-h-[220px] bg-background text-sm leading-relaxed" required maxLength={8000} />
            <p className="text-[11px] text-muted-foreground">Write it the way the customer said it. Gate or shutter weight, dimensions, quantities and scope all help the product match.</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Nothing is saved until you review and confirm.</p>
          <Button type="submit" disabled={extract.isPending} data-testid="button-start-ai-process"><Sparkles className="size-4" />{extract.isPending ? 'Analysing enquiry…' : 'Start AI Process'}</Button>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-xl border border-border bg-sidebar p-5 text-sidebar-foreground">
          <Sparkles className="mb-5 size-5 text-sidebar-primary" />
          <p className="font-display text-lg font-bold tracking-[-0.04em]">How the sales agent works</p>
          <ol className="mt-3 space-y-2 text-[12px] leading-relaxed text-sidebar-foreground/70">
            <li><span className="font-mono text-sidebar-primary">01</span> &nbsp;You enter the enquiry as it came in.</li>
            <li><span className="font-mono text-sidebar-primary">02</span> &nbsp;The AI structures it and matches Rollvento catalogue products — it never invents models, specs or prices.</li>
            <li><span className="font-mono text-sidebar-primary">03</span> &nbsp;You review, answer what is missing, choose the product and create the lead.</li>
            <li><span className="font-mono text-sidebar-primary">04</span> &nbsp;You enter prices; the CRM builds the quotation and PDF.</li>
            <li><span className="font-mono text-sidebar-primary">05</span> &nbsp;You schedule the next follow-up.</li>
          </ol>
        </div>
      </aside>
    </form>
  </AppShell>;
}
