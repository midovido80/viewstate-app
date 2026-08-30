export type PropertyType =
  | "whole_building"
  | "commercial_complex"
  | "apartment"
  | "floor"
  | "house"
  | "villa"
  | "office"
  | "shop"
  | "warehouse"
  | "chalet"
  | "other_built_property";

export type ApartmentSubtype =
  | "studio"
  | "standard_apartment"
  | "duplex";

export type FloorUse = "residential" | "commercial";
export type Furnishing = "unfurnished" | "semi_furnished" | "furnished";

export type Transaction = "sale" | "rent";

export type PropertyCoreId = string;
export type OfferId = string;
export type LocationAreaId = string;
export type RentalPeriodId = string;

export interface LocationAreaReference {
  readonly id: LocationAreaId;
}

export interface PriceValue {
  readonly amount: number;
  readonly currencyCode: string;
}

export type PrivacyClassification =
  | "normal"
  | "private_notes"
  | "owner_source"
  | "exact_location";

export type ShareDisclosurePolicy =
  | "normal"
  | "explicit_per_share"
  | "never";

export interface PrivacyMetadata {
  readonly classification: PrivacyClassification;
  readonly disclosurePolicy: ShareDisclosurePolicy;
}

export interface ClassifiedLiteralText {
  readonly value: string;
  readonly privacy: PrivacyMetadata;
}

/**
 * Physical facts shared by built properties. Values are optional so an
 * existing BASIC-only record remains a complete Property.
 */
export interface WholeBuildingTypeDetails {
  readonly propertyType: "whole_building";
  readonly plotAreaSquareMeters?: number;
  readonly builtUpAreaSquareMeters?: number;
  readonly floorCount?: number;
  readonly unitCount?: number;
  readonly apartmentCount?: number;
  readonly shopCount?: number;
  readonly officeCount?: number;
  readonly elevatorCount?: number;
  readonly parkingSpaceCount?: number;
}

export interface CommercialComplexTypeDetails {
  readonly propertyType: "commercial_complex";
  readonly plotAreaSquareMeters?: number;
  readonly builtUpAreaSquareMeters?: number;
  readonly floorCount?: number;
  readonly unitCount?: number;
  readonly apartmentCount?: number;
  readonly shopCount?: number;
  readonly officeCount?: number;
  readonly elevatorCount?: number;
  readonly parkingSpaceCount?: number;
}

export interface ApartmentTypeDetails {
  readonly propertyType: "apartment";
  readonly builtUpAreaSquareMeters?: number;
  readonly apartmentSubtype?: ApartmentSubtype;
  readonly bedroomCount?: number;
  readonly bathroomCount?: number;
  readonly livingRoomCount?: number;
  readonly floorNumber?: number;
  readonly furnishing?: Furnishing;
  readonly hasMaidRoom?: boolean;
  readonly parkingSpaceCount?: number;
}

export interface EmptyFloorTypeDetails {
  readonly propertyType: "floor";
  readonly floorUse?: undefined;
}

export interface ResidentialFloorTypeDetails {
  readonly propertyType: "floor";
  readonly floorUse: "residential";
  readonly builtUpAreaSquareMeters?: number;
  readonly bedroomCount?: number;
  readonly bathroomCount?: number;
  readonly livingRoomCount?: number;
  readonly floorNumber?: number;
  readonly furnishing?: Furnishing;
  readonly hasMaidRoom?: boolean;
  readonly parkingSpaceCount?: number;
}

export interface CommercialFloorTypeDetails {
  readonly propertyType: "floor";
  readonly floorUse: "commercial";
  readonly builtUpAreaSquareMeters?: number;
  readonly bathroomCount?: number;
  readonly floorNumber?: number;
  readonly intendedUse?: ClassifiedLiteralText;
  readonly commercialActivity?: ClassifiedLiteralText;
  readonly parkingSpaceCount?: number;
  readonly frontageWidthMeters?: number;
  readonly ceilingHeightMeters?: number;
}

export type FloorTypeDetails =
  | EmptyFloorTypeDetails
  | ResidentialFloorTypeDetails
  | CommercialFloorTypeDetails;

export interface HouseTypeDetails {
  readonly propertyType: "house";
  readonly plotAreaSquareMeters?: number;
  readonly builtUpAreaSquareMeters?: number;
  readonly bedroomCount?: number;
  readonly bathroomCount?: number;
  readonly livingRoomCount?: number;
  readonly floorCount?: number;
  readonly furnishing?: Furnishing;
  readonly hasMaidRoom?: boolean;
  readonly parkingSpaceCount?: number;
  readonly hasPool?: boolean;
}

export interface VillaTypeDetails extends Omit<HouseTypeDetails, "propertyType"> {
  readonly propertyType: "villa";
}

export interface OfficeTypeDetails {
  readonly propertyType: "office";
  readonly builtUpAreaSquareMeters?: number;
  readonly floorNumber?: number;
  readonly bathroomCount?: number;
  readonly intendedUse?: ClassifiedLiteralText;
  readonly commercialActivity?: ClassifiedLiteralText;
  readonly parkingSpaceCount?: number;
}

export interface ShopTypeDetails extends Omit<OfficeTypeDetails, "propertyType"> {
  readonly propertyType: "shop";
  readonly frontageWidthMeters?: number;
  readonly ceilingHeightMeters?: number;
}

export interface WarehouseTypeDetails {
  readonly propertyType: "warehouse";
  readonly plotAreaSquareMeters?: number;
  readonly builtUpAreaSquareMeters?: number;
  readonly bathroomCount?: number;
  readonly intendedUse?: ClassifiedLiteralText;
  readonly commercialActivity?: ClassifiedLiteralText;
  readonly parkingSpaceCount?: number;
  readonly ceilingHeightMeters?: number;
  readonly loadingBayCount?: number;
  readonly hasColdStorage?: boolean;
}

export interface ChaletTypeDetails extends Omit<HouseTypeDetails, "propertyType"> {
  readonly propertyType: "chalet";
  readonly hasWaterfront?: boolean;
}

export interface OtherBuiltPropertyTypeDetails {
  readonly propertyType: "other_built_property";
  readonly clarification: ClassifiedLiteralText;
  readonly plotAreaSquareMeters?: number;
  readonly builtUpAreaSquareMeters?: number;
  readonly parkingSpaceCount?: number;
}

/** @deprecated Prefer the concrete discriminated detail interfaces. */
export type StandardTypeDetails =
  | WholeBuildingTypeDetails
  | CommercialComplexTypeDetails
  | FloorTypeDetails
  | HouseTypeDetails
  | VillaTypeDetails
  | OfficeTypeDetails
  | ShopTypeDetails
  | WarehouseTypeDetails
  | ChaletTypeDetails;

export type TypeDetails =
  | StandardTypeDetails
  | ApartmentTypeDetails
  | OtherBuiltPropertyTypeDetails;

export interface CoordinatesMetadata {
  readonly latitude: number;
  readonly longitude: number;
  readonly privacy: PrivacyMetadata;
}

/**
 * Optional private enrichment. The approved Area reference remains the
 * canonical BASIC location and is never replaced by these values.
 */
export interface LocationEnrichmentMetadata {
  readonly paciNumber?: ClassifiedLiteralText;
  readonly manualLocationText?: ClassifiedLiteralText;
  readonly mapsLink?: ClassifiedLiteralText;
  readonly coordinates?: CoordinatesMetadata;
}

export type PropertyAttachmentKind = "image" | "video" | "pdf";
export type PropertyAttachmentId = string;

export interface PropertyAttachmentMetadata {
  readonly id: PropertyAttachmentId;
  readonly kind: PropertyAttachmentKind;
  readonly originalName: string;
  readonly mimeType: string;
  readonly order: number;
  readonly managedUri: string;
  readonly isCover?: boolean;
  readonly privacy: PrivacyMetadata;
}

export const PROPERTY_SOURCE_ROLES = [
  "owner",
  "broker",
  "real_estate_company",
  "building_guard",
] as const;

export type PropertySourceRole = typeof PROPERTY_SOURCE_ROLES[number];

/**
 * A private local relationship between one Property and one source person.
 * This is intentionally separate from shareable PropertyCore text.
 */
export interface PropertySource {
  readonly propertyCoreId: PropertyCoreId;
  readonly personId: string;
  readonly role: PropertySourceRole;
}

export interface PropertyAdditiveMetadata {
  readonly locationEnrichment?: LocationEnrichmentMetadata;
  readonly attachments?: readonly PropertyAttachmentMetadata[];
}

export interface PropertyCore {
  readonly id: PropertyCoreId;
  readonly propertyType: PropertyType;
  readonly locationArea: LocationAreaReference;
  readonly description?: ClassifiedLiteralText;
  readonly privateNotes?: ClassifiedLiteralText;
  readonly ownerSource?: ClassifiedLiteralText;
  readonly exactLocation?: ClassifiedLiteralText;
}

export interface SaleOffer {
  readonly id: OfferId;
  readonly propertyCoreId: PropertyCoreId;
  readonly transaction: "sale";
  readonly salePrice: PriceValue;
}

export interface RentOffer {
  readonly id: OfferId;
  readonly propertyCoreId: PropertyCoreId;
  readonly transaction: "rent";
  readonly rentalPrice: PriceValue;
  readonly rentalPeriodId: RentalPeriodId;
}

export type Offer = SaleOffer | RentOffer;

export interface Property extends PropertyAdditiveMetadata {
  readonly core: PropertyCore;
  readonly activeOffer: Offer;
  readonly typeDetails?: TypeDetails;
}

export interface PropertyDraft {
  readonly propertyCoreId?: PropertyCoreId;
  readonly offerId?: OfferId;
  readonly propertyType?: PropertyType;
  readonly locationAreaId?: LocationAreaId;
  readonly transaction?: Transaction;
  readonly salePrice?: PriceValue;
  readonly rentalPrice?: PriceValue;
  readonly rentalPeriodId?: RentalPeriodId;
  readonly apartmentSubtype?: ApartmentSubtype;
  readonly otherBuiltPropertyClarification?: ClassifiedLiteralText;
  readonly description?: ClassifiedLiteralText;
  readonly privateNotes?: ClassifiedLiteralText;
  readonly ownerSource?: ClassifiedLiteralText;
  readonly exactLocation?: ClassifiedLiteralText;
}

export type ValidationIssueCode =
  | "required"
  | "invalid_identifier"
  | "invalid_property_type"
  | "invalid_apartment_subtype"
  | "invalid_floor_use"
  | "invalid_furnishing"
  | "incompatible_apartment_subtype"
  | "incompatible_detail_field"
  | "invalid_physical_value"
  | "invalid_coordinates"
  | "invalid_attachment"
  | "invalid_source_role"
  | "invalid_transaction"
  | "invalid_price"
  | "invalid_currency_code"
  | "invalid_privacy_classification"
  | "invalid_disclosure_policy"
  | "legacy_purpose_not_allowed"
  | "missing_sale_price"
  | "missing_rental_price"
  | "missing_rental_period"
  | "incompatible_sale_terms"
  | "incompatible_rental_terms"
  | "property_core_mismatch"
  | "type_details_mismatch"
  | "whitespace_only";

export interface ValidationIssue {
  readonly code: ValidationIssueCode;
  readonly path: readonly string[];
  readonly message: string;
}

export type ValidationResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationIssue[];
    };