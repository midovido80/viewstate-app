import type { Property } from '@workspace/property-domain';
import type { PropertyEditChoices } from './propertyUpdateRecovery';

const subtypeLabels = {
  studio: ['Studio', 'استوديو'],
  standard_apartment: ['Standard apartment', 'شقة عادية'],
  duplex: ['Duplex', 'دوبلكس'],
} as const;

function detail(property: Property, field: string): unknown {
  const value = (property.typeDetails as unknown as Record<string, unknown> | undefined)?.[field];
  return typeof value === 'object' && value !== null && 'value' in value
    ? (value as { value: unknown }).value : value;
}

function savedSubtype(property: Property): unknown {
  const canonical = detail(property, 'apartmentSubtype');
  if (canonical !== undefined) return canonical;
  const category = property.demoCapture?.categoryId;
  return category === 'duplex' ? 'duplex'
    : category === 'studio_apartment' ? 'studio'
      : category === 'family_apartment' || category === 'bachelor_apartment' ? 'standard_apartment'
        : undefined;
}

/** Presentation-only fallback for legacy categories; never rewrites a stored record. */
export function getSavedPropertyTypeLabel(property: Property, language: 'en' | 'ar', baseTypeLabel: string): string {
  if (property.core.propertyType === 'apartment') {
    const subtype = savedSubtype(property);
    if (typeof subtype === 'string' && subtype in subtypeLabels) {
      return subtypeLabels[subtype as keyof typeof subtypeLabels][language === 'ar' ? 1 : 0];
    }
  }
  if (property.core.propertyType === 'floor') {
    const use = detail(property, 'floorUse');
    if (use === 'residential') return language === 'ar' ? 'دور سكني' : 'Residential floor';
    if (use === 'commercial') return language === 'ar' ? 'دور تجاري' : 'Commercial floor';
  }
  return baseTypeLabel;
}

/** Details editing cannot change the identity already chosen when the Property was saved. */
export function assertPropertyDetailsEditClassification(
  baseline: Property,
  choices: Pick<PropertyEditChoices, 'propertyType' | 'canonicalDetails' | 'demoMetadata'>,
): void {
  const fail = () => { throw new Error('SAVED_PROPERTY_CLASSIFICATION_LOCKED'); };
  if (choices.propertyType !== baseline.core.propertyType) fail();
  const field = baseline.core.propertyType === 'apartment' ? 'apartmentSubtype'
    : baseline.core.propertyType === 'floor' ? 'floorUse' : undefined;
  if (field) {
    const requested = choices.canonicalDetails?.[field];
    const saved = field === 'apartmentSubtype' ? savedSubtype(baseline) : detail(baseline, field);
    // Missing or blank legacy draft fields are untouched, as in the existing candidate builder.
    if (requested?.trim() && requested !== saved) fail();
  }
  if (baseline.core.propertyType === 'other_built_property' && detail(baseline, 'propertyUse') !== undefined
    && choices.canonicalDetails?.propertyUse?.trim()
    && choices.canonicalDetails.propertyUse !== detail(baseline, 'propertyUse')) fail();
  if (choices.demoMetadata && choices.demoMetadata.categoryId !== baseline.demoCapture?.categoryId) fail();
}

export function assertSavedPropertyClassificationUnchanged(baseline: Property, candidate: Property): void {
  if (candidate.core.propertyType !== baseline.core.propertyType
    || (baseline.core.propertyType === 'apartment' && savedSubtype(candidate) !== savedSubtype(baseline))
    || (baseline.core.propertyType === 'floor' && detail(candidate, 'floorUse') !== detail(baseline, 'floorUse'))
    || (baseline.core.propertyType === 'other_built_property' && detail(baseline, 'propertyUse') !== undefined
      && detail(candidate, 'propertyUse') !== detail(baseline, 'propertyUse'))
    || candidate.demoCapture?.categoryId !== baseline.demoCapture?.categoryId) {
    throw new Error('SAVED_PROPERTY_CLASSIFICATION_LOCKED');
  }
}
