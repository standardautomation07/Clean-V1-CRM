import type { Lead, Quotation } from '@workspace/api-client-react';
import { formatInr } from '@/lib/quotation-math';

// Sharing a quotation by WhatsApp or email.
//
// Neither wa.me nor a mailto: link can carry an attachment — that is a platform
// limitation, not a choice — and the quotation PDF sits behind the CRM session,
// so it has no public URL a customer could open. So the flow is: download the
// PDF locally, then open WhatsApp or the mail client with the message already
// written, and the sender attaches the file they just received.
//
// The alternative, a signed public link, was deliberately not taken: it would
// put customer pricing on a URL that anyone holding it could read.

/** Digits only, with India's country code when a bare 10-digit number is given. */
export function toWhatsappNumber(phone: string): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  // Indian numbers are sometimes stored with a leading 0 before the 10 digits.
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function quotationMessage(lead: Lead, quotation: Quotation, companyName: string): string {
  const lines = [
    `Dear ${lead.contactName || lead.companyName},`,
    '',
    `Please find attached our quotation ${quotation.quotationNumber} for ${formatInr(quotation.total)} (incl. GST).`,
  ];
  if (quotation.validUntil) lines.push(`This quotation is valid until ${quotation.validUntil}.`);
  lines.push('', 'Please let us know if you need any clarification.', '', 'Thank you,', companyName);
  return lines.join('\n');
}

export function quotationSubject(quotation: Quotation, companyName: string): string {
  return `${companyName} — Quotation ${quotation.quotationNumber}`;
}

export function whatsappHref(phone: string, message: string): string | null {
  const number = toWhatsappNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function mailtoHref(email: string, subject: string, body: string): string | null {
  if (!email.trim()) return null;
  return `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
