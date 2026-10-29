import {
  type PropertyDetailField,
  type PropertyType,
  type Transaction,
} from '@workspace/property-domain';
import { isDetailFieldApplicable } from '@/services/amenityTypeTransitions';

export interface PropertyTransitionState {
  readonly propertyType: PropertyType;
  readonly transaction: Transaction;
  readonly canonicalDetails: Readonly<Partial<Record<PropertyDetailField, string>>>;
  readonly priceAmount?: number;
  readonly rentalPeriodId?: string;
}

export interface PropertyTransitionProposal {
  readonly kind: 'property_type' | 'transaction';
  readonly scopeKey: string;
  readonly from: PropertyType | Transaction;
  readonly to: PropertyType | Transaction;
  readonly sourceSnapshot: string;
  readonly affected: readonly { readonly field: string; readonly value: string }[];
}

const populated = (value: string | number | boolean | undefined): value is string | number | boolean =>
  value !== undefined && value !== '';

export function propertyTransitionSnapshot(state: PropertyTransitionState): string {
  return JSON.stringify(state);
}

export function createPropertyTypeTransitionProposal(
  scopeKey: string,
  state: PropertyTransitionState,
  to: PropertyType,
): PropertyTransitionProposal | null {
  if (state.propertyType === to) return null;
  const floorUse = state.canonicalDetails.floorUse as 'residential' | 'commercial' | undefined;
  const affected = Object.entries(state.canonicalDetails)
    .filter(([field, value]) =>
      populated(value)
      && isDetailFieldApplicable(field as PropertyDetailField, state.propertyType, floorUse)
      && !isDetailFieldApplicable(field as PropertyDetailField, to, floorUse))
    .map(([field, value]) => ({ field, value: String(value) }));
  return {
    kind: 'property_type',
    scopeKey,
    from: state.propertyType,
    to,
    sourceSnapshot: propertyTransitionSnapshot(state),
    affected,
  };
}

export function createTransactionTransitionProposal(
  scopeKey: string,
  state: PropertyTransitionState,
  to: Transaction,
): PropertyTransitionProposal | null {
  if (state.transaction === to) return null;
  const affected: { field: string; value: string }[] = [];
  if (populated(state.priceAmount)) {
    affected.push({ field: 'priceAmount', value: String(state.priceAmount) });
  }
  if (state.transaction === 'rent' && to === 'sale' && populated(state.rentalPeriodId)) {
    affected.push({ field: 'rentalPeriodId', value: String(state.rentalPeriodId) });
  }
  return {
    kind: 'transaction',
    scopeKey,
    from: state.transaction,
    to,
    sourceSnapshot: propertyTransitionSnapshot(state),
    affected,
  };
}

export function applyPropertyTransition(
  currentScopeKey: string,
  state: PropertyTransitionState,
  proposal: PropertyTransitionProposal,
): PropertyTransitionState | null {
  if (
    proposal.scopeKey !== currentScopeKey
    || proposal.sourceSnapshot !== propertyTransitionSnapshot(state)
  ) return null;

  const canonicalDetails = { ...state.canonicalDetails };
  let priceAmount = state.priceAmount;
  let rentalPeriodId = state.rentalPeriodId;
  for (const item of proposal.affected) {
    if (item.field === 'priceAmount') priceAmount = undefined;
    else if (item.field === 'rentalPeriodId') rentalPeriodId = undefined;
    else delete canonicalDetails[item.field as PropertyDetailField];
  }
  return {
    propertyType: proposal.kind === 'property_type' ? proposal.to as PropertyType : state.propertyType,
    transaction: proposal.kind === 'transaction' ? proposal.to as Transaction : state.transaction,
    canonicalDetails,
    priceAmount,
    rentalPeriodId,
  };
}

export function propertyTransitionErrorMessage(
  language: 'en' | 'ar',
): string {
  return language === 'ar'
    ? 'تغيّرت المسودة قبل تأكيد الانتقال. راجع اختياراتك وحاول مرة أخرى.'
    : 'The draft changed before this transition was confirmed. Review your choices and try again.';
}

export function propertyTransitionConfirmationMessage(
  proposal: PropertyTransitionProposal,
  language: 'en' | 'ar',
  fieldLabel: (field: string) => string,
  fieldValue: (field: string, value: string) => string,
): string {
  const intro = language === 'ar'
    ? 'سيؤدي هذا التغيير إلى إزالة القيم التالية من المسودة الحالية:'
    : 'This change will remove the following values from the current draft:';
  return [
    intro,
    ...proposal.affected.map(item => `• ${fieldLabel(item.field)}: ${fieldValue(item.field, item.value)}`),
  ].join('\n');
}