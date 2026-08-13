# ViewState App — Database Rules

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Philosophy

- The Drizzle schema in `lib/db/src/schema/` is the **single source of truth**. No type is ever manually duplicated elsewhere.
- Use `drizzle-zod` to derive Zod schemas from Drizzle tables. Never write a Zod schema that mirrors an existing table by hand.
- Migrations are generated via `drizzle-kit` — never write raw SQL migrations.
- Schema changes require Founder approval before being pushed to any environment.

---

## Naming Conventions

### Tables
- Plural snake_case: `properties`, `users`, `buyer_requirements`, `matches`, `contacts`
- Join tables: `[table_a]_[table_b]` (alphabetical order): e.g., `contacts_properties`

### Columns
- snake_case: `created_at`, `updated_at`, `property_id`
- Boolean columns: `is_` prefix: `is_active`, `is_verified`, `is_deleted`
- Timestamp columns: always include `created_at` and `updated_at` on every table
- Soft-delete: use `deleted_at TIMESTAMPTZ` (nullable) — never hard-delete user data
- Bilingual text: `_ar` and `_en` suffix: `title_ar`, `title_en`, `description_ar`, `description_en`

### Indexes
- Index every foreign key column
- Index every column used in WHERE clauses in frequent queries
- Index `created_at` on high-volume tables (properties, matches)
- Compound indexes for common query patterns (e.g., `[broker_id, is_active]`)

---

## Table Schemas (planned, not yet implemented)

### `users`
```
id              UUID PK
phone           VARCHAR(20) UNIQUE NOT NULL  -- primary identifier
name_ar         TEXT
name_en         TEXT
role            ENUM('broker', 'buyer', 'admin')
is_verified     BOOLEAN DEFAULT false
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
deleted_at      TIMESTAMPTZ
```

### `properties`
```
id              UUID PK
broker_id       UUID FK → users.id
title_ar        TEXT
title_en        TEXT
description_ar  TEXT
description_en  TEXT
type            ENUM('apartment', 'villa', 'office', 'land', 'shop')
purpose         ENUM('sale', 'rent')
price           NUMERIC(15,2)
currency        CHAR(3) DEFAULT 'EGP'
area_sqm        NUMERIC(8,2)
bedrooms        SMALLINT
bathrooms       SMALLINT
floor           SMALLINT
total_floors    SMALLINT
governorate     TEXT
district        TEXT
address_ar      TEXT
address_en      TEXT
lat             DECIMAL(9,6)
lng             DECIMAL(9,6)
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
deleted_at      TIMESTAMPTZ
```

### `buyer_requirements`
```
id              UUID PK
contact_id      UUID FK → contacts.id
type            ENUM('apartment', 'villa', 'office', 'land', 'shop', 'any')
purpose         ENUM('sale', 'rent', 'any')
budget_min      NUMERIC(15,2)
budget_max      NUMERIC(15,2)
currency        CHAR(3) DEFAULT 'EGP'
area_min_sqm    NUMERIC(8,2)
area_max_sqm    NUMERIC(8,2)
bedrooms_min    SMALLINT
governorate     TEXT[]  -- array of acceptable governorates
notes_ar        TEXT
notes_en        TEXT
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### `contacts`
```
id              UUID PK
broker_id       UUID FK → users.id  -- who owns this contact
name_ar         TEXT
name_en         TEXT
phone           VARCHAR(20)
role            ENUM('buyer', 'seller', 'broker', 'other')
source          ENUM('manual', 'whatsapp_import', 'contacts_import')
notes           TEXT
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### `matches`
```
id              UUID PK
property_id     UUID FK → properties.id
requirement_id  UUID FK → buyer_requirements.id
score           SMALLINT  -- 0-100 match score
status          ENUM('pending', 'viewed', 'interested', 'rejected', 'closed')
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### `property_media`
```
id              UUID PK
property_id     UUID FK → properties.id
url             TEXT NOT NULL
storage_key     TEXT  -- object storage key
media_type      ENUM('photo', 'video', 'document')
sort_order      SMALLINT DEFAULT 0
created_at      TIMESTAMPTZ
```

---

## Migration Rules

1. Run `pnpm --filter @workspace/db run push` in development only
2. Never push schema changes to production without Founder sign-off
3. Every migration must be backward-compatible (add columns before removing them)
4. Renaming a column = add new + copy data + deprecate old (never rename in one step)
5. Dropping a column: only after it has been `deleted_at`-soft-flagged for ≥1 sprint

---

## Query Rules

- Use Drizzle's query builder — no raw SQL except for complex reporting queries
- All queries use parameterized values — no string interpolation
- Pagination: cursor-based (using `id` or `created_at`) — never offset-based for large tables
- Select only the columns you need — avoid `SELECT *` in production code
