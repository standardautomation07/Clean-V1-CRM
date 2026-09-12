import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { Lead, Quotation } from '@workspace/api-client-react';
import { ArrowUpRight, CalendarCheck2, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeading, SectionLabel } from '@/components/crm-ui';
import { FOLLOW_UP_SUGGESTIONS, parseFollowUp } from '@/lib/follow-up-date';
import { formatInr } from '@/lib/quotation-math';

/** Renders a YYYY-MM-DD calendar date as a local date (no timezone shift). */
export function CalendarDateLabel({ value }: { value: string }) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return <span>{value}</span>;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return <span>{date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>;
}

interface FollowUpStepProps {
  lead: Lead;
  quotation: Quotation | null;
  onSchedule: (date: string) => void;
  scheduling: boolean;
  scheduledDate: string | null;
  onStartAnother: () => void;
}

export function FollowUpStep({ lead, quotation, onSchedule, scheduling, scheduledDate, onStartAnother }: FollowUpStepProps) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseFollowUp(text), [text]);

  if (scheduledDate) {
    return <>
      <PageHeading eyebrow="Done" title="Follow-up scheduled" description="The lead, quotation and next follow-up are all recorded in the CRM." />
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <section className="rounded-xl border border-border bg-card p-6" data-testid="panel-workflow-complete">
          <ul className="space-y-3 text-sm">
            <Done label="Lead" value={<Link href={`/leads/${lead.id}`} className="font-semibold text-primary hover:underline" data-testid="link-open-lead">{lead.companyName} (#{lead.id})</Link>} />
            {quotation && <Done label="Quotation" value={`${quotation.quotationNumber} · ${formatInr(quotation.total)} · ${quotation.status}`} />}
            <Done label="Next follow-up" value={<CalendarDateLabel value={scheduledDate} />} />
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={`/leads/${lead.id}`} data-testid="link-finish-open-lead" className="inline-flex h-9 items-center gap-2 rounded-md border border-primary-border bg-primary px-4 text-sm font-medium text-primary-foreground">Open lead<ArrowUpRight className="size-4" /></Link>
            <Link href="/follow-ups" data-testid="link-finish-follow-ups" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium">View follow-ups</Link>
            <Button variant="outline" onClick={onStartAnother} data-testid="button-start-another"><Sparkles className="size-4" />New enquiry</Button>
          </div>
        </section>
      </div>
    </>;
  }

  return <>
    <PageHeading eyebrow="Step 6 · Follow-up" title="What is the next follow-up?" description={`Type it naturally — “3 days”, “next Monday”, “25 September”. The date is calculated by the CRM, not by AI, and saved on ${lead.companyName}.`} />
    <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
      <section className="rounded-xl border border-border bg-card p-5 md:p-6">
        <SectionLabel>Next follow-up</SectionLabel>
        <Label htmlFor="input-follow-up" className="text-xs font-semibold text-foreground/80">When should we follow up?</Label>
        <Input id="input-follow-up" data-testid="input-follow-up" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 3 days" className="mt-1.5 bg-background" autoFocus />
        <div className="mt-3 flex flex-wrap gap-2">{FOLLOW_UP_SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => setText(suggestion)} data-testid={`chip-follow-up-${suggestion.toLowerCase().replaceAll(' ', '-')}`} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${text === suggestion ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}>{suggestion}</button>)}</div>
        <div className="mt-5 rounded-lg bg-accent/40 p-4" data-testid="panel-follow-up-preview">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold"><CalendarCheck2 className="size-4 text-accent-foreground" />Next follow-up</div>
          {parsed ? <p className="font-display text-2xl font-bold tracking-[-0.04em]" data-testid="text-follow-up-date">{parsed.label}</p> : <p className="text-sm text-muted-foreground">{text.trim() ? 'Could not understand that — try “5 days”, “next Friday” or “25 September”.' : 'Enter a follow-up to see the date.'}</p>}
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => parsed && onSchedule(parsed.date)} disabled={!parsed || scheduling} data-testid="button-schedule-follow-up">{scheduling ? 'Scheduling…' : 'Schedule Follow-up'}<CalendarCheck2 className="size-4" /></Button>
        </div>
      </section>
      <aside className="rounded-xl border border-border bg-sidebar p-5 text-sidebar-foreground">
        <CheckCircle2 className="mb-4 size-5 text-sidebar-primary" />
        <p className="font-display text-base font-bold tracking-[-0.03em]">So far</p>
        <ul className="mt-3 space-y-2 text-[12px] text-sidebar-foreground/75">
          <li>Lead <span className="font-semibold text-sidebar-foreground">{lead.companyName}</span> (#{lead.id}) created.</li>
          {quotation && <li>Quotation <span className="font-mono font-semibold text-sidebar-foreground">{quotation.quotationNumber}</span> for {formatInr(quotation.total)} — {quotation.status}.</li>}
          <li>Nothing has been sent to the customer.</li>
        </ul>
      </aside>
    </div>
  </>;
}

function Done({ label, value }: { label: string; value: React.ReactNode }) {
  return <li className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#39715e]" /><span><span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</span>{value}</span></li>;
}
