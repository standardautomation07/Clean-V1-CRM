import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseFollowUp } from './follow-up-date';

// Saturday 12 September 2026, 15:30 local time.
const now = new Date(2026, 8, 12, 15, 30);

describe('parseFollowUp()', () => {
  it('handles relative phrases', () => {
    assert.equal(parseFollowUp('3 days', now)?.date, '2026-09-15');
    assert.equal(parseFollowUp('in 3 days', now)?.date, '2026-09-15');
    assert.equal(parseFollowUp('1 week', now)?.date, '2026-09-19');
    assert.equal(parseFollowUp('15 days', now)?.date, '2026-09-27');
    assert.equal(parseFollowUp('two weeks', now)?.date, '2026-09-26');
    assert.equal(parseFollowUp('1 month', now)?.date, '2026-10-12');
    assert.equal(parseFollowUp('tomorrow', now)?.date, '2026-09-13');
    assert.equal(parseFollowUp('today', now)?.date, '2026-09-12');
  });

  it('handles weekdays as the next occurrence', () => {
    assert.equal(parseFollowUp('next Monday', now)?.date, '2026-09-14');
    assert.equal(parseFollowUp('friday', now)?.date, '2026-09-18');
    assert.equal(parseFollowUp('Saturday', now)?.date, '2026-09-19'); // today is Saturday -> next week
  });

  it('handles explicit dates and formats a label', () => {
    assert.deepEqual(parseFollowUp('25 September', now), { date: '2026-09-25', label: '25 September 2026' });
    assert.equal(parseFollowUp('25 Sep 2026', now)?.date, '2026-09-25');
    assert.equal(parseFollowUp('25/09/2026', now)?.date, '2026-09-25');
    assert.equal(parseFollowUp('2026-09-25', now)?.date, '2026-09-25');
    assert.equal(parseFollowUp('5th January', now)?.date, '2027-01-05'); // already passed this year -> next year
  });

  it('returns null for text it cannot interpret', () => {
    assert.equal(parseFollowUp('whenever', now), null);
    assert.equal(parseFollowUp('', now), null);
  });
});
