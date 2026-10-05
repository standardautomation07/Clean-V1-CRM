import test from 'node:test';
import assert from 'node:assert/strict';
import { lineFromRequirement } from './requirement-line';

const catalogue = [
  { model: 'RV-400', productName: 'RV-400 1000 kg Rolling Shutter Motor' },
  { model: 'RV-1500', productName: 'RV-1500 Heavy Rolling Shutter Motor' },
  { model: 'SL500DC', productName: 'SL500DC 24V DC Sliding Gate Motor' },
];

test('fills the line from a requirement built by the enquiry flow', () => {
  const line = lineFromRequirement('RV-400 — RV-400 1000 kg Rolling Shutter Motor · Quantity: 5 sets', catalogue);
  assert.deepEqual(line, {
    productModel: 'RV-400',
    productName: 'RV-400 1000 kg Rolling Shutter Motor',
    quantity: '5',
  });
});

test('never carries a price, because prices come from a person', () => {
  const line = lineFromRequirement('RV-400 · Quantity: 5 sets', catalogue);
  assert.ok(line);
  assert.ok(!('unitPrice' in (line as object)), 'a prefilled line must not set a price');
});

test('reads a requirement typed by hand', () => {
  assert.equal(lineFromRequirement('customer wants 12 nos of SL500DC', catalogue)?.quantity, '12');
  assert.equal(lineFromRequirement('needs rv 400 urgently', catalogue)?.productModel, 'RV-400');
});

test('defaults to one when no quantity was captured', () => {
  assert.equal(lineFromRequirement('RV-400 — Rolling Shutter Motor', catalogue)?.quantity, '1');
});

test('prefers the longer model', () => {
  // RV-1500 contains no shorter model here, but the ordering must hold.
  assert.equal(lineFromRequirement('RV-1500 · Quantity: 2 sets', catalogue)?.productModel, 'RV-1500');
});

test('a requirement with no catalogue product leaves the form empty', () => {
  // Better an empty line than a wrong product silently priced.
  assert.equal(lineFromRequirement('I need rolling shutter motors for 600 kg', catalogue), null);
  assert.equal(lineFromRequirement('', catalogue), null);
  assert.equal(lineFromRequirement('ref RV4001', catalogue), null);
});
