import {
  validateProperty,
  APARTMENT_SUBTYPES,
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
import { hasPopulatedCategoryCapture } from '@/services/propertyDemoCatalog';

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

export function isBasicApartmentFollowUpCapture(
  propertyType: Property['core']['propertyType'] | undefined,
  selectedRouteSubtype: string | undefined,
  storedSubtype: string | undefined,
): boolean {
  if (propertyType !== 'apartment') return false;
  if (selectedRouteSubtype !== undefined) {
    if (selectedRouteSubtype === 'standard' || selectedRouteSubtype === 'standard_apartment') return true;
    return false;
  }
  if (storedSubtype === 'standard' || storedSubtype === 'standard_apartment') return true;
  if (storedSubtype === undefined) return true;
  return false;
}

export function hasCaptureEnrichmentValues(
  details: CaptureDetailValues,
  description?: string,
): boolean {
  const { apartmentSubtype: _subtype, ...optionalDetails } = details;
  return details.areaSquareMeters !== undefined
    || hasPopulatedCategoryCapture(optionalDetails as Record<string, unknown>)
    || Boolean(description?.trim());
}

export function shouldSaveBasicCapture(
  details: CaptureDetailValues,
  description?: string,
  forceBasic = false,
  includeCapturedDetails = false,
): boolean {
  return !includeCapturedDetails
    && (forceBasic || !hasCaptureEnrichmentValues(details, description));
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
  const rawSubtype = fields.apartmentSubtype;
  const apartmentSubtype = baseline.core.propertyType === 'apartment' && rawSubtype
    ? APARTMENT_SUBTYPES.find(subtype => subtype === rawSubtype)
    : undefined;
  if (baseline.core.propertyType === 'apartment' && rawSubtype && !apartmentSubtype) {
    throw new Error('UNSUPPORTED_APARTMENT_SUBTYPE');
  }
  const knownFields = new Set<PropertyDetailField>(
    PROPERTY_FORM_CATALOG.map(definition => definition.field),
  );
  for (const key of knownFields) delete rawDetails[key];

  const applicable = getApplicablePropertyFormFields(
    baseline.core.propertyType,
    fields.floorUse as 'residential' | 'commercial' | undefined,
    apartmentSubtype,
    fields.propertyUse as 'residential' | 'commercial' | undefined,
  );
  if (strict && ['occupancy', 'masterBedroomCount'].some(field =>
    fields[field as PropertyDetailField]?.trim()
    && !applicable.some(definition => definition.field === field))) {
    throw new Error('RESIDENTIAL_CAPTURE_DETAIL_INCOMPATIBLE');
  }
  if (strict && baseline.core.propertyType === 'floor') {
    const applicableFields = new Set(applicable.map(definition => definition.field));
    const populatedFloorFields = PROPERTY_FORM_CATALOG
      .filter(({ field }) => field !== 'floorUse' && fields[field]?.trim())
    if (!fields.floorUse?.trim() && populatedFloorFields.length > 0) {
      throw new Error('FLOOR_USE_REQUIRED');
    }
    if (populatedFloorFields.some(({ field }) => !applicableFields.has(field))) {
      throw new Error('FLOOR_CAPTURE_DETAIL_INCOMPATIBLE');
    }
  }
  for (const { field } of applicable) {
    const raw = fields[field];
    if (!raw?.trim()) continue;
    if (field === 'clarification') continue;
    if (field === 'intendedUse' || field === 'commercialActivity') rawDetails[field] = { value: raw, privacy: normalPrivacy };
    else if (field === 'privateParkingCount' && !fields.parkingTypes?.split(',').includes('private')) continue;
    else if (field === 'floorUse' || field === 'apartmentSubtype' || field === 'furnishing' || field === 'occupancy' || field === 'propertyUse' || field === 'buildingAgeBand' || field === 'streetPosition' || field === 'rentalOccupancy') rawDetails[field] = raw;
    else if (field === 'parkingTypes') rawDetails[field] = raw.split(',').filter(Boolean);
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
    ...((fields.manualLocationText?.trim() || fields.mapsLink?.trim() || fields.coordinates) ? {
      locationEnrichment: {
        ...(baseline.locationEnrichment ?? {}),
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
