import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectRecordIntent,
  projectRecordCardBadges,
  RECORD_INTENT_LABELS,
} from '../services/recordIntentPresentation.ts';

test('the four direction/transaction combinations have stable IDs and exact bilingual labels', () => {
  const cases = [
    ['offered', 'sale', 'offered_sale', 'Offered for Sale', 'معروض للبيع'],
    ['offered', 'rent', 'offered_rent', 'Offered for Rent', 'معروض للإيجار'],
    ['wanted', 'buy', 'wanted_buy', 'Purchase Request', 'طلب شراء'],
    ['wanted', 'rent', 'wanted_rent', 'Rental Request', 'طلب استئجار'],
  ] as const;

  for (const [direction, transaction, id, english, arabic] of cases) {
    assert.deepEqual(projectRecordIntent(direction, transaction, 'en'), { id, label: english, valid: true });
    assert.deepEqual(projectRecordIntent(direction, transaction, 'ar'), { id, label: arabic, valid: true });
    assert.equal(RECORD_INTENT_LABELS[id].en, english);
    assert.equal(RECORD_INTENT_LABELS[id].ar, arabic);
  }
});

test('unsupported and contradictory legacy combinations remain visible as conflicts', () => {
  for (const [direction, transaction] of [
    ['offered', 'buy'],
    ['wanted', 'sale'],
    ['wanted', 'SELL'],
    ['offered', null],
    ['unknown', 'rent'],
  ]) {
    const en = projectRecordIntent(direction, transaction, 'en');
    const ar = projectRecordIntent(direction, transaction, 'ar');
    assert.deepEqual(en, { id: 'conflict', label: 'Record intent conflict', valid: false });
    assert.deepEqual(ar, { id: 'conflict', label: 'تعارض في نوع المعاملة', valid: false });
    assert.doesNotMatch(`${en.label} ${ar.label}`, /wanted.*sale|مطلوب.*بيع/i);
  }
});

test('a card has one combined intent, then type, then a distinct subtype', () => {
  const intent = projectRecordIntent('offered', 'sale', 'ar');
  assert.deepEqual(projectRecordCardBadges(intent, 'شقة', 'استوديو'), [
    { key: 'intent', label: 'معروض للبيع' },
    { key: 'type', label: 'شقة' },
    { key: 'subtype', label: 'استوديو' },
  ]);
  assert.deepEqual(projectRecordCardBadges(intent, 'شقة', ' شقة '), [
    { key: 'intent', label: 'معروض للبيع' },
    { key: 'type', label: 'شقة' },
  ]);
  assert.equal(projectRecordCardBadges(projectRecordIntent('wanted', 'buy', 'en'), 'Villa').length, 2);
});