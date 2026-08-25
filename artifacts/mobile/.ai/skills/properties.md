# ViewState AI Skill — Properties

**Read this before implementing any property functionality in ViewState.**

---

## Current Property Workflow Contract

Property workflow is property-first. Rental Price and Sale Price are separate concepts. Property Import is Draft-first, Safe Share is one Property at a time and Preview-first, and owner/source/private Notes/linked Seeker information are private by default. Kuwait location uses Governorate and Area; PACI and exact location are optional, user-correctable, and never block save.


## What Is a Property in ViewState?

A property is a real estate listing entered by a broker. It represents a unit or plot that is available for sale or rent. Properties are the supply side of the matching engine.

---

## Property Data Model

See `database-rules.md` for the full schema. Key fields:

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

type PropertyType    = 'apartment' | 'villa' | 'office' | 'land' | 'shop';
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

| Field | Required for basic capture? | Notes |
|-------|------------------------------|-------|
| type | Yes | Must be one of 5 types |
| purpose | Yes | 'sale' or 'rent' |
| price | Yes | > 0 |
| currency | Yes | From market configuration |
| title_ar OR title_en | At least one | Not both empty |
| location area | No (recommended) | From market-configurable list; field name TBD Database stage |
| area_sqm | No | > 0 if provided |
| bedrooms | No | 0–20 if provided |
| floor | No | -5 to 200 if provided |
| classification label | No | Optional 4-label status tag; persistence TBD Database stage |

**Capture First rule:** type + purpose + price + at least one title = a valid, saveable property record. All other fields are optional enrichment.

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
