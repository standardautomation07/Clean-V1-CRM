import test from 'node:test';
import assert from 'node:assert/strict';
import { isBulkApprovable, partitionApprovals } from './approval-risk';

test('CRM writes can be approved in bulk', () => {
  // hunter_create_lead and schedule_sales_followup: internal and reversible.
  assert.equal(isBulkApprovable('write'), true);
  assert.equal(isBulkApprovable('read'), true);
});

test('anything that contacts someone or commits money cannot', () => {
  // send_whatsapp_text, send_prospect_email.
  assert.equal(isBulkApprovable('external'), false);
  // create_quotation, create_invoice, create_sales_order.
  assert.equal(isBulkApprovable('financial'), false);
});

test('an unrecognised risk is treated as unsafe', () => {
  // A tool added later must be considered deliberately, not default into bulk.
  assert.equal(isBulkApprovable('destructive'), false);
  assert.equal(isBulkApprovable(''), false);
  assert.equal(isBulkApprovable('WRITE '), true, 'casing and padding should not matter');
  assert.equal(isBulkApprovable('EXTERNAL'), false, 'casing must not defeat the deny-list');
});

test('a mixed queue is split so no send rides along with the leads', () => {
  const { bulk, individual } = partitionApprovals([
    { id: 1, risk: 'write' },
    { id: 2, risk: 'external' },
    { id: 3, risk: 'write' },
    { id: 4, risk: 'financial' },
  ]);
  assert.deepEqual(bulk.map((a) => a.id), [1, 3]);
  assert.deepEqual(individual.map((a) => a.id), [2, 4]);
});
