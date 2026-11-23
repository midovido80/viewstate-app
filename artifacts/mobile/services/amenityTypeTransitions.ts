import {
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  type FloorUse,
  type PropertyDetailField,
  type PropertyType,
  type ResidentialAmenity,
} from '@workspace/property-domain';

export type DraftFieldValues = Partial<Record<PropertyDetailField, string>>;

export interface FloorTransitionProposal {
  readonly kind: 'floor_use';
  readonly scopeKey: string;
  readonly from: FloorUse;
  readonly to: FloorUse;
  readonly sourceSnapshot: string;
  readonly affected: readonly { readonly field: PropertyDetailField; readonly value: string }[];
}

export interface RequirementTransitionProposal {
  readonly kind: 'requirement_type';
  readonly scopeKey: string;
  readonly from: PropertyType;
  readonly to: PropertyType;
  readonly sourceSnapshot: string;
  readonly affected: readonly ResidentialAmenity[];
}

export function isDetailFieldApplicable(
  field: PropertyDetailField,
  propertyType: PropertyType,
  floorUse?: FloorUse,
): boolean {
  const definition = PROPERTY_DETAIL_FIELD_DEFINITIONS.find(item => item.field === field);
  return !!definition
    && definition.appliesTo.includes(propertyType)
    && (propertyType !== 'floor' || !definition.floorUses || definition.floorUses.includes(floorUse!));
}

export function floorTransitionSnapshot(fields: DraftFieldValues): string {
  return JSON.stringify(fields);
}

export function createFloorTransitionProposal(
  scopeKey: string,
  fields: DraftFieldValues,
  to: FloorUse,
): FloorTransitionProposal | null {
  const from = fields.floorUse as FloorUse | undefined;
  if (!from || from === to) return null;
  const affected = PROPERTY_DETAIL_FIELD_DEFINITIONS
    .filter(definition =>
      definition.field !== 'floorUse'
      && isDetailFieldApplicable(definition.field, 'floor', from)
      && !isDetailFieldApplicable(definition.field, 'floor', to)
      && fields[definition.field] !== undefined
      && fields[definition.field] !== '')
    .map(definition => ({ field: definition.field, value: fields[definition.field]! }));
  return { kind: 'floor_use', scopeKey, from, to, sourceSnapshot: floorTransitionSnapshot(fields), affected };
}

export function applyFloorTransition(
  currentScopeKey: string,
  fields: DraftFieldValues,
  proposal: FloorTransitionProposal,
): DraftFieldValues | null {
  if (proposal.scopeKey !== currentScopeKey || proposal.sourceSnapshot !== floorTransitionSnapshot(fields)) return null;
  const next = { ...fields, floorUse: proposal.to };
  for (const item of proposal.affected) delete next[item.field];
  return next;
}

export function supportsRequirementAmenities(propertyType: PropertyType): boolean {
  return ['apartment', 'house', 'villa', 'chalet'].includes(propertyType);
}

export function requirementTransitionSnapshot(
  propertyType: PropertyType,
  preferredAmenities: readonly ResidentialAmenity[] | undefined,
): string {
  return JSON.stringify({ propertyType, preferredAmenities });
}

export function createRequirementTransitionProposal(
  scopeKey: string,
  propertyType: PropertyType,
  preferredAmenities: readonly ResidentialAmenity[] | undefined,
  to: PropertyType,
): RequirementTransitionProposal | null {
  if (propertyType === to || supportsRequirementAmenities(to) || !preferredAmenities?.length) return null;
  return {
    kind: 'requirement_type',
    scopeKey,
    from: propertyType,
    to,
    sourceSnapshot: requirementTransitionSnapshot(propertyType, preferredAmenities),
    affected: [...preferredAmenities],
  };
}

export function applyRequirementTransition(
  currentScopeKey: string,
  propertyType: PropertyType,
  preferredAmenities: readonly ResidentialAmenity[] | undefined,
  proposal: RequirementTransitionProposal,
): { propertyType: PropertyType; preferredAmenities: undefined } | null {
  if (
    proposal.scopeKey !== currentScopeKey
    || proposal.sourceSnapshot !== requirementTransitionSnapshot(propertyType, preferredAmenities)
  ) return null;
  return { propertyType: proposal.to, preferredAmenities: undefined };
}