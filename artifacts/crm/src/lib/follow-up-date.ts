import { addDays, addMonths, addWeeks, format, isValid, parse, startOfDay } from 'date-fns';

// Turns natural follow-up phrases ("3 days", "next Monday", "25 September")
// into a calendar date. Plain date logic only - no AI. Dates are handled as
// local calendar days and returned as YYYY-MM-DD so nothing shifts with the
// timezone.

export interface ParsedFollowUp {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "18 September 2026"
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30 };

function toResult(date: Date): ParsedFollowUp {
  return { date: format(date, 'yyyy-MM-dd'), label: format(date, 'd MMMM yyyy') };
}

function numberOf(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word);
  return WORD_NUMBERS[word] ?? null;
}

export function parseFollowUp(input: string, now: Date = new Date()): ParsedFollowUp | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return null;
  const today = startOfDay(now);

  if (text === 'today') return toResult(today);
  if (text === 'tomorrow' || text === 'tmrw') return toResult(addDays(today, 1));
  if (text === 'day after tomorrow' || text === 'day after') return toResult(addDays(today, 2));
  if (text === 'next week' || text === 'a week' || text === 'one week' || text === '1 week') return toResult(addWeeks(today, 1));
  if (text === 'fortnight' || text === 'a fortnight') return toResult(addWeeks(today, 2));
  if (text === 'next month' || text === 'a month') return toResult(addMonths(today, 1));

  // "3 days", "in 2 weeks", "after 1 month", "15d", "2w"
  const relative = text.match(/^(?:in |after |within )?([a-z]+|\d+)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|month|months)(?: from now| later| time)?$/);
  if (relative) {
    const count = numberOf(relative[1]);
    if (count !== null && count > 0 && count < 1000) {
      const unit = relative[2];
      if (unit.startsWith('d')) return toResult(addDays(today, count));
      if (unit.startsWith('w')) return toResult(addWeeks(today, count));
      return toResult(addMonths(today, count));
    }
  }

  // "monday", "next monday", "this friday", "on tuesday"
  const weekday = text.match(/^(?:next |this |on |coming )?([a-z]+)$/);
  if (weekday) {
    const idx = WEEKDAYS.findIndex((name) => name === weekday[1] || name.slice(0, 3) === weekday[1]);
    if (idx >= 0) {
      let delta = (idx - today.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // "Monday" on a Monday means next Monday
      return toResult(addDays(today, delta));
    }
  }

  // Explicit dates in common Indian/ISO formats.
  const cleaned = text.replace(/^(on |by )/, '').replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, '');
  const withYear = ['d MMMM yyyy', 'd MMM yyyy', 'MMMM d yyyy', 'MMM d yyyy', 'dd/MM/yyyy', 'd/M/yyyy', 'dd-MM-yyyy', 'd-M-yyyy', 'yyyy-MM-dd', 'd.M.yyyy'];
  for (const pattern of withYear) {
    const parsed = parse(cleaned, pattern, today);
    if (isValid(parsed)) return toResult(startOfDay(parsed));
  }
  const withoutYear = ['d MMMM', 'd MMM', 'MMMM d', 'MMM d', 'dd/MM', 'd/M'];
  for (const pattern of withoutYear) {
    const parsed = parse(cleaned, pattern, today);
    if (isValid(parsed)) {
      const date = startOfDay(parsed);
      // A day/month without a year that has already passed means next year.
      return toResult(date < today ? addMonths(date, 12) : date);
    }
  }
  return null;
}

export const FOLLOW_UP_SUGGESTIONS = ['Tomorrow', '3 days', '1 week', '15 days', 'Next Monday', '1 month'];
