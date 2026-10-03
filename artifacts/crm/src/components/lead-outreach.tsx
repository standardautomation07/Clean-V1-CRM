import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionLabel } from '@/components/crm-ui';
import { mailtoHref } from '@/lib/quotation-share';

// Outreach by mailto.
//
// NOVA already builds the introduction email deterministically in
// draft_prospect_email: a fixed branded template that lists only catalogue
// products and never quotes a price. That tool is the single source of the
// copy, so this asks the server for the draft rather than rewriting it here.
//
// draft_prospect_email is read-only and sends nothing. The message opens in the
// operator's own mail client, which means the send is NOT recorded in
// outreach_emails - only a send through the provider can be. The UI says so.

interface Props {
  leadId: number;
  email: string;
}

export function LeadOutreach({ leadId, email }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draftAndOpen() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/nova/execute', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'draft_prospect_email', input: { leadId } }),
      });
      const result = await response.json();
      if (!result?.ok) {
        setError(String(result?.error ?? 'The draft could not be prepared.'));
        return;
      }
      const { subject, body, toEmail } = result.data as { subject: string; body: string; toEmail: string };
      const href = mailtoHref(toEmail || email, subject, body);
      if (!href) {
        setError('This lead has no email address.');
        return;
      }
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch {
      setError('The draft could not be prepared.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="rounded-xl border border-border bg-card p-5 md:p-6">
    <SectionLabel>Outreach</SectionLabel>
    <Button
      className="w-full"
      variant="outline"
      disabled={busy || !email.trim()}
      onClick={draftAndOpen}
      data-testid="button-outreach-email"
    ><Mail className="size-4" />{busy ? 'Preparing…' : email.trim() ? 'Draft introduction email' : 'No email on this lead'}</Button>
    {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
      Opens in your mail client with the standard introduction, listing only catalogue products and no prices.
      Review it before sending. Because it sends from your own mail client, the send is not recorded in the CRM.
    </p>
  </section>;
}
