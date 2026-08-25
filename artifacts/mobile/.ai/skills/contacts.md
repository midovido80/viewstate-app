# ViewState AI Skill — Contacts

**Read this before implementing any contacts functionality in ViewState.**

---

## V001 Contact Roles — Governance Rule 11

ViewState V001 supports **exactly four contact roles**. No others may be added without Founder approval.

| Role (EN) | Role (AR) | Who |
|-----------|-----------|-----|
| **Buyer** | مشتري | Looking to purchase a property |
| **Tenant** | مستأجر | Looking to rent a property |
| **Owner** | مالك | Has a property to sell or rent |
| **Broker** | سمسار / وسيط | A real estate agent or broker |

- A contact may hold multiple roles (e.g., Buyer + Broker)
- Only Buyer and Tenant contacts may have `BuyerRequirement` records linked
- The UI role picker must show exactly these four options — no free-text role entry

---

## Contacts in ViewState

Contacts are the people a broker knows. They are stored in the ViewState database and may be imported from:
1. The device's phone contacts (via expo-contacts)
2. WhatsApp chat exports

---

## Permission Flow

```typescript
import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';

async function requestContactsPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false; // Contacts not supported on web
  }

  const { status } = await Contacts.requestPermissionsAsync();

  if (status === 'granted') {
    return true;
  }

  // If denied, show a dialog explaining why we need it and how to enable
  // Link to Settings app — never auto-redirect
  return false;
}
```

Always handle the `denied` case with a non-blocking UI that explains what functionality is missing and offers a "Enable in Settings" button.

---

## Contact Data Shape

```typescript
// ViewState Contact (our domain object)
interface ViewStateContact {
  id: string;
  broker_id: string; // who owns this contact
  name_ar: string | null;
  name_en: string | null;
  phone: string; // normalized: +20XXXXXXXXXX
  role: 'buyer' | 'seller' | 'broker' | 'other';
  source: 'manual' | 'whatsapp_import' | 'contacts_import';
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Device contact (from expo-contacts)
interface DeviceContact {
  id: string;
  name: string | null;
  phoneNumbers: Array<{ number: string; label: string }> | null;
}
```

---

## Phone Number Normalization

All phone numbers stored in ViewState must be in E.164 format (`+[country code][number]`).

```typescript
// Phone normalization is market-configurable.
// The active market configuration provides: country code, expected digit length,
// local prefix rules, and E.164 normalization logic.
// Do NOT hardcode country-specific phone patterns here.

function normalizePhone(raw: string, marketConfig: MarketPhoneConfig): string | null {
  const digits = raw.replace(/\D/g, '');
  // Apply market-specific normalization rules from marketConfig
  // e.g., local prefix stripping, country code prepending, length validation
  return marketConfig.normalize(digits); // returns E.164 string or null
}

function isValidMobile(normalized: string, marketConfig: MarketPhoneConfig): boolean {
  // Validation pattern provided by market configuration
  return marketConfig.mobilePattern.test(normalized);
}
```

---

## Contact Import Flow

### From device contacts
1. Request permission → if denied, show Settings link
2. Load all contacts with phone numbers (`Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name] })`)
3. Filter: only contacts with at least one valid phone number (per market phone config)
4. Normalize phone numbers
5. Deduplicate: check against existing ViewState contacts by normalized phone number
6. Show preview list: "X new contacts found, Y already exist"
7. Let broker select which to import (default: all new)
8. Assign default role: `'buyer'` (broker can change later)
9. Save to API → show success count

### Deduplication rule
A contact already exists if any of their phone numbers matches an existing ViewState contact's phone number (after normalization). Do not create duplicates.

---

## Contact Permissions — Web Fallback

`expo-contacts` has no web support. On web:
- Hide "Import from Contacts" button
- Show only "Add manually" option
- No error — just silently omit the import option

---

## Contact Roles

Contacts have one of 4 roles:
- `buyer` — looking to purchase or rent
- `seller` — has a property to sell or rent (may overlap with broker)
- `broker` — a fellow agent, not a client
- `other` — anything else

Only `buyer` contacts can have `BuyerRequirement` records linked to them.

---

## Data Privacy Rules

- Contact data is private to the broker who imported it — no cross-broker visibility
- Never surface one broker's contacts to another broker
- Contact phone numbers are never shown in matches — only name and general location
- The broker explicitly assigns the role — the AI never infers roles from contact names


---

## Governance Reconciliation — Effective Rules

This addendum is authoritative for future implementation after the approved governance reconciliation. Historical Stage 00.1–00.4 wording and prior decisions remain preserved as historical evidence; where a conflict exists, the later append-only reconciliation decisions control.

- Status remains PRE-IMPLEMENTATION.
- Stage 00.5 is not defined and must not be fabricated.
- Stage 01 has not begun.
- Product implementation remains unauthorized until a bounded Stage 01 Impact Analysis is approved.
- No database migration is authorized or required by this reconciliation.
- Any role, price, Draft, or compatibility migration reference is a future schema/compatibility risk only.
- If an implemented dataset is discovered before future schema work, the relevant stage must stop for a fresh compatibility and migration assessment.
- ViewState App is one Android/iOS product. Android-first is rollout priority only; iOS architectural compatibility is continuous.
- Simplicity and Speed, Capture First → Enrich Later, Private by default, Explicit sharing, and No silent loss remain mandatory.


## Governance Reconciliation — Contact Rules

Exactly five Person classifications are authoritative: Seeker / باحث, Owner / مالك, Broker / دلال, Real Estate Company / شركة عقارية, and Building Guard / حارس. Tenant and Buyer are historical values, not future authoritative classifications.

Adding a Person begins with at least one classification, followed by manual entry or approved import. Final manual save requires Name, Phone, and at least one classification. Multi-role support is required, and later classification changes must preserve Person data, Requirements, and relationships.

A Seeker may own multiple independent Requirements. Rent or Buy is stored on the Requirement. Imported names and notes are preserved literally and are never silently translated, rewritten, or discarded.