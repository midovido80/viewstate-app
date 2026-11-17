import {
  APARTMENT_SUBTYPES,
  PROPERTY_TYPES,
  type ApartmentSubtype,
  type FloorUse,
  type PropertyType,
  type Transaction,
} from '@workspace/property-domain';

export type PropertyFormMode = 'offered' | 'wanted';
export type PropertyFormSubtype = ApartmentSubtype | 'standard';

export interface PropertyFormSelection {
  readonly mode: PropertyFormMode;
  readonly transaction?: Transaction;
  readonly propertyType: PropertyType;
  readonly apartmentSubtype?: PropertyFormSubtype;
  readonly floorUse?: FloorUse;
  readonly seekerId?: string;
  readonly linkPersonId?: string;
  readonly sourceRole?: string;
}

export type PropertyFormRoute =
  | {
    readonly kind: 'apartment-subtype';
    readonly pathname: '/capture/apartment-subtype';
    readonly params: Readonly<Record<string, string>>;
  }
  | {
    readonly kind: 'studio';
    readonly pathname: '/capture/studio';
    readonly params: Readonly<Record<string, string>>;
  }
  | {
    readonly kind: 'wanted';
    readonly pathname: '/requirement/new';
    readonly params: Readonly<Record<string, string>>;
  }
  | {
    readonly kind: 'floor';
    readonly pathname: '/capture';
    readonly params: Readonly<Record<string, string>>;
  }
  | {
    readonly kind: 'offered';
    readonly pathname: '/capture/price';
    readonly params: Readonly<Record<string, string>>;
  };

function getSelectionParams(selection: PropertyFormSelection): Record<string, string> {
  const params: Record<string, string> = {
    mode: selection.mode,
    propertyType: selection.propertyType,
  };
  if (selection.propertyType === 'floor' && selection.floorUse) params.floorUse = selection.floorUse;
  if (selection.transaction) params.transaction = selection.transaction;
  if (selection.seekerId) params.seekerId = selection.seekerId;
  if (selection.linkPersonId) params.linkPersonId = selection.linkPersonId;
  if (selection.sourceRole) params.sourceRole = selection.sourceRole;
  return params;
}

function canonicalSubtype(subtype?: PropertyFormSubtype): ApartmentSubtype | undefined {
  if (subtype === undefined) return undefined;
  if (subtype === 'standard') return 'standard_apartment';
  if (APARTMENT_SUBTYPES.includes(subtype as ApartmentSubtype)) return subtype as ApartmentSubtype;
  throw new Error('UNSUPPORTED_APARTMENT_SUBTYPE');
}

/** The single catalog-backed selector for create and legacy/deep-link form routing. */
export function getPropertyFormRoute(selection: PropertyFormSelection): PropertyFormRoute {
  const params = getSelectionParams(selection);
  const subtype = selection.propertyType === 'apartment'
    ? canonicalSubtype(selection.apartmentSubtype)
    : undefined;

  if (selection.propertyType === 'apartment' && subtype === undefined) {
    return { kind: 'apartment-subtype', pathname: '/capture/apartment-subtype', params };
  }
  if (selection.propertyType === 'apartment' && subtype === 'studio') {
    return {
      kind: 'studio',
      pathname: '/capture/studio',
      params: { ...params, apartmentSubtype: 'studio' },
    };
  }
  if (selection.mode === 'wanted') {
    return {
      kind: 'wanted',
      pathname: '/requirement/new',
      params: {
        ...params,
        ...(selection.transaction ? { purpose: selection.transaction === 'sale' ? 'buy' : 'rent' } : {}),
        ...(subtype ? { apartmentSubtype: subtype === 'standard_apartment' ? 'standard' : subtype } : {}),
      },
    };
  }
  if (selection.propertyType === 'floor') {
    return { kind: 'floor', pathname: '/capture', params };
  }
  return {
    kind: 'offered',
    pathname: '/capture/price',
    params: {
      ...params,
      ...(subtype ? { apartmentSubtype: subtype === 'standard_apartment' ? 'standard' : subtype } : {}),
    },
  };
}

export function getPropertyTypeSelectionRoute(
  context: Pick<PropertyFormSelection, 'mode' | 'transaction' | 'seekerId' | 'linkPersonId' | 'sourceRole'>,
) {
  const params: Record<string, string> = { mode: context.mode };
  if (context.transaction) params.transaction = context.transaction;
  if (context.seekerId) params.seekerId = context.seekerId;
  if (context.linkPersonId) params.linkPersonId = context.linkPersonId;
  if (context.sourceRole) params.sourceRole = context.sourceRole;
  return { pathname: '/capture/property-type' as const, params };
}

export function getPropertyEditFormHref(
  propertyCoreId: string,
  propertyType: PropertyType,
  apartmentSubtype?: PropertyFormSubtype,
): string {
  const subtype = propertyType === 'apartment' ? canonicalSubtype(apartmentSubtype) : undefined;
  return propertyType === 'apartment' && subtype === 'studio'
    ? `/capture/studio?editPropertyId=${encodeURIComponent(propertyCoreId)}`
    : `/property/${encodeURIComponent(propertyCoreId)}/edit`;
}

export function getRequirementEditFormTarget(
  requirementId: string,
  seekerId: string,
  studio: boolean,
  hydratable: boolean,
): { readonly kind: 'studio'; readonly href: string } | { readonly kind: 'blocked' } | { readonly kind: 'generic'; readonly href: string } {
  if (studio) {
    return hydratable
      ? { kind: 'studio', href: `/capture/studio?editRequirementId=${encodeURIComponent(requirementId)}` }
      : { kind: 'blocked' };
  }
  return {
    kind: 'generic',
    href: `/requirement/${encodeURIComponent(requirementId)}?seekerId=${encodeURIComponent(seekerId)}&edit=1`,
  };
}

/** Stable order for route-matrix tests and catalog-driven callers. */
export function getSupportedPropertyFormSelections(): readonly PropertyFormSelection[] {
  const entries: PropertyFormSelection[] = [];
  for (const mode of ['offered', 'wanted'] as const) {
    for (const transaction of ['sale', 'rent'] as const) {
      for (const propertyType of PROPERTY_TYPES) {
        if (propertyType === 'apartment') {
          for (const apartmentSubtype of APARTMENT_SUBTYPES) {
            entries.push({ mode, transaction, propertyType, apartmentSubtype });
          }
        } else {
          entries.push({ mode, transaction, propertyType });
        }
      }
    }
  }
  return entries;
}
