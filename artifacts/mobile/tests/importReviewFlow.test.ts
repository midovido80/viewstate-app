import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeImportMessage } from '../services/messageImport';
import { importStepIssues, importDuplicateCaption } from '../services/importReviewFlow';

const facts = () => analyzeImportMessage('للإيجار شقة في السالمية 3 غرف وحمامين 500 دك شهري');
test('review reports actionable missing facts before source and duplicate decisions', () => {
  assert.deepEqual(importStepIssues(0, { facts: facts() }), []);
  assert.ok(importStepIssues(0, { facts: { ...facts(), choice: undefined } }).includes('propertyType'));
  assert.ok(importStepIssues(0, { facts: { ...facts(), period: undefined } }).includes('period'));
});
test('unknown source is an explicit valid deferral, selected role needs an existing person', () => {
  assert.deepEqual(importStepIssues(1, { facts: facts(), sourceRole: 'unknown' }), []);
  assert.deepEqual(importStepIssues(1, { facts: facts(), sourceRole: 'broker', sourceExists: true }), []);
  assert.deepEqual(importStepIssues(1, { facts: facts(), sourceRole: 'broker', sourceExists: false }), ['sourcePerson']);
});
test('requests need an eligible client and final review requires a duplicate decision', () => {
  assert.deepEqual(importStepIssues(1, { facts: { ...facts(), intent: 'wanted' }, seekerEligible: false }), ['client']);
  assert.deepEqual(importStepIssues(2, { facts: facts(), hasDuplicates: true }), ['duplicate']);
  assert.deepEqual(importStepIssues(2, { facts: facts(), hasDuplicates: true, duplicateDecision: 'different' }), []);
  assert.deepEqual(importStepIssues(2, { facts: facts(), hasDuplicates: true, duplicateDecision: 'existing', selectedDuplicate: false }), ['duplicate']);
});
test('duplicate captions expose distinguishing content without leaking an entire original', () => {
  const label = importDuplicateCaption({ text: '  شقة في السالمية\n500 د.ك  ', createdAt: '2026-11-19T06:00:00Z' }, 'ar');
  assert.match(label, /شقة في السالمية 500/);
  assert.ok(importDuplicateCaption({ text: 'x'.repeat(500), createdAt: '' }, 'ar').length < 160);
});
