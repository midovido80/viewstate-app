import type { PropertyType } from '@workspace/property-domain';
import { toEnglishDigits } from '@/constants/market';

export const NUMERIC_QUICK_PICK_VALUES = [1, 2, 3, 4, 5] as const;
export const FLOOR_NUMBER_QUICK_PICK_VALUES = [0, ...NUMERIC_QUICK_PICK_VALUES] as const;

const UNAMBIGUOUS_RESIDENTIAL_TYPES = new Set<PropertyType>([
  'apartment',
  'house',
  'villa',
  'chalet',
]);

export type ExactIntegerInput =
  | { readonly kind: 'blank'; readonly normalized: '' }
  | { readonly kind: 'valid'; readonly normalized: string; readonly value: number }
  | { readonly kind: 'invalid'; readonly normalized: string };

export interface ExactIntegerTransition {
  readonly pending: string;
  readonly committedValue: string;
  readonly invalid: boolean;
}

export interface NumericQuickPickLocalState {
  readonly scopeKey: string;
  readonly pending: string;
  readonly invalid: boolean;
  readonly expanded: boolean;
}

export interface QuickPickValidationScope<T> {
  readonly scopeKey: string;
  readonly invalidFields: ReadonlySet<T>;
}

export function parseExactIntegerInput(input: string): ExactIntegerInput {
  const normalized = toEnglishDigits(input);
  if (normalized.trim() === '') return { kind: 'blank', normalized: '' };
  if (!/^\d+$/.test(normalized)) return { kind: 'invalid', normalized };
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) return { kind: 'invalid', normalized };
  return { kind: 'valid', normalized, value };
}

export function shouldOpenExactEntry(
  value: string,
  quickPickValues: readonly number[] = NUMERIC_QUICK_PICK_VALUES,
): boolean {
  const parsed = parseExactIntegerInput(value);
  return parsed.kind === 'invalid'
    || parsed.kind === 'valid'
      && (parsed.value === 0 && !quickPickValues.includes(0) || parsed.value >= 6);
}

export function createNumericQuickPickLocalState(
  scopeKey: string,
  value: string,
  quickPickValues: readonly number[] = NUMERIC_QUICK_PICK_VALUES,
): NumericQuickPickLocalState {
  return {
    scopeKey,
    pending: value,
    invalid: false,
    expanded: shouldOpenExactEntry(value, quickPickValues),
  };
}

export function reconcileNumericQuickPickScope(
  current: NumericQuickPickLocalState,
  scopeKey: string,
  value: string,
  quickPickValues: readonly number[] = NUMERIC_QUICK_PICK_VALUES,
): NumericQuickPickLocalState {
  return current.scopeKey === scopeKey
    ? current
    : createNumericQuickPickLocalState(scopeKey, value, quickPickValues);
}

export function synchronizeNumericQuickPickValue(
  current: NumericQuickPickLocalState,
  scopeKey: string,
  value: string,
  quickPickValues: readonly number[] = NUMERIC_QUICK_PICK_VALUES,
): NumericQuickPickLocalState {
  const scoped = reconcileNumericQuickPickScope(current, scopeKey, value, quickPickValues);
  if (scoped.scopeKey !== current.scopeKey || scoped.invalid) return scoped;
  return {
    ...scoped,
    pending: value,
    expanded: scoped.expanded || shouldOpenExactEntry(value, quickPickValues),
  };
}

export function openNumericExactEntry(value: string): {
  readonly expanded: true;
  readonly value: string;
} {
  return { expanded: true, value };
}

export function openRequiredNumericExactEntry(
  value: string,
  quickPickValues: readonly number[] = NUMERIC_QUICK_PICK_VALUES,
): {
  readonly expanded: true;
  readonly value: string;
  readonly invalid: boolean;
} {
  const parsed = parseExactIntegerInput(value);
  return {
    ...openNumericExactEntry(value),
    invalid: parsed.kind === 'invalid'
      || parsed.kind === 'valid'
        && parsed.value < 6
        && !(parsed.value === 0 && quickPickValues.includes(0)),
  };
}

export function resolveExactIntegerInput(
  input: string,
  committedValue: string,
  required = false,
  quickPickValues: readonly number[] = NUMERIC_QUICK_PICK_VALUES,
): ExactIntegerTransition {
  const parsed = parseExactIntegerInput(input);
  if (
    parsed.kind === 'invalid'
    || required && (
      parsed.kind === 'valid'
      && parsed.value < 6
      && !(parsed.value === 0 && quickPickValues.includes(0))
    )
  ) {
    return {
      pending: parsed.normalized,
      committedValue,
      invalid: true,
    };
  }
  return {
    pending: parsed.normalized,
    committedValue: parsed.normalized,
    invalid: false,
  };
}

export function updateInvalidQuickPickFields<T>(
  current: ReadonlySet<T>,
  field: T,
  invalid: boolean,
): Set<T> {
  const next = new Set(current);
  if (invalid) next.add(field);
  else next.delete(field);
  return next;
}

export function createQuickPickValidationScope<T>(
  scopeKey: string,
): QuickPickValidationScope<T> {
  return { scopeKey, invalidFields: new Set<T>() };
}

export function updateScopedInvalidQuickPickFields<T>(
  current: QuickPickValidationScope<T>,
  activeScopeKey: string,
  sourceScopeKey: string,
  field: T,
  invalid: boolean,
): QuickPickValidationScope<T> {
  const active = current.scopeKey === activeScopeKey
    ? current
    : createQuickPickValidationScope<T>(activeScopeKey);
  if (sourceScopeKey !== activeScopeKey) return active;
  return {
    scopeKey: activeScopeKey,
    invalidFields: updateInvalidQuickPickFields(active.invalidFields, field, invalid),
  };
}

export function hasPendingInvalidQuickPickForScope(
  scope: QuickPickValidationScope<unknown>,
  activeScopeKey: string,
): boolean {
  return scope.scopeKey === activeScopeKey
    && hasPendingInvalidQuickPick(scope.invalidFields);
}

export function hasPendingInvalidQuickPick(fields: ReadonlySet<unknown>): boolean {
  return fields.size > 0;
}

export function selectNumericQuickPick(
  value: number,
  quickPickValues: readonly number[] = NUMERIC_QUICK_PICK_VALUES,
): string {
  if (!quickPickValues.includes(value)) {
    throw new Error('INVALID_NUMERIC_QUICK_PICK');
  }
  return String(value);
}

export function isPropertyNumericQuickPickSurface(
  propertyType: PropertyType,
  floorUse?: string,
): boolean {
  // Every applicable count field uses the same production control. The
  // catalog remains responsible for deciding whether a field is applicable;
  // this predicate only prevents non-count/unsupported property surfaces from
  // accidentally opting in.
  return propertyType !== 'other_built_property'
    && (propertyType !== 'floor' || floorUse === undefined || floorUse === 'residential' || floorUse === 'commercial');
}

export function isRequirementNumericQuickPickSurface(
  purpose: 'rent' | 'buy',
  propertyType: PropertyType,
): boolean {
  return purpose === 'rent' && UNAMBIGUOUS_RESIDENTIAL_TYPES.has(propertyType);
}