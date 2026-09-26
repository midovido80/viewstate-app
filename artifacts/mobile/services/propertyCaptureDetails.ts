import {
  validateProperty,
  type Property,
  type PropertyDetailField,
  type PropertyDraft,
} from '@workspace/property-domain';
import type { CaptureDetailValues } from '@/services/captureDetailsStorage';
import { getApplicablePropertyFormFields } from '@/services/propertyFormCatalog';
import { PROPERTY_FORM_CATALOG } from '@/services/propertyFormCatalog';
import { normalizeGoogleMapsLink } from '@/services/mapsLink';
import { optionalClassifiedLiteral } from '@/services/literalText';
import { squareFeetToSquareMeters } from '@/services/propertyFactProjection';

const normalPrivacy = {
  classification: 'normal' as const,
  disclosurePolicy: 'normal' as const,
};

export type { CaptureDetailValues } from '@/services/captureDetailsStorage';

export function preserveCaptureOwnershipAndEvidence(details: CaptureDetailValues): CaptureDetailValues {
  return {
    ...(details.areaSquareMeters !== undefined ? { areaSquareMeters: details.areaSquareMeters } : {}),
    ...(details.areaUnit ? { areaUnit: details.areaUnit } : {}),
    ...(details.nearbyServices ? { nearbyServices: details.nearbyServices } : {}),
    ...(details.manualLocationText ? { manualLocationText: details.manualLocationText } : {}),
    ...(details.paciUnitNumbers ? { paciUnitNumbers: details.paciUnitNumbers.map(item => ({ ...item })) } : {}),
    ...(details.mapsLink ? { mapsLink: details.mapsLink } : {}),
    ...(details.coordinates ? { coordinates: details.coordinates } : {}),
    ...(details.attachments ? { attachments: details.attachments } : {}),
  };
}

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

export function formatCaptureDetailsValidationError(
  error: unknown,
  fields: CaptureDetailValues,
  propertyType: Property['core']['propertyType'],
  language: 'en' | 'ar',
): string | null {
  const message = error instanceof Error ? error.message : '';
  if (message === 'OTHER_CLARIFICATION_REQUIRED') {
    return language === 'ar'
      ? 'أضف توضيحاً لنوع العقار قبل متابعة الحفظ.'
      : 'Add a clarification for this property type before continuing.';
  }
  if (!message.startsWith('INVALID_CAPTURE_DETAILS:')) return null;

  const paths = message.slice('INVALID_CAPTURE_DETAILS:'.length).split(',');
  const fieldsWithIssues = paths
    .map(path => {
      const segments = path.split('.');
      return segments[segments.length - 1];
    })
    .filter((field): field is string => Boolean(field));
  const apartments = Number(fields.apartmentCount || 0);
  const shops = Number(fields.shopCount || 0);
  const offices = Number(fields.officeCount || 0);
  const units = Number(fields.unitCount || 0);
  const breakdown = apartments + shops + offices;
  if (
    fieldsWithIssues.includes('unitCount')
    && (propertyType === 'whole_building' || propertyType === 'commercial_complex')
    && [apartments, shops, offices, units].every(value => Number.isSafeInteger(value) && value >= 0)
    && breakdown > units
  ) {
    const labels = language === 'ar'
      ? `الشقق ${apartments} + المحلات ${shops} + المكاتب ${offices}`
      : `apartments ${apartments} + shops ${shops} + offices ${offices}`;
    return language === 'ar'
      ? `مجموع التفصيل المعروف (${labels} = ${breakdown}) يتجاوز عدد الوحدات (${units}). زد عدد الوحدات أو صحح أعداد الشقق والمحلات والمكاتب.`
      : `The known breakdown (${labels} = ${breakdown}) exceeds the unit total (${units}). Increase the unit count or correct the apartment, shop, and office counts.`;
  }

  const labels = fieldsWithIssues.map(field =>
    PROPERTY_FORM_CATALOG.find(definition => definition.field === field)?.label[language === 'ar' ? 1 : 0] ?? field,
  );
  const uniqueLabels = [...new Set(labels)];
  return language === 'ar'
    ? `تحقق من المواصفات التالية وصحح القيم غير المتوافقة: ${uniqueLabels.join('، ')}.`
    : `Review and correct the invalid or incompatible values for: ${uniqueLabels.join(', ')}.`;
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
    ...(fields.nearbyServices?.trim()
      ? { nearbyServices: JSON.parse(fields.nearbyServices) as readonly string[] }
      : {}),
    ...(fields.demoMetadata ? {
      demoCapture: (() => {
        const legacy = { ...fields.demoMetadata };
        delete legacy.areaSquareMeters;
        delete legacy.areaUnit;
        return legacy;
      })(),
    } : {}),
    ...(fields.areaSquareMeters !== undefined
      ? { areaSquareMeters: fields.areaUnit === 'square_foot' ? squareFeetToSquareMeters(fields.areaSquareMeters) : fields.areaSquareMeters, areaUnit: 'square_meter' as const }
      : {}),
    ...(fields.areaSquareMeters === undefined && baseline.areaSquareMeters !== undefined && baseline.areaUnit === 'square_foot'
      ? { areaSquareMeters: squareFeetToSquareMeters(baseline.areaSquareMeters), areaUnit: 'square_meter' as const }
      : {}),
    ...((fields.manualLocationText?.trim() || fields.paciUnitNumbers?.length || fields.mapsLink?.trim() || fields.coordinates) ? {
      locationEnrichment: {
        ...(baseline.locationEnrichment ?? {}),
        ...(fields.paciUnitNumbers?.length
          ? {
            paciUnitNumbers: fields.paciUnitNumbers.map(item => ({
              unitLabel: item.unitLabel,
              paciNumber: {
                value: item.paciNumber,
                privacy: { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' },
              },
            })),
          }
          : {}),
        ...(fields.manualLocationText?.trim()
          ? { manualLocationText: optionalClassifiedLiteral(fields.manualLocationText, { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' }) }
          : {}),
        ...(fields.mapsLink?.trim()
          ? { mapsLink: optionalClassifiedLiteral(normalizeGoogleMapsLink(fields.mapsLink), { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' }) }
          : {}),
        ...(fields.coordinates ? { coordinates: fields.coordinates } : {}),
      },
    } : {}),
    ...(fields.attachments?.length ? {
      attachments: fields.attachments,
    } : {}),
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