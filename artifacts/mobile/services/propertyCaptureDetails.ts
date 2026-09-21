import {
  validateProperty,
  type Property,
  type PropertyDetailField,
  type PropertyDraft,
} from '@workspace/property-domain';
import type { EnrichmentFieldValues } from '@/components/PropertyEnrichmentFields';
import { getApplicablePropertyFormFields } from '@/services/propertyFormCatalog';
import { PROPERTY_FORM_CATALOG } from '@/services/propertyFormCatalog';

const normalPrivacy = {
  classification: 'normal' as const,
  disclosurePolicy: 'normal' as const,
};

export type CaptureDetailValues = EnrichmentFieldValues;

export function applyCaptureTransactionDefaults(
  draft: PropertyDraft,
  changes: Partial<PropertyDraft>,
  origin: 'fresh' | 'resumed',
): Partial<PropertyDraft> {
  if (
    origin === 'fresh'
    && changes.transaction === 'rent'
    && draft.rentalPeriodId === undefined
    && changes.rentalPeriodId === undefined
  ) {
    return { ...changes, rentalPeriodId: 'monthly' };
  }
  return changes;
}

export function captureDetailsScopeKey(propertyCoreId?: string): string {
  return `capture:${propertyCoreId ?? 'new'}`;
}

export function buildPropertyWithCaptureDetails(
  baseline: Property,
  fields: CaptureDetailValues,
  strict = true,
): Property {
  const rawDetails: Record<string, unknown> = {
    ...((baseline.typeDetails ?? {}) as unknown as Record<string, unknown>),
    propertyType: baseline.core.propertyType,
  };
  const knownFields = new Set<PropertyDetailField>(
    PROPERTY_FORM_CATALOG.map(definition => definition.field),
  );
  for (const key of knownFields) delete rawDetails[key];

  const applicable = getApplicablePropertyFormFields(
    baseline.core.propertyType,
    fields.floorUse as 'residential' | 'commercial' | undefined,
  );
  for (const { field } of applicable) {
    const raw = fields[field];
    if (!raw?.trim()) continue;
    if (field === 'clarification') continue;
    if (field === 'intendedUse' || field === 'commercialActivity') rawDetails[field] = { value: raw, privacy: normalPrivacy };
    else if (field === 'floorUse' || field === 'apartmentSubtype' || field === 'furnishing') rawDetails[field] = raw;
    else if (field.startsWith('has')) rawDetails[field] = raw === 'true';
    else rawDetails[field] = Number(raw);
  }

  if (baseline.core.propertyType === 'other_built_property' && fields.clarification?.trim()) {
    rawDetails.clarification = { value: fields.clarification, privacy: normalPrivacy };
  }
  const populatedDetailKeys = Object.keys(rawDetails).filter(key => key !== 'propertyType');
  if (
    strict
    && baseline.core.propertyType === 'other_built_property'
    && populatedDetailKeys.length > 0
    && !rawDetails.clarification
  ) {
    throw new Error('OTHER_CLARIFICATION_REQUIRED');
  }

  const candidate: Property = {
    ...baseline,
    typeDetails: populatedDetailKeys.length > 0
      ? rawDetails as unknown as Property['typeDetails']
      : undefined,
  };
  const validation = validateProperty(candidate);
  if (!validation.ok) {
    if (!strict && validation.issues.every(issue => issue.code === 'required')) return baseline;
    throw new Error(`INVALID_CAPTURE_DETAILS:${validation.issues.map(issue => issue.path.join('.')).join(',')}`);
  }
  return candidate;
}

export function summarizeCaptureDetails(
  property: Property,
  fields: CaptureDetailValues,
): CaptureDetailValues {
  const candidate = buildPropertyWithCaptureDetails(property, fields, false);
  const details = candidate.typeDetails as Record<string, unknown> | undefined;
  if (!details) return {};
  return Object.fromEntries(Object.entries(details)
    .filter(([key]) => key !== 'propertyType' && key !== 'clarification')
    .map(([key, value]) => [
      key,
      typeof value === 'object' && value && 'value' in value
        ? String((value as { value: unknown }).value)
        : String(value),
    ])) as CaptureDetailValues;
}