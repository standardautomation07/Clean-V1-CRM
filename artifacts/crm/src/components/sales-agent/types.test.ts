import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Product, ProductMatch } from '@workspace/api-client-react';

import { applyMatch, blankReviewItem, describeItem, specOrTbc, toMatchItems } from './types';

const sl1000: Product = { id: 'prod-sl1000ac', model: 'SL1000AC', productName: 'SL1000AC 400W Heavy Industrial AC Sliding Gate Motor', category: 'Sliding Gate Motors', family: 'SL Series', shortDescription: null, motorType: '220V AC 400W', power: '400 W', torque: null, voltage: '220V AC', capacityKg: 1000, keySpecifications: [], applications: [] };
const sl1500: Product = { ...sl1000, id: 'prod-sl1500ac', model: 'SL1500AC', productName: 'SL1500AC', capacityKg: 1500 };

describe('review state helpers', () => {
  it('auto-selects only when exactly one product fits; otherwise the user chooses', () => {
    const one: ProductMatch = { itemIndex: 0, category: 'Sliding Gate Motors', candidates: [{ product: sl1000, reason: 'r' }], questions: [], unknownModel: null, noMatchReason: null };
    const two: ProductMatch = { ...one, candidates: [{ product: sl1000, reason: 'r' }, { product: sl1500, reason: 'r' }], questions: ['Please confirm the gate weight'] };
    assert.equal(applyMatch(blankReviewItem(), one).selectedProduct?.model, 'SL1000AC');
    const multi = applyMatch(blankReviewItem(), two);
    assert.equal(multi.selectedProduct, null);
    assert.equal(multi.candidates.length, 2);
    assert.deepEqual(multi.questions, ['Please confirm the gate weight']);
  });

  it('keeps a user selection when it is still among the candidates and drops it otherwise', () => {
    const chosen = { ...blankReviewItem(), selectedProduct: sl1500 };
    const still: ProductMatch = { itemIndex: 0, category: 'Sliding Gate Motors', candidates: [{ product: sl1000, reason: 'r' }, { product: sl1500, reason: 'r' }], questions: [], unknownModel: null, noMatchReason: null };
    assert.equal(applyMatch(chosen, still).selectedProduct?.model, 'SL1500AC');
    const gone: ProductMatch = { ...still, candidates: [{ product: sl1000, reason: 'r' }] };
    assert.equal(applyMatch(chosen, gone).selectedProduct?.model, 'SL1000AC');
  });

  it('describes a confirmed item for the lead requirement without inventing values', () => {
    const item = { ...blankReviewItem(), productHint: 'sliding gate motor', quantity: '2', unit: 'Nos', requiredCapacityKg: '1000', specifications: [{ name: 'Opening width', value: '6 m' }], selectedProduct: sl1000 };
    assert.equal(describeItem(item), 'SL1000AC – SL1000AC 400W Heavy Industrial AC Sliding Gate Motor × 2 Nos (Weight: 1000 kg, Opening width: 6 m)');
    assert.equal(describeItem({ ...blankReviewItem(), productHint: 'remote' }), 'remote');
  });

  it('converts edited items back to the API shape with nulls for blanks', () => {
    const [item] = toMatchItems([{ ...blankReviewItem(), productHint: 'gate', requiredCapacityKg: '', quantity: 'abc', unit: '' }]);
    assert.equal(item.requiredCapacityKg, null);
    assert.equal(item.quantity, null);
    assert.equal(item.unit, null);
    assert.equal(item.category, null);
  });

  it('renders missing specifications as "To be confirmed"', () => {
    assert.equal(specOrTbc(null), 'To be confirmed');
    assert.equal(specOrTbc('400 W'), '400 W');
  });
});
