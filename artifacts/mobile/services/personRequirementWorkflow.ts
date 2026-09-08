import {
  validateSeekerRequirement,
  type PropertyType,
  type FloorUse,
  type RequirementOccupancy,
  type RequirementPurpose,
  type RequirementValidationIssue,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { getAreaById } from '@/constants/kuwait-areas';

export interface RequirementFormValues {
  readonly purpose: RequirementPurpose;
  readonly propertyType: PropertyType;
  readonly floorUse?: FloorUse;
  readonly preferredAreaIds: readonly string[];
  readonly minimumBudget?: number;
  readonly maximumBudget?: number;
  readonly currencyCode: string;
  readonly notes: string;
  readonly bedroomsMinimum?: number;
  readonly bathroomsMinimum?: number;
  readonly occupancy?: RequirementOccupancy;
  readonly swimmingPool?: boolean;
  readonly gym?: boolean;
  readonly seaView?: boolean;
  readonly centralAC?: boolean;
  readonly minimumBuiltUpAreaSquareMeters?: number;
  readonly maximumBuiltUpAreaSquareMeters?: number;
  readonly commercialActivity?: string;
  readonly floorNumber?: number;
  readonly minimumFrontageWidthMeters?: number;
  readonly minimumPlotAreaSquareMeters?: number;
  readonly maximumPlotAreaSquareMeters?: number;
  readonly floorCount?: number;
  readonly apartmentCount?: number;
  readonly shopCount?: number;
  readonly intendedUse?: string;
  readonly paciNumbersCount?: number;
}

export type RequirementFormResult =
  | { readonly ok: true; readonly value: SeekerRequirement }
  | { readonly ok: false; readonly issues: readonly RequirementValidationIssue[] };

export type OptionalRequirementNumberResult =
  | { readonly ok: true; readonly value: number | undefined }
  | { readonly ok: false };

const RENT_FIELD_KEYS = [
  'bedroomsMinimum',
  'bathroomsMinimum',
  'occupancy',
  'swimmingPool',
  'gym',
  'seaView',
  'centralAC',
] as const;

/**
 * Gate D no longer exposes residential fields for non-residential types.
 * Retain valid, pre-existing hidden values during an otherwise compatible
 * edit, without ever adding them to a new Requirement or a changed type.
 */
export function preserveHiddenLegacyRentFields(
  baseline: SeekerRequirement | null,
  candidate: SeekerRequirement,
): SeekerRequirement {
  const nonResidential = candidate.propertyType !== 'apartment'
    && candidate.propertyType !== 'house'
    && candidate.propertyType !== 'villa'
    && candidate.propertyType !== 'chalet'
    && !(candidate.propertyType === 'floor' && candidate.floorUse === 'residential');
  if (
    baseline === null
    || baseline.purpose !== 'rent'
    || candidate.purpose !== 'rent'
    || baseline.propertyType !== candidate.propertyType
    || baseline.floorUse !== candidate.floorUse
    || !nonResidential
  ) return candidate;

  const legacy = baseline as unknown as Record<string, unknown>;
  return {
    ...candidate,
    ...Object.fromEntries(
      RENT_FIELD_KEYS
        .filter(field => legacy[field] !== undefined)
        .map(field => [field, legacy[field]]),
    ),
  } as SeekerRequirement;
}

/** Distinguishes intentionally missing input from malformed non-empty input. */
export function parseOptionalRequirementNumber(
  input: string,
  options: { readonly integer?: boolean } = {},
): OptionalRequirementNumberResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || (options.integer && !Number.isInteger(value))) {
    return { ok: false };
  }
  return { ok: true, value };
}

/** Adapts UI values to the frozen M1 contract; all business validation stays in M1. */
export function buildPersonRequirement(
  id: string,
  seekerId: string,
  values: RequirementFormValues,
): RequirementFormResult {
  const base = {
    id,
    seekerId,
    purpose: values.purpose,
    propertyType: values.propertyType,
    preferredAreaIds: [...values.preferredAreaIds],
    budget: {
      minimum: values.minimumBudget,
      maximum: values.maximumBudget,
      currencyCode: values.currencyCode,
    },
    notes: values.notes,
    ...(values.propertyType === 'floor' && values.floorUse !== undefined
      ? { floorUse: values.floorUse }
      : {}),
    ...((values.propertyType === 'shop' || values.propertyType === 'office' || (values.propertyType === 'floor' && values.floorUse === 'commercial')) ? {
      ...(values.minimumBuiltUpAreaSquareMeters !== undefined
        ? { minimumBuiltUpAreaSquareMeters: values.minimumBuiltUpAreaSquareMeters }
        : {}),
      ...(values.maximumBuiltUpAreaSquareMeters !== undefined
        ? { maximumBuiltUpAreaSquareMeters: values.maximumBuiltUpAreaSquareMeters }
        : {}),
    } : {}),
    ...((values.propertyType === 'shop' || (values.propertyType === 'floor' && values.floorUse === 'commercial')) ? {
      ...(values.commercialActivity !== undefined
        ? { commercialActivity: values.commercialActivity }
        : {}),
      ...(values.floorNumber !== undefined ? { floorNumber: values.floorNumber } : {}),
      ...(values.minimumFrontageWidthMeters !== undefined
        ? { minimumFrontageWidthMeters: values.minimumFrontageWidthMeters }
        : {}),
    } : {}),
    ...((values.propertyType === 'commercial_complex' || values.propertyType === 'whole_building') ? {
      ...(values.minimumPlotAreaSquareMeters !== undefined ? { minimumPlotAreaSquareMeters: values.minimumPlotAreaSquareMeters } : {}),
      ...(values.maximumPlotAreaSquareMeters !== undefined ? { maximumPlotAreaSquareMeters: values.maximumPlotAreaSquareMeters } : {}),
      ...(values.floorCount !== undefined ? { floorCount: values.floorCount } : {}),
      ...(values.propertyType === 'commercial_complex' && values.shopCount !== undefined ? { shopCount: values.shopCount } : {}),
      ...(values.propertyType === 'whole_building' && values.apartmentCount !== undefined ? { apartmentCount: values.apartmentCount } : {}),
    } : {}),
    ...((values.propertyType === 'office' || (values.propertyType === 'floor' && values.floorUse === 'commercial')) ? {
      ...(values.intendedUse !== undefined ? { intendedUse: values.intendedUse } : {}),
      ...(values.propertyType === 'floor' && values.paciNumbersCount !== undefined ? { paciNumbersCount: values.paciNumbersCount } : {}),
    } : {}),
    ...(values.propertyType === 'office' ? {
      ...(values.commercialActivity !== undefined ? { commercialActivity: values.commercialActivity } : {}),
      ...(values.floorNumber !== undefined ? { floorNumber: values.floorNumber } : {}),
    } : {}),
  };
  const candidate = values.purpose === 'rent'
    && (values.propertyType === 'apartment' || values.propertyType === 'house'
      || values.propertyType === 'villa' || values.propertyType === 'chalet'
      || (values.propertyType === 'floor' && values.floorUse === 'residential')) ? {
    ...base,
    ...(values.bedroomsMinimum !== undefined ? { bedroomsMinimum: values.bedroomsMinimum } : {}),
    ...(values.bathroomsMinimum !== undefined ? { bathroomsMinimum: values.bathroomsMinimum } : {}),
    ...(values.occupancy !== undefined ? { occupancy: values.occupancy } : {}),
    ...(values.swimmingPool === true ? { swimmingPool: true } : {}),
    ...(values.gym === true ? { gym: true } : {}),
    ...(values.seaView === true ? { seaView: true } : {}),
    ...(values.centralAC === true ? { centralAC: true } : {}),
  } : base;
  const result = validateSeekerRequirement(candidate, {
    isCanonicalAreaId: areaId => getAreaById(areaId) !== undefined,
  });
  return result.ok ? { ok: true, value: result.value } : result;
}

export function formValuesFromRequirement(requirement: SeekerRequirement): RequirementFormValues {
  const inferredFloorUse = requirement.propertyType === 'floor'
    && requirement.floorUse === undefined
    && (
      requirement.minimumBuiltUpAreaSquareMeters !== undefined
      || requirement.maximumBuiltUpAreaSquareMeters !== undefined
      || requirement.commercialActivity !== undefined
      || requirement.floorNumber !== undefined
      || requirement.minimumFrontageWidthMeters !== undefined
    )
    ? 'commercial'
    : requirement.floorUse;
  return {
    purpose: requirement.purpose,
    propertyType: requirement.propertyType,
    ...(requirement.propertyType === 'floor' && inferredFloorUse !== undefined
      ? { floorUse: inferredFloorUse }
      : {}),
    preferredAreaIds: [...requirement.preferredAreaIds],
    minimumBudget: requirement.budget.minimum,
    maximumBudget: requirement.budget.maximum,
    currencyCode: requirement.budget.currencyCode,
    notes: requirement.notes,
    ...((requirement.propertyType === 'shop' || requirement.propertyType === 'office' || (requirement.propertyType === 'floor' && requirement.floorUse !== 'residential')) ? {
      ...(requirement.minimumBuiltUpAreaSquareMeters !== undefined
        ? { minimumBuiltUpAreaSquareMeters: requirement.minimumBuiltUpAreaSquareMeters }
        : {}),
      ...(requirement.maximumBuiltUpAreaSquareMeters !== undefined
        ? { maximumBuiltUpAreaSquareMeters: requirement.maximumBuiltUpAreaSquareMeters }
        : {}),
    } : {}),
    ...((requirement.propertyType === 'shop' || (requirement.propertyType === 'floor' && requirement.floorUse !== 'residential')) ? {
      ...(requirement.commercialActivity !== undefined
        ? { commercialActivity: requirement.commercialActivity }
        : {}),
      ...(requirement.floorNumber !== undefined
        ? { floorNumber: requirement.floorNumber }
        : {}),
      ...(requirement.minimumFrontageWidthMeters !== undefined
        ? { minimumFrontageWidthMeters: requirement.minimumFrontageWidthMeters }
        : {}),
    } : {}),
    ...((requirement.propertyType === 'commercial_complex' || requirement.propertyType === 'whole_building') ? {
      ...(requirement.minimumPlotAreaSquareMeters !== undefined ? { minimumPlotAreaSquareMeters: requirement.minimumPlotAreaSquareMeters } : {}),
      ...(requirement.maximumPlotAreaSquareMeters !== undefined ? { maximumPlotAreaSquareMeters: requirement.maximumPlotAreaSquareMeters } : {}),
      ...(requirement.floorCount !== undefined ? { floorCount: requirement.floorCount } : {}),
      ...(requirement.shopCount !== undefined ? { shopCount: requirement.shopCount } : {}),
      ...(requirement.apartmentCount !== undefined ? { apartmentCount: requirement.apartmentCount } : {}),
    } : {}),
    ...((requirement.propertyType === 'office' || (requirement.propertyType === 'floor' && requirement.floorUse === 'commercial')) ? {
      ...(requirement.intendedUse !== undefined ? { intendedUse: requirement.intendedUse } : {}),
      ...(requirement.paciNumbersCount !== undefined ? { paciNumbersCount: requirement.paciNumbersCount } : {}),
    } : {}),
    ...(requirement.propertyType === 'office' ? {
      ...(requirement.commercialActivity !== undefined ? { commercialActivity: requirement.commercialActivity } : {}),
      ...(requirement.floorNumber !== undefined ? { floorNumber: requirement.floorNumber } : {}),
    } : {}),
    ...(requirement.purpose === 'rent' && (requirement.propertyType === 'apartment'
      || requirement.propertyType === 'house' || requirement.propertyType === 'villa'
      || requirement.propertyType === 'chalet'
      || (requirement.propertyType === 'floor' && inferredFloorUse === 'residential')) ? {
      ...(requirement.bedroomsMinimum !== undefined ? { bedroomsMinimum: requirement.bedroomsMinimum } : {}),
      ...(requirement.bathroomsMinimum !== undefined ? { bathroomsMinimum: requirement.bathroomsMinimum } : {}),
      ...(requirement.occupancy !== undefined ? { occupancy: requirement.occupancy } : {}),
      ...(requirement.swimmingPool === true ? { swimmingPool: true } : {}),
      ...(requirement.gym === true ? { gym: true } : {}),
      ...(requirement.seaView === true ? { seaView: true } : {}),
      ...(requirement.centralAC === true ? { centralAC: true } : {}),
    } : {}),
  };
}
