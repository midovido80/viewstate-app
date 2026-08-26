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

export interface PrivacyMetadata {
  readonly classification: PrivacyClassification;
  readonly shareableProjectionEligible: boolean;
}

export interface ClassifiedLiteralText {
  readonly value: string;
  readonly privacy: PrivacyMetadata;
}

export interface ApartmentTypeDetails {
  readonly propertyType: "apartment";
  readonly apartmentSubtype?: ApartmentSubtype;
}

export interface OtherBuiltPropertyTypeDetails {
  readonly propertyType: "other_built_property";
  readonly clarification?: ClassifiedLiteralText;
}

export interface StandardTypeDetails {
  readonly propertyType: Exclude<
    PropertyType,
    "apartment" | "other_built_property"
  >;
}

export type TypeDetails =
  | ApartmentTypeDetails
  | OtherBuiltPropertyTypeDetails
  | StandardTypeDetails;

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

export interface Property {
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
  | "incompatible_apartment_subtype"
  | "invalid_transaction"
  | "invalid_price"
  | "invalid_currency_code"
  | "invalid_privacy_classification"
  | "invalid_shareable_eligibility"
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