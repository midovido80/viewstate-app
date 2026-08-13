# ViewState AI Skill — Properties

**Read this before implementing any property functionality in ViewState.**

---

## What Is a Property in ViewState?

A property is a real estate listing entered by a broker. It represents a unit or plot that is available for sale or rent. Properties are the supply side of the marketplace.

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
  type: PropertyType;       // 'apartment' | 'villa' | 'office' | 'land' | 'shop'
  purpose: PropertyPurpose; // 'sale' | 'rent'
  price: number;
  currency: string;         // default 'EGP'
  area_sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  total_floors: number | null;
  governorate: string | null;
  district: string | null;
  address_ar: string | null;
  address_en: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
```

---

## Egyptian Governorates (required list)

The app must have a fixed list of Egypt's 27 governorates in Arabic and English. This list is hardcoded — not fetched from an API.

```typescript
const GOVERNORATES = [
  { id: 'cairo', ar: 'القاهرة', en: 'Cairo' },
  { id: 'giza', ar: 'الجيزة', en: 'Giza' },
  { id: 'alexandria', ar: 'الإسكندرية', en: 'Alexandria' },
  { id: 'dakahlia', ar: 'الدقهلية', en: 'Dakahlia' },
  { id: 'red_sea', ar: 'البحر الأحمر', en: 'Red Sea' },
  { id: 'beheira', ar: 'البحيرة', en: 'Beheira' },
  { id: 'fayoum', ar: 'الفيوم', en: 'Fayoum' },
  { id: 'gharbiya', ar: 'الغربية', en: 'Gharbiya' },
  { id: 'ismailia', ar: 'الإسماعيلية', en: 'Ismailia' },
  { id: 'menofia', ar: 'المنوفية', en: 'Menofia' },
  { id: 'minya', ar: 'المنيا', en: 'Minya' },
  { id: 'qalyubia', ar: 'القليوبية', en: 'Qalyubia' },
  { id: 'new_valley', ar: 'الوادي الجديد', en: 'New Valley' },
  { id: 'north_sinai', ar: 'شمال سيناء', en: 'North Sinai' },
  { id: 'port_said', ar: 'بور سعيد', en: 'Port Said' },
  { id: 'damietta', ar: 'دمياط', en: 'Damietta' },
  { id: 'sharkia', ar: 'الشرقية', en: 'Sharkia' },
  { id: 'south_sinai', ar: 'جنوب سيناء', en: 'South Sinai' },
  { id: 'kafr_el_sheikh', ar: 'كفر الشيخ', en: 'Kafr el-Sheikh' },
  { id: 'matruh', ar: 'مطروح', en: 'Matruh' },
  { id: 'luxor', ar: 'الأقصر', en: 'Luxor' },
  { id: 'qena', ar: 'قنا', en: 'Qena' },
  { id: 'aswan', ar: 'أسوان', en: 'Aswan' },
  { id: 'assiut', ar: 'أسيوط', en: 'Assiut' },
  { id: 'beni_suef', ar: 'بني سويف', en: 'Beni Suef' },
  { id: 'suez', ar: 'السويس', en: 'Suez' },
  { id: 'sohag', ar: 'سوهاج', en: 'Sohag' },
] as const;
```

---

## Property Validation Rules

| Field | Required? | Validation |
|-------|-----------|-----------|
| type | Yes | Must be one of 5 types |
| purpose | Yes | 'sale' or 'rent' |
| price | Yes | > 0 |
| currency | Yes | 'EGP' default |
| title_ar OR title_en | At least one | Not both empty |
| governorate | Yes | Must be from the governorates list |
| area_sqm | No | > 0 if provided |
| bedrooms | No | 0–20 if provided |
| floor | No | -5 to 200 if provided |

---

## Property List Behavior

- Default sort: `created_at DESC` (newest first)
- Active properties only shown by default (filter `is_active = true`)
- Broker sees only their own properties
- Search: filter by governorate, type, purpose, price range
- Pagination: cursor-based using `id`

## Property Card Component

A property card in a list shows:
- Type icon (Arabic label)
- Title (Arabic preferred, English fallback)
- Price formatted: `٢,٥٠٠,٠٠٠ ج.م` (Arabic numerals for Arabic locale)
- Area in m²
- Governorate / District
- Bedrooms (if applicable — not for land/office)
- `is_active` badge (shown/hidden toggle)
- Match count badge (how many matches this property has)

---

## Price Formatting

```typescript
function formatPrice(amount: number, currency: string, locale: 'ar' | 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
// ar: ٢٬٥٠٠٬٠٠٠ ج.م.‏
// en: EGP 2,500,000
```
