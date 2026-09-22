import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createNumericQuickPickLocalState,
  createQuickPickValidationScope,
  isPropertyNumericQuickPickSurface,
  isRequirementNumericQuickPickSurface,
  hasPendingInvalidQuickPick,
  openNumericExactEntry,
  parseExactIntegerInput,
  reconcileNumericQuickPickScope,
  resolveExactIntegerInput,
  selectNumericQuickPick,
  shouldOpenExactEntry,
  synchronizeNumericQuickPickValue,
  updateInvalidQuickPickFields,
  updateScopedInvalidQuickPickFields,
  hasPendingInvalidQuickPickForScope,
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

test('BEHAVIOR: A invalid to B valid resets pending text and permits B save', () => {
  const a = { ...createNumericQuickPickLocalState('property:A', '8'), pending: '8x', invalid: true, expanded: true };
  const b = reconcileNumericQuickPickScope(a, 'property:B', '3');
  assert.deepEqual(b, { scopeKey: 'property:B', pending: '3', invalid: false, expanded: false });
  let validation = createQuickPickValidationScope<string>('property:A');
  validation = updateScopedInvalidQuickPickFields(validation, 'property:A', 'property:A', 'bedrooms', true);
  validation = updateScopedInvalidQuickPickFields(validation, 'property:B', 'property:B', 'bedrooms', false);
  assert.equal(hasPendingInvalidQuickPickForScope(validation, 'property:B'), false);
});

test('BEHAVIOR: identical numeric values still reset across record identities', () => {
  const a = { ...createNumericQuickPickLocalState('requirement:A', '6'), pending: '6x', invalid: true };
  assert.deepEqual(reconcileNumericQuickPickScope(a, 'requirement:B', '6'), {
    scopeKey: 'requirement:B', pending: '6', invalid: false, expanded: true,
  });
});

test('BEHAVIOR: same-identity rerender preserves invalid pending text and blocker', () => {
  const current = { ...createNumericQuickPickLocalState('property:A', '8'), pending: '8x', invalid: true };
  assert.equal(synchronizeNumericQuickPickValue(current, 'property:A', '8'), current);
  let validation = createQuickPickValidationScope<string>('property:A');
  validation = updateScopedInvalidQuickPickFields(validation, 'property:A', 'property:A', 'bedrooms', true);
  assert.equal(hasPendingInvalidQuickPickForScope(validation, 'property:A'), true);
});

test('BEHAVIOR: same-identity async initialization synchronizes value when no invalid text exists', () => {
  const loading = createNumericQuickPickLocalState('requirement:A', '');
  assert.deepEqual(synchronizeNumericQuickPickValue(loading, 'requirement:A', '6'), {
    scopeKey: 'requirement:A', pending: '6', invalid: false, expanded: true,
  });
});

test('BEHAVIOR: record initialization preserves blank, zero, quick, six, and higher exact values', () => {
  for (const [value, expanded] of [['', false], ['0', true], ['3', false], ['6', true], ['12', true]] as const) {
    assert.deepEqual(createNumericQuickPickLocalState(`record:${value}`, value), {
      scopeKey: `record:${value}`, pending: value, invalid: false, expanded,
    });
  }
});

test('BEHAVIOR: inapplicable control scope leaves no obsolete save blocker', () => {
  let validation = createQuickPickValidationScope<string>('property:A');
  validation = updateScopedInvalidQuickPickFields(validation, 'property:A', 'property:A', 'parking', true);
  validation = updateScopedInvalidQuickPickFields(validation, 'property:A:commercial', 'property:A', 'parking', false);
  assert.equal(hasPendingInvalidQuickPickForScope(validation, 'property:A:commercial'), false);
});

test('BEHAVIOR: stale A callbacks cannot restore A state or clear a legitimate B error', () => {
  let validation = createQuickPickValidationScope<string>('property:B');
  validation = updateScopedInvalidQuickPickFields(validation, 'property:B', 'property:B', 'bedrooms', true);
  validation = updateScopedInvalidQuickPickFields(validation, 'property:B', 'property:A', 'bedrooms', false);
  assert.equal(validation.scopeKey, 'property:B');
  assert.deepEqual([...validation.invalidFields], ['bedrooms']);
});

test('BEHAVIOR: new Requirement preserves same-owner state and resets on observable owner change', () => {
  const ownerA = 'requirement:new:owner:person-A';
  const current = { ...createNumericQuickPickLocalState(ownerA, ''), pending: '2x', invalid: true, expanded: true };
  assert.equal(reconcileNumericQuickPickScope(current, ownerA, ''), current);
  assert.deepEqual(reconcileNumericQuickPickScope(current, 'requirement:new:owner:person-B', ''), {
    scopeKey: 'requirement:new:owner:person-B', pending: '', invalid: false, expanded: false,
  });
});

test('BEHAVIOR: every active Property count surface uses the shared quick picks', () => {
  for (const type of ['apartment', 'house', 'villa', 'chalet'] as const) {
    assert.equal(isPropertyNumericQuickPickSurface(type), true);
  }
  assert.equal(isPropertyNumericQuickPickSurface('floor', 'residential'), true);
  assert.equal(isPropertyNumericQuickPickSurface('floor', 'commercial'), true);
  assert.equal(isPropertyNumericQuickPickSurface('office'), true);
  assert.equal(isPropertyNumericQuickPickSurface('warehouse'), true);
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
  assert.match(source, /expanded: transition\.expanded/);
  assert.doesNotMatch(source, /onChangeText\(['"]6['"]\)/);
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /minHeight: 44/);
});

test('SOURCE ASSERTION: Property applies quick picks only to the three authorized fields', async () => {
  const source = await readFile('components/PropertyEnrichmentFields.tsx', 'utf8');
  assert.match(source, /definition\.control === 'numeric_quick_pick'/);
  assert.match(source, /isPropertyNumericQuickPickSurface\(propertyType, floorUse\)/);
});

test('SOURCE ASSERTION: Requirement keeps ambiguous surfaces on current inputs and Buy without Rent details', async () => {
  const source = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(source, /isRequirementNumericQuickPickSurface\(purpose, propertyType\)/);
  assert.match(source, /requirement:new:owner:/);
  assert.match(source, /quickPickValueScopeKey === recordScopeKey \? bedrooms : ''/);
  assert.match(source, /quickPickValueScopeKey === recordScopeKey \? bathrooms : ''/);
  assert.match(source, /hasPendingInvalidQuickPickForScope\(quickPickValidation, recordScopeKey\)/);
  assert.match(source, /scopeKey=\{recordScopeKey\}/);
  assert.match(source, /requirements\.buy_no_rent_details/);
  assert.match(source, /<TextInput value=\{bedrooms\}/);
  assert.match(source, /<TextInput value=\{bathrooms\}/);
});