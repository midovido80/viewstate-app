# ViewState App — Database Rules

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-26

---

## Current Effective Data Boundary

These are governance planning rules only; no schema or migration is authorized by this corrective pass. Requirements are conceptually Seeker-owned separate records. Rental Price and Sale Price are separate concepts. User-entered/imported names, notes, descriptions, and source text remain literal; exact persisted representation is deferred to the bounded Data Impact Analysis.

**Pre-Stage 01 Property Capture Amendment Boundary:** BASIC Property capture follows DEC-022 exactly: Property Type, Purpose, Price, and Market-configured Location Area. Title is not a required BASIC Property field, and this amendment creates no fifth BASIC requirement. The taxonomy and persistence examples below are non-final planning guidance only. Property/Offer/Unit alternatives, parent relationships, simultaneous Sale/Rent representation, and persisted price representation remain unresolved for the separately Founder-authorized Stage 01 Impact Analysis. Land remains a separate later V001 workflow. No schema or migration is authorized.

### Persistence Authority Boundary

- **Current mobile runtime:** Local SQLite and AsyncStorage, together with shared mobile domain validation and contracts, are authoritative for the implemented mobile app's persisted data and runtime data shape.
- **Future server runtime:** PostgreSQL and Drizzle are future server-side persistence architecture only. The planned tables and Drizzle schema in `lib/db/src/schema/` are not the current authoritative schema for the running mobile app.
- These rules describe future server-side database planning and must not be used to authorize moving, replacing, or synchronizing the current mobile persistence implementation.


## Philosophy

- PostgreSQL with Drizzle ORM is the planned **future server-side** persistence authority, once that server architecture is separately authorized and implemented. It is not the current mobile runtime schema authority.
- For the implemented mobile runtime, preserve the local SQLite/AsyncStorage boundary and shared domain validation/contracts; do not derive mobile runtime persistence from the planned Drizzle tables.
- Within the future server boundary, use `drizzle-zod` to derive Zod schemas from Drizzle tables. Never write a future server Zod schema that mirrors an existing table by hand.
- Migrations are generated via `drizzle-kit` — never write raw SQL migrations by hand.
- Schema changes require Founder approval before being pushed to any environment.
- Design every table with V002+ features in mind (Rule 17) — leave extension points, avoid constraints that would block future AI or marketplace features.

---

## Naming Conventions

### Tables
- Plural snake_case: `users`, `contacts`, `properties`, `seeker_requirements`, `matches`, `property_media`
- Join tables: `[table_a]_[table_b]` (alphabetical): e.g., `contacts_properties`

### Columns
- snake_case throughout: `created_at`, `updated_at`, `property_id`
- Booleans: `is_` prefix: `is_active`, `is_verified`, `is_deleted`
- Timestamps: every table has `created_at` and `updated_at`
- Soft-delete: `deleted_at TIMESTAMPTZ` (nullable) — **never hard-delete user data**, except for the narrow local saved-Property deletion boundary in DEC-042. That exception applies only to an explicitly confirmed Property or separately approved fixed snapshot in one identified local storage namespace; it does not authorize deletion of drafts, recovery evidence, preferences, other entities, devices, profiles, environments, or server data.
- Localized UI/system labels may use approved Arabic/English resources; user-entered or imported free text remains literal and must not be auto-translated or duplicated

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
name            TEXT                     -- stored literally; persisted representation remains deferred
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
name            TEXT                     -- stored literally; persisted representation remains deferred
phone           VARCHAR(20)              -- normalized E.164
classifications TEXT[]                   -- ['seeker','owner','broker','real_estate_company','building_guard']; at least one before final save
source          ENUM('manual','whatsapp_import','contacts_import')
notes           TEXT
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at      TIMESTAMPTZ
```

> **Current Person rule:** classifications are Seeker, Owner, Broker, Real Estate Company, and Building Guard; multi-role is supported and final save requires at least one classification.
> **Classification (product scope — persistence TBD):** Contacts support an optional 4-label status tag (Follow Up / Important / Pending / Order Complete / Closed Deal). The persistence column name, SQL type, constraint representation, and nullability are deferred to the Database stage.

### `properties`

> **Non-final planning guidance:** The following example must not be interpreted as an approved final taxonomy, Property/Offer/Unit model, parent/unit relationship, or persistence model. Those decisions remain reserved for the separately authorized Stage 01 Impact Analysis.

```
id              UUID PK
broker_id       UUID FK → users.id
title           TEXT                     -- user-entered text remains literal
description     TEXT                     -- user-entered text remains literal
type            ENUM('apartment','villa','office','land','shop')
purpose         ENUM('sale','rent')
rental_price    NUMERIC(15,2)            -- separate rental concept
sale_price      NUMERIC(15,2)            -- separate sale concept
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

### `seeker_requirements`
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
- Always filter `isNull(deleted_at)` on soft-delete tables. DEC-042 is a narrow local saved-Property exception and does not change this rule for server-backed or other user data.


---
