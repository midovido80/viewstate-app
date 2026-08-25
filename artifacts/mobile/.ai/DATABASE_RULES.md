# ViewState App — Database Rules

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Philosophy

- The Drizzle schema in `lib/db/src/schema/` is the **single source of truth**. No type is ever manually duplicated elsewhere.
- Use `drizzle-zod` to derive Zod schemas from Drizzle tables. Never write a Zod schema that mirrors an existing table by hand.
- Migrations are generated via `drizzle-kit` — never write raw SQL migrations by hand.
- Schema changes require Founder approval before being pushed to any environment.
- Design every table with V002+ features in mind (Rule 17) — leave extension points, avoid constraints that would block future AI or marketplace features.

---

## Naming Conventions

### Tables
- Plural snake_case: `users`, `contacts`, `properties`, `buyer_requirements`, `matches`, `property_media`
- Join tables: `[table_a]_[table_b]` (alphabetical): e.g., `contacts_properties`

### Columns
- snake_case throughout: `created_at`, `updated_at`, `property_id`
- Booleans: `is_` prefix: `is_active`, `is_verified`, `is_deleted`
- Timestamps: every table has `created_at` and `updated_at`
- Soft-delete: `deleted_at TIMESTAMPTZ` (nullable) — **never hard-delete user data**
- Bilingual text: `_ar` and `_en` suffix: `title_ar`, `title_en`

### Indexes
- Index every foreign key column
- Index every column used in WHERE clauses of frequent queries
- Index `created_at` on high-volume tables
- Compound indexes for common patterns (e.g., `[broker_id, is_active]`)

---

## Table Schemas (planned — not yet implemented)

### `users`
```
id              UUID PK
phone           VARCHAR(20) UNIQUE NOT NULL  -- primary identifier (E.164)
name_ar         TEXT
name_en         TEXT
role            ENUM('broker', 'buyer', 'admin')
is_verified     BOOLEAN DEFAULT false
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at      TIMESTAMPTZ
```

### `contacts`
```
id              UUID PK
broker_id       UUID FK → users.id
name_ar         TEXT
name_en         TEXT
phone           VARCHAR(20)              -- normalized E.164
roles           TEXT[]                   -- ['buyer','tenant','owner','broker'] — V001 only these four
source          ENUM('manual','whatsapp_import','contacts_import')
notes           TEXT
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at      TIMESTAMPTZ
```

> **Rule 11:** roles array values for V001 are constrained to: `tenant`, `buyer`, `owner`, `broker` — no others.
> **Classification (product scope — persistence TBD):** Contacts support an optional 4-label status tag (Follow Up / Important / Pending / Order Complete / Closed Deal). The persistence column name, SQL type, constraint representation, and nullability are deferred to the Database stage.

### `properties`
```
id              UUID PK
broker_id       UUID FK → users.id
title_ar        TEXT
title_en        TEXT
description_ar  TEXT
description_en  TEXT
type            ENUM('apartment','villa','office','land','shop')
purpose         ENUM('sale','rent')
price           NUMERIC(15,2) NOT NULL
currency        CHAR(3)                  -- market-configurable; column default and constraints deferred to Database stage
area_sqm        NUMERIC(8,2)
bedrooms        SMALLINT
bathrooms       SMALLINT
floor           SMALLINT
total_floors    SMALLINT
[location]      --                       -- market-configurable location concept (emirate/region/etc.); column name, type, nullability deferred to Database stage
district        TEXT
address_ar      TEXT
address_en      TEXT
lat             DECIMAL(9,6)
lng             DECIMAL(9,6)
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at      TIMESTAMPTZ
```

> **Classification (product scope — persistence TBD):** Properties support an optional 4-label status tag (Follow Up / Important / Pending / Order Complete / Closed Deal). The persistence column name, SQL type, constraint representation, and nullability are deferred to the Database stage.

### `buyer_requirements`
```
id              UUID PK
contact_id      UUID FK → contacts.id
type            ENUM('apartment','villa','office','land','shop','any')
purpose         ENUM('sale','rent','any')
budget_min      NUMERIC(15,2)
budget_max      NUMERIC(15,2)
currency        CHAR(3)                  -- market-configurable; column default and constraints deferred to Database stage
area_min_sqm    NUMERIC(8,2)
area_max_sqm    NUMERIC(8,2)
bedrooms_min    SMALLINT
[location pref] --                       -- market-configurable location preference(s); column name, type, structure deferred to Database stage
notes_ar        TEXT
notes_en        TEXT
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### `matches`
```
id              UUID PK
property_id     UUID FK → properties.id
requirement_id  UUID FK → buyer_requirements.id
score           SMALLINT NOT NULL    -- 0-100
breakdown       JSONB NOT NULL       -- Compare+Score+Explain per field; exact JSONB keys deferred to Database stage
status          ENUM('pending','viewed','interested','rejected','closed')
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

> **Rule 12:** `breakdown` JSONB stores the Compare + Score + Explain data for V001 matching.

### `property_media`
```
id              UUID PK
property_id     UUID FK → properties.id
url             TEXT NOT NULL
storage_key     TEXT
media_type      ENUM('photo','video','document')
sort_order      SMALLINT DEFAULT 0
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

## Migration Rules

1. Run `pnpm --filter @workspace/db run push` in **development only**
2. Never push schema changes to production without Founder sign-off
3. Every migration must be backward-compatible (add before removing)
4. Renaming a column: add new + copy data + deprecate old — never rename directly
5. Dropping a column: only after it has been soft-flagged for ≥ 1 sprint

---

## Query Rules

- Use Drizzle query builder — no raw SQL except for complex reporting
- All queries use parameterized values — no string interpolation
- Pagination: **cursor-based** (using `id` or `created_at`) — never offset-based
- Select only needed columns — avoid `SELECT *`
- Always filter `isNull(deleted_at)` on soft-delete tables


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


## Governance Reconciliation — Effective Data Rules

This reconciliation authorizes no schema or migration work. The app remains PRE-IMPLEMENTATION with no implemented V001 dataset requiring migration now.

Future schema work must represent exactly five Person classifications, separate Requirements, multiple Requirements per Seeker, Requirement purpose Rent/Buy, separate Rental Price and Sale Price, configurable Governorate/Area, optional PACI/exact location, platform-neutral coordinates, original map-link preservation, independent local Drafts, and private media retention.

Any discovered implemented dataset stops the relevant stage for a fresh migration and compatibility assessment. No old role, zero-role Contact, generic-price, or Draft migration is implied by this reconciliation.

Persisted originals remain unchanged until edit save succeeds. Backup, restore, import, export, and future ViewState Card formats remain platform-neutral. Server-backed Draft synchronization is deferred.