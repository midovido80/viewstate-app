# ViewState AI Skill — Properties

**Read this before implementing any property functionality in ViewState.**

---

## Current Property Workflow Contract

Property workflow is property-first. Rental Price and Sale Price are separate concepts. The approved future Stage 01 analysis may assess transaction-first Sale and Rent capture of the exact offered built property or independently offered unit, with relevant fields only, quick save, and optional enrichment later. It does not approve a final taxonomy, Property/Offer/Unit model, parent relationship, schema, UI, or implementation. Land remains a separately analyzed, approved, and frozen later V001 workflow. Property Import is Draft-first, Safe Share is one Property at a time and Preview-first, and owner/source/private Notes/linked Seeker information are private by default. Kuwait location uses Governorate and Area; PACI and exact location are optional, user-correctable, and never block save.


## What Is a Property in ViewState?

A property is a real estate listing entered by a broker. It represents a unit or plot that is available for sale or rent. Properties are the supply side of the matching engine.

---

## Property Data Model

The following is non-final planning guidance only. It is not an approved final schema, taxonomy, Property/Offer/Unit model, parent relationship, or Stage 01 implementation contract. See `DATABASE_RULES.md` for the governing boundary.

```typescript
interface Property {
  id: string;
  broker_id: string;
  title_ar: string | null;
  title_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  type: PropertyType;         // 'apartment' | 'villa' | 'office' | 'land' | 'shop'
  purpose: PropertyPurpose;   // 'sale' | 'rent'
  rentalPrice?: number
  salePrice?: number;
  currency: string;           // market-configurable — exact default deferred to Database stage
  area_sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  total_floors: number | null;
  // location field: market-configurable concept (emirate/region/etc.) — field name and type deferred to Database stage
  district: string | null;
  address_ar: string | null;
  address_en: string | null;
  lat: number | null;
  lng: number | null;
  // classification field: 4-label optional status tag — field name, type, and constraints deferred to Database stage
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

type PropertyType    = 'apartment' | 'villa' | 'office' | 'land' | 'shop'; // pre-amendment planning example only; not the final Stage 01 taxonomy
type PropertyPurpose = 'sale' | 'rent';
// Classification type alias: deferred to Database stage — values will be Follow Up / Important / Pending / Order Complete / Closed Deal
```

---

## Location Taxonomy — Market-Configurable

**Governance rule (product level):** Country-specific administrative terms (governorates, emirates, regions, municipalities, etc.) are NOT hard-coded into the product. Location options are loaded from market configuration per deployment — not from a hardcoded list.

**Product-level rules:**
- **Kuwait is the first operational/deployment market** — Kuwait area taxonomy is the first concrete market configuration to be defined
- GCC is the planned expansion region; each GCC market provides its own location taxonomy via market configuration
- The UI label for the location field adapts to the market (e.g., "Area", "Region", "District") — resolved from market configuration
- No single country's administrative structure is assumed as the universal default; Kuwait-first is an operational decision, not a core product constraint

**Product-level consequence for V001:**
Property and location workflows must be capable of supporting a Kuwait-first market configuration in which the broker can select from Kuwait areas when entering property data. The complete list of Kuwait areas, how it is sourced, grouped, and stored is deferred to the Market Configuration / Property / Database stage.

**Deferred to later stages:**
- Complete Kuwait area taxonomy (names, groupings, IDs) → Market Configuration stage
- Exact database column name and type for the location field → Database stage
- Market configuration layer design (how it loads, what it exposes) → Architecture stage
- Additional GCC market location taxonomies → respective Market Configuration stages

---

## Property Validation Rules

**Authoritative BASIC Property capture (DEC-022):**

| Field | Required for BASIC capture? | Notes |
|-------|------------------------------|-------|
| Property Type | Yes | Final taxonomy remains unresolved for Stage 01 analysis |
| Purpose | Yes | Sale or Rent |
| Price | Yes | Rental Price and Sale Price remain separate concepts; no persisted price model is approved here |
| Market-configured Location Area | Yes | Kuwait uses Governorate and Area; exact representation remains unresolved |
| Title | No | Not a required BASIC Property field |

No fifth BASIC field is created by this amendment. Other fields are optional enrichment or remain unresolved for the separately Founder-authorized Stage 01 Impact Analysis.

The existing five-type list is non-final planning guidance. Additional built-property types may be identified during Stage 01 analysis. Whether a user-selectable Other type exists remains an unresolved Stage 01 Founder decision. Land remains a separate later V001 workflow.

---

## Property List Behavior

- Default sort: `created_at DESC` (newest first)
- Active properties only shown by default (filter `is_active = true`)
- Broker sees only their own properties
- Filter options: location area (market-configurable), type, purpose, price range, classification label
- Pagination: cursor-based using `id`

---

## Property Card Component

A property card in a list shows:
- Type icon (Arabic label)
- Title (Arabic preferred, English fallback)
- Price formatted per market locale (see Price Formatting below)
- Area in m²
- Location area / District (label adapts to market)
- Bedrooms (if applicable — not for land/office)
- `is_active` badge (shown/hidden toggle)
- Classification label badge if set — one of: Follow Up / Important / Pending / Order Complete / Closed Deal (persistence field name TBD Database stage)
- Match count badge (how many matches this property has)

---

## Classification Display (Product Behavior)

When a property has a classification label set, display it visibly next to the property title in list and detail views. The four approved labels:

| Label (EN) | Label (AR) |
|------------|------------|
| Follow Up | متابعة |
| Important | مهم |
| Pending | معلق |
| Order Complete / Closed Deal | تمت الصفقة |

Persistence field name, type, and constraint representation are deferred to the Database stage.

---

## Price Formatting

Currency and locale are market-configurable. Use `Intl.NumberFormat` with the active market locale and currency code.

```typescript
function formatPrice(amount: number, currency: string, locale: 'ar' | 'en'): string {
  // locale tag is resolved from market config (e.g., 'ar-AE', 'ar-SA', 'ar-KW')
  const localeTag = locale === 'ar'
    ? getMarketConfig().arabicLocaleTag   // e.g., 'ar-AE'
    : getMarketConfig().englishLocaleTag; // e.g., 'en-AE'

  return new Intl.NumberFormat(localeTag, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
```


---
