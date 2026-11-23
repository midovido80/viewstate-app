import test from "node:test";
import assert from "node:assert/strict";
import "./platformModuleStubs";
import type { Property } from "@workspace/property-domain";
import {
  propertyCardHeading,
  propertyCardSpecifications,
  propertyOfferStatus,
} from "../services/propertyVisualPresentation";

const property: Property = {
  core: { id: "p", propertyType: "apartment", locationArea: { id: "salmiya" } },
  activeOffer: {
    id: "o",
    propertyCoreId: "p",
    transaction: "rent",
    rentalPrice: { amount: 350, currencyCode: "KWD" },
    rentalPeriodId: "monthly",
  },
  listingTitle: "  شقة بإطلالة بحرية  ",
  typeDetails: {
    propertyType: "apartment",
    bedroomCount: 2,
    livingRoomCount: 1,
    bathroomCount: 2,
  },
};

test("property cards lead with the entered title and keep a type fallback for old records", () => {
  assert.equal(propertyCardHeading(property, "شقة"), "شقة بإطلالة بحرية");
  assert.equal(
    propertyCardHeading({ ...property, listingTitle: "  " }, "شقة"),
    "شقة",
  );
});

test("property cards summarize known rooms and halls without inventing missing facts", () => {
  assert.equal(propertyCardSpecifications(property, "ar"), "غرفتين وصالة");
  assert.equal(
    propertyCardSpecifications(
      {
        ...property,
        typeDetails: { propertyType: "apartment", bedroomCount: 3 },
      },
      "ar",
    ),
    "3 غرف",
  );
  assert.equal(
    propertyCardSpecifications({ ...property, typeDetails: undefined }, "ar"),
    "",
  );
  assert.equal(
    propertyCardSpecifications(property, "en"),
    "2 bedrooms · 1 living room",
  );
});

test("commercial cards show applicable facts and never invented residential rooms", () => {
  const shop: Property = {
    ...property,
    core: { ...property.core, propertyType: "shop" },
    typeDetails: { propertyType: "shop", builtUpAreaSquareMeters: 40 },
  };
  assert.equal(propertyCardSpecifications(shop, "ar"), "40 م²");
});

test("offer badges keep the full transaction and preserve paused, rented and sold states", () => {
  assert.equal(propertyOfferStatus(property, "ar").label, "معروض للإيجار");
  const sale: Property = {
    ...property,
    activeOffer: {
      id: "s",
      propertyCoreId: "p",
      transaction: "sale",
      salePrice: { amount: 90000, currencyCode: "KWD" },
    },
  };
  assert.equal(propertyOfferStatus(sale, "ar").label, "معروض للبيع");
  assert.equal(
    propertyOfferStatus({ ...property, rentalAvailability: "rented" }, "ar")
      .label,
    "مؤجر",
  );
  assert.equal(
    propertyOfferStatus({ ...sale, marketingStatus: "sold" }, "ar").label,
    "مباع",
  );
});
