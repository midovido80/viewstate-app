import type { Property, SeekerRequirement } from '@workspace/property-domain';

export type IntentLanguage = 'en' | 'ar';
export type RecordIntentId = 'offered_sale' | 'offered_rent' | 'wanted_buy' | 'wanted_rent';
export type PresentedIntentId = RecordIntentId | 'conflict';

/** Stable semantic identifiers and their user-facing translations. */
export const RECORD_INTENT_LABELS: Readonly<Record<PresentedIntentId, Readonly<Record<IntentLanguage, string>>>> = {
  offered_sale: { en: 'Offered for Sale', ar: 'معروض للبيع' },
  offered_rent: { en: 'Offered for Rent', ar: 'معروض للإيجار' },
  wanted_buy: { en: 'Purchase Request', ar: 'طلب شراء' },
  wanted_rent: { en: 'Rental Request', ar: 'طلب استئجار' },
  conflict: { en: 'Record intent conflict', ar: 'تعارض في نوع المعاملة' },
};

export interface RecordIntentPresentation {
  readonly id: PresentedIntentId;
  readonly label: string;
  readonly valid: boolean;
}

/**
 * Intentionally checks both halves at runtime: malformed legacy rows remain
 * readable without ever being presented as an unrelated valid transaction.
 */
export function projectRecordIntent(
  direction: unknown,
  transaction: unknown,
  language: IntentLanguage,
): RecordIntentPresentation {
  const id: PresentedIntentId =
    direction === 'offered' && transaction === 'sale' ? 'offered_sale'
      : direction === 'offered' && transaction === 'rent' ? 'offered_rent'
        : direction === 'wanted' && transaction === 'buy' ? 'wanted_buy'
          : direction === 'wanted' && transaction === 'rent' ? 'wanted_rent'
            : 'conflict';
  return { id, label: RECORD_INTENT_LABELS[id][language], valid: id !== 'conflict' };
}

export function projectPropertyIntent(property: Pick<Property, 'activeOffer'>, language: IntentLanguage): RecordIntentPresentation {
  return projectRecordIntent('offered', property.activeOffer?.transaction, language);
}

export function projectRequirementIntent(requirement: Pick<SeekerRequirement, 'purpose'>, language: IntentLanguage): RecordIntentPresentation {
  return projectRecordIntent('wanted', requirement.purpose, language);
}

export interface RecordCardBadge {
  readonly key: 'intent' | 'type' | 'subtype';
  readonly label: string;
}

/** Semantic order only. The rendering container places the first item on the right for RTL. */
export function projectRecordCardBadges(
  intent: RecordIntentPresentation,
  baseTypeLabel: string,
  subtypeLabel?: string,
): readonly RecordCardBadge[] {
  const badges: RecordCardBadge[] = [
    { key: 'intent', label: intent.label },
    { key: 'type', label: baseTypeLabel },
  ];
  const subtype = subtypeLabel?.trim();
  if (subtype && subtype.normalize('NFKC').toLocaleLowerCase() !== baseTypeLabel.trim().normalize('NFKC').toLocaleLowerCase()) {
    badges.push({ key: 'subtype', label: subtype });
  }
  return badges;
}