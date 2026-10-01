import type { PropertyDetailField, PropertyType } from '@workspace/property-domain';
import {
  PropertyEnrichmentFields,
  type EnrichmentFieldValues,
} from '@/components/PropertyEnrichmentFields';

/**
 * The production field surface shared by capture and edit. Persistence is
 * deliberately owned by each caller; this component only owns the field
 * definitions, controls, Quick Picks, validation callbacks, and semantics.
 */
export function ModernPropertyFields({
  recordScopeKey,
  propertyType,
  values,
  onChange,
  onInvalidQuickPickChange,
  amenityRenderExtra,
  requireExactValue = false,
  hideFloorUse = false,
  hideApartmentSubtype = false,
}: {
  recordScopeKey: string;
  propertyType: PropertyType;
  values: EnrichmentFieldValues;
  onChange: (field: PropertyDetailField, value: string) => void;
  onInvalidQuickPickChange?: (field: PropertyDetailField, scopeKey: string, invalid: boolean) => void;
  amenityRenderExtra?: React.ReactNode;
  requireExactValue?: boolean;
  hideFloorUse?: boolean;
  hideApartmentSubtype?: boolean;
}) {
  return (
    <PropertyEnrichmentFields
      recordScopeKey={recordScopeKey}
      propertyType={propertyType}
      values={values}
      onChange={onChange}
      onInvalidQuickPickChange={onInvalidQuickPickChange}
      amenityRenderExtra={amenityRenderExtra}
      requireExactValue={requireExactValue}
      hideFloorUse={hideFloorUse}
      hideApartmentSubtype={hideApartmentSubtype}
    />
  );
}
