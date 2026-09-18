import type { PropertyType } from '@workspace/property-domain';
import { toEnglishDigits } from '@/constants/market';

export const NUMERIC_QUICK_PICK_VALUES = [1, 2, 3, 4, 5] as const;

export type ExactIntegerInput =
  | { readonly kind: 'blank'; readonly normalized: '' }
  | { readonly kind: 'valid'; readonly normalized: string; readonly value: number }
  | { readonly kind: 'invalid'; readonly normalized: string };

export interface ExactIntegerTransition {
  readonly pending: string;
  readonly committedValue: string;
  readonly invalid: boolean;
}

const UNAMBIGUOUS_RESIDENTIAL_TYPES = new Set<PropertyType>([
  'apartment',
  'house',
  'villa',
  'chalet',
]);

export function parseExactIntegerInput(input: string): ExactIntegerInput {
  const normalized = toEnglishDigits(input);
  if (normalized.trim() === '') return { kind: 'blank', normalized: '' };
  if (!/^\d+$/.test(normalized)) return { kind: 'invalid', normalized };
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) return { kind: 'invalid', normalized };
  return { kind: 'valid', normalized, value };
}

export function shouldOpenExactEntry(value: string): boolean {
  const parsed = parseExactIntegerInput(value);
  return parsed.kind === 'invalid'
    || parsed.kind === 'valid' && (parsed.value === 0 || parsed.value >= 6);
}

export function openNumericExactEntry(value: string): {
  readonly expanded: true;
  readonly value: string;
} {
  return { expanded: true, value };
}

export function resolveExactIntegerInput(
  input: string,
  committedValue: string,
): ExactIntegerTransition {
  const parsed = parseExactIntegerInput(input);
  if (parsed.kind === 'invalid') {
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

export function hasPendingInvalidQuickPick(fields: ReadonlySet<unknown>): boolean {
  return fields.size > 0;
}

export function selectNumericQuickPick(value: number): string {
  if (!(NUMERIC_QUICK_PICK_VALUES as readonly number[]).includes(value)) {
    throw new Error('INVALID_NUMERIC_QUICK_PICK');
  }
  return String(value);
}

export function isPropertyNumericQuickPickSurface(
  propertyType: PropertyType,
  floorUse?: string,
): boolean {
  return UNAMBIGUOUS_RESIDENTIAL_TYPES.has(propertyType)
    || propertyType === 'floor' && floorUse === 'residential';
}

export function isRequirementNumericQuickPickSurface(
  purpose: 'rent' | 'buy',
  propertyType: PropertyType,
): boolean {
  return purpose === 'rent' && UNAMBIGUOUS_RESIDENTIAL_TYPES.has(propertyType);
}