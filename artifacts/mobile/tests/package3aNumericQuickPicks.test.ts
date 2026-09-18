import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isPropertyNumericQuickPickSurface,
  isRequirementNumericQuickPickSurface,
  hasPendingInvalidQuickPick,
  openNumericExactEntry,
  parseExactIntegerInput,
  resolveExactIntegerInput,
  selectNumericQuickPick,
  shouldOpenExactEntry,
  updateInvalidQuickPickFields,
} from '../services/numericQuickPick.ts';

test('BEHAVIOR: quick values set the intended exact numeric value', () => {
  for (const value of [1, 2, 3, 4, 5]) {
    assert.equal(selectNumericQuickPick(value), String(value));
  }
});

test('BEHAVIOR: opening +6 preserves the current value until exact entry changes it', () => {
  assert.deepEqual(openNumericExactEntry('3'), { expanded: true, value: '3' });
});

test('BEHAVIOR: exact 6 remains exactly 6 and opens exact-entry mode', () => {
  assert.deepEqual(parseExactIntegerInput('6'), { kind: 'valid', normalized: '6', value: 6 });
  assert.equal(shouldOpenExactEntry('6'), true);
});

test('BEHAVIOR: a higher exact value remains unchanged and reopens expanded', () => {
  assert.deepEqual(parseExactIntegerInput('12'), { kind: 'valid', normalized: '12', value: 12 });
  assert.equal(shouldOpenExactEntry('12'), true);
});

test('BEHAVIOR: switching from a high value to a quick value replaces it', () => {
  const current = resolveExactIntegerInput('8', '');
  assert.equal(current.committedValue, '8');
  assert.equal(selectNumericQuickPick(3), '3');
});

test('BEHAVIOR: explicit zero remains valid, exact, and expanded', () => {
  assert.deepEqual(parseExactIntegerInput('0'), { kind: 'valid', normalized: '0', value: 0 });
  assert.equal(shouldOpenExactEntry('0'), true);
});

test('BEHAVIOR: blank remains distinct from explicit zero', () => {
  assert.deepEqual(parseExactIntegerInput(''), { kind: 'blank', normalized: '' });
  assert.notDeepEqual(parseExactIntegerInput(''), parseExactIntegerInput('0'));
});

test('BEHAVIOR: Arabic and Persian digits normalize without changing exact value', () => {
  assert.deepEqual(parseExactIntegerInput('١٢'), { kind: 'valid', normalized: '12', value: 12 });
  assert.deepEqual(parseExactIntegerInput('۶'), { kind: 'valid', normalized: '6', value: 6 });
});

test('BEHAVIOR: malformed, negative, decimal, and unsafe pending input remains invalid', () => {
  for (const value of ['8x', '-1', '2.5', String(Number.MAX_SAFE_INTEGER + 1)]) {
    const transition = resolveExactIntegerInput(value, '8');
    assert.equal(transition.invalid, true);
    assert.equal(transition.committedValue, '8');
    assert.equal(transition.pending, value);
  }
});

test('BEHAVIOR: valid pending input replaces the committed value without range conversion', () => {
  assert.deepEqual(resolveExactIntegerInput('12', '8'), {
    pending: '12',
    committedValue: '12',
    invalid: false,
  });
});

test('BEHAVIOR: invalid pending fields block commit until each field is corrected or unmounted', () => {
  let invalidFields = new Set<string>();
  invalidFields = updateInvalidQuickPickFields(invalidFields, 'bedrooms', true);
  invalidFields = updateInvalidQuickPickFields(invalidFields, 'bathrooms', true);
  assert.equal(hasPendingInvalidQuickPick(invalidFields), true);
  invalidFields = updateInvalidQuickPickFields(invalidFields, 'bedrooms', false);
  assert.equal(hasPendingInvalidQuickPick(invalidFields), true);
  invalidFields = updateInvalidQuickPickFields(invalidFields, 'bathrooms', false);
  assert.equal(hasPendingInvalidQuickPick(invalidFields), false);
});

test('BEHAVIOR: only authorized residential Property surfaces use quick picks', () => {
  for (const type of ['apartment', 'house', 'villa', 'chalet'] as const) {
    assert.equal(isPropertyNumericQuickPickSurface(type), true);
  }
  assert.equal(isPropertyNumericQuickPickSurface('floor', 'residential'), true);
  assert.equal(isPropertyNumericQuickPickSurface('floor', 'commercial'), false);
  assert.equal(isPropertyNumericQuickPickSurface('office'), false);
});

test('BEHAVIOR: only unambiguous residential Rent Requirements use quick picks', () => {
  for (const type of ['apartment', 'house', 'villa', 'chalet'] as const) {
    assert.equal(isRequirementNumericQuickPickSurface('rent', type), true);
    assert.equal(isRequirementNumericQuickPickSurface('buy', type), false);
  }
  assert.equal(isRequirementNumericQuickPickSurface('rent', 'floor'), false);
  assert.equal(isRequirementNumericQuickPickSurface('rent', 'office'), false);
});

test('BEHAVIOR: unsupported quick values cannot be converted into stored markers', () => {
  assert.throws(() => selectNumericQuickPick(0), /INVALID_NUMERIC_QUICK_PICK/);
  assert.throws(() => selectNumericQuickPick(6), /INVALID_NUMERIC_QUICK_PICK/);
});

test('SOURCE ASSERTION: production control opens +6 without assigning a numeric value', async () => {
  const source = await readFile('components/NumericQuickPick.tsx', 'utf8');
  assert.match(source, /label="\+6"/);
  assert.match(source, /setExpanded\(true\)/);
  assert.doesNotMatch(source, /onChangeText\(['"]6['"]\)/);
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /minHeight: 44/);
});

test('SOURCE ASSERTION: Property applies quick picks only to the three authorized fields', async () => {
  const source = await readFile('components/PropertyEnrichmentFields.tsx', 'utf8');
  for (const field of ['bedroomCount', 'bathroomCount', 'parkingSpaceCount']) {
    assert.match(source, new RegExp(`field === '${field}'`));
  }
  assert.match(source, /isPropertyNumericQuickPickSurface\(propertyType, floorUse\)/);
});

test('SOURCE ASSERTION: Requirement keeps ambiguous surfaces on current inputs and Buy without Rent details', async () => {
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(source, /isRequirementNumericQuickPickSurface\(purpose, propertyType\)/);
  assert.match(source, /hasPendingInvalidQuickPick\(invalidQuickPickFields\)/);
  assert.match(source, /requirements\.buy_no_rent_details/);
  assert.match(source, /<TextInput value=\{bedrooms\}/);
  assert.match(source, /<TextInput value=\{bathrooms\}/);
});