# ViewState AI Skill — Properties

**Read this before implementing any property functionality in ViewState.**

---

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
  price: number;
  currency: string;           // market-configurable default — see market config
  area_sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  total_floors: number | null;
  location_area: string | null;  // market-configurable location (see Location Taxonomy below)
  district: string | null;
  address_ar: string | null;
  address_en: string | null;
  lat: number | null;
  lng: number | null;
  classification: Classification | null;  // optional status tag — see Classification System
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

type PropertyType    = 'apartment' | 'villa' | 'office' | 'land' | 'shop';
type PropertyPurpose = 'sale' | 'rent';
type Classification  = 'follow_up' | 'important' | 'pending' | 'closed';
```

---

## Location Taxonomy — Market-Configurable

**Governance rule:** Country-specific administrative terms (governorates, emirates, regions, municipalities, etc.) are NOT hard-coded into the product. The `location_area` field is populated from a market-specific configuration list loaded at runtime.

**Implementation rules:**
- Location options are loaded from market configuration, not from a hardcoded array in product code
- The GCC is the first deployment market — the exact location list for each GCC market is defined in the market configuration stage, not here
- The field name in the UI adapts to the market label (e.g., "Emirate", "Region", "Governorate") — resolved from the market configuration
- The data column is named `location_area` throughout to remain market-neutral

**Implementation pattern (illustrative — exact config source decided in Integration stage):**
```typescript
// Location options are loaded from market config, not hardcoded
const locationOptions = useMarketConfig().locationAreas;
// e.g., [{ id: 'dubai', ar: 'دبي', en: 'Dubai' }, ...]
```

---

## Property Validation Rules

| Field | Required for basic capture? | Notes |
|-------|------------------------------|-------|
| type | Yes | Must be one of 5 types |
| purpose | Yes | 'sale' or 'rent' |
| price | Yes | > 0 |
| currency | Yes | From market configuration |
| title_ar OR title_en | At least one | Not both empty |
| location_area | No (recommended) | From market-configurable list |
| area_sqm | No | > 0 if provided |
| bedrooms | No | 0–20 if provided |
| floor | No | -5 to 200 if provided |
| classification | No | Optional status tag only |

**Capture First rule:** type + purpose + price + at least one title = a valid, saveable property record. All other fields are optional enrichment.

---

## Property List Behavior

- Default sort: `created_at DESC` (newest first)
- Active properties only shown by default (filter `is_active = true`)
- Broker sees only their own properties
- Filter options: location area, type, purpose, price range, classification
- Pagination: cursor-based using `id`

---

## Property Card Component

A property card in a list shows:
- Type icon (Arabic label)
- Title (Arabic preferred, English fallback)
- Price formatted per market locale (see Price Formatting below)
- Area in m²
- Location area / District
- Bedrooms (if applicable — not for land/office)
- `is_active` badge (shown/hidden toggle)
- Classification label badge (if set — Follow Up / Important / Pending / Closed Deal)
- Match count badge (how many matches this property has)

---

## Classification Display

When a property has a classification set, display the label visibly next to the property title in list and detail views.

| Classification value | Display (EN) | Display (AR) |
|---------------------|-------------|-------------|
| `follow_up` | Follow Up | متابعة |
| `important` | Important | مهم |
| `pending` | Pending | معلق |
| `closed` | Closed Deal | تمت الصفقة |

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
