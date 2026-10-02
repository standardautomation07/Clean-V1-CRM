import test from 'node:test';
import assert from 'node:assert/strict';
import { mailtoHref, toWhatsappNumber, whatsappHref } from './quotation-share';

test('a bare Indian mobile number gets the country code', () => {
  assert.equal(toWhatsappNumber('9309841322'), '919309841322');
  assert.equal(toWhatsappNumber('09309841322'), '919309841322');
});

test('numbers already carrying a country code are kept as they are', () => {
  // The form these arrive in from Google Maps.
  assert.equal(toWhatsappNumber('+91 94478 05501'), '919447805501');
  assert.equal(toWhatsappNumber('+971 4 123 4567'), '97141234567');
});

test('a number that cannot be dialled yields no link', () => {
  assert.equal(toWhatsappNumber(''), null);
  assert.equal(toWhatsappNumber('123'), null);
  assert.equal(toWhatsappNumber('not a phone'), null);
  assert.equal(whatsappHref('123', 'hello'), null);
});

test('the message is encoded into the link rather than concatenated raw', () => {
  const href = whatsappHref('9309841322', 'Quotation Q-1 for ₹1,000 & GST');
  assert.ok(href?.startsWith('https://wa.me/919309841322?text='));
  assert.ok(href?.includes('%26'), 'the ampersand must be escaped, or it truncates the message');
  assert.ok(!href?.includes(' '));
});

test('mailto needs an address, and escapes the subject and body', () => {
  assert.equal(mailtoHref('   ', 'Subject', 'Body'), null);
  const href = mailtoHref('buyer@example.com', 'Rollvento — Quotation Q-1', 'Line one\nLine two');
  assert.ok(href?.startsWith('mailto:buyer%40example.com?'));
  assert.ok(href?.includes('%0A'), 'the newline must survive as an escape');
});
