import type {
  ClassifiedLiteralText,
  LocationAreaReference,
  Offer,
  PriceValue,
  PrivacyClassification,
  PrivacyMetadata,
  Property,
  PropertyCore,
  RentOffer,
  SaleOffer,
  TypeDetails,
  ValidationResult,
} from "./types.ts";
import {
  invalid,
  issue,
  valid,
  validateOffer,
  validatePrice,
  validateProperty,
  validatePropertyCore,
  validateRequiredIdentifier,
  validateTypeDetails,
} from "./validation.ts";

export function createPrivacyMetadata(
  classification: PrivacyClassification,
  shareableProjectionEligible: boolean,
): PrivacyMetadata {
  return { classification, shareableProjectionEligible };
}

export function createLiteralText(
  value: string,
  privacy: PrivacyMetadata,
): ClassifiedLiteralText {
  return { value, privacy };
}

export function createLocationAreaReference(
  id: string,
): ValidationResult<LocationAreaReference> {
  const issues = validateRequiredIdentifier(id, ["id"]);
  return issues.length === 0 ? valid({ id }) : invalid(issues);
}

export function createPriceValue(
  amount: number,
  currencyCode: string,
): ValidationResult<PriceValue> {
  const price = { amount, currencyCode };
  const issues = validatePrice(price, []);
  return issues.length === 0 ? valid(price) : invalid(issues);
}

export function createPropertyCore(
  core: PropertyCore,
): ValidationResult<PropertyCore> {
  return validatePropertyCore(core);
}

export function createTypeDetails(
  details: TypeDetails,
  core: PropertyCore,
): ValidationResult<TypeDetails> {
  return validateTypeDetails(details, core);
}

export function createSaleOffer(
  offer: SaleOffer,
): ValidationResult<SaleOffer> {
  const result = validateOffer(offer);
  return result.ok ? valid(offer) : invalid(result.issues);
}

export function createRentOffer(
  offer: RentOffer,
): ValidationResult<RentOffer> {
  const result = validateOffer(offer);
  return result.ok ? valid(offer) : invalid(result.issues);
}

export function createOffer(offer: Offer): ValidationResult<Offer> {
  return validateOffer(offer);
}

export function createProperty(
  core: PropertyCore,
  activeOffer: Offer,
  typeDetails?: TypeDetails,
): ValidationResult<Property> {
  if (typeDetails !== undefined && typeDetails.propertyType !== core.propertyType) {
    return invalid([
      issue(
        "type_details_mismatch",
        ["typeDetails", "propertyType"],
        "Type details must match Property Core.",
      ),
    ]);
  }

  return validateProperty({
    core,
    activeOffer,
    ...(typeDetails === undefined ? {} : { typeDetails }),
  });
}