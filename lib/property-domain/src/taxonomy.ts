import type {
  ApartmentSubtype,
  PropertyType,
  Transaction,
} from "./types.ts";

export const PROPERTY_TYPES = [
  "whole_building",
  "commercial_complex",
  "apartment",
  "floor",
  "house",
  "villa",
  "office",
  "shop",
  "warehouse",
  "chalet",
  "other_built_property",
] as const satisfies readonly PropertyType[];

export const APARTMENT_SUBTYPES = [
  "studio",
  "standard_apartment",
  "duplex",
] as const satisfies readonly ApartmentSubtype[];

export const TRANSACTIONS = [
  "sale",
  "rent",
] as const satisfies readonly Transaction[];

export function isPropertyType(value: unknown): value is PropertyType {
  return (
    typeof value === "string" &&
    (PROPERTY_TYPES as readonly string[]).includes(value)
  );
}

export function isApartmentSubtype(
  value: unknown,
): value is ApartmentSubtype {
  return (
    typeof value === "string" &&
    (APARTMENT_SUBTYPES as readonly string[]).includes(value)
  );
}

export function isTransaction(value: unknown): value is Transaction {
  return (
    typeof value === "string" &&
    (TRANSACTIONS as readonly string[]).includes(value)
  );
}