# ViewState AI Skill — Database

**Read this before writing any database schema, migration, or query code in ViewState.**

---

## Stack

- **ORM:** Drizzle ORM (`drizzle-orm`)
- **DB:** PostgreSQL 15+
- **Schema location:** `lib/db/src/schema/`
- **Schema barrel:** `lib/db/src/schema/index.ts` — re-exports everything
- **Migration tool:** `drizzle-kit`
- **Validation:** `drizzle-zod` (auto-generate Zod schemas from Drizzle tables)

## Persistence Boundary

These rules apply to the future server-side PostgreSQL/Drizzle boundary only. The implemented mobile runtime remains local-first: SQLite/AsyncStorage and shared mobile domain validation/contracts are authoritative for mobile data and runtime shape. Future server schemas and generated types must not be treated as the mobile runtime contract.

---

## Schema Writing Rules

### Always extend `baseTable` fields
Every table must have these columns — define them consistently:

```typescript
import { pgTable, uuid, timestamp, boolean } from 'drizzle-orm/pg-core';

// Base columns to include in every table
const baseColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// Soft-delete columns (add to tables with user data)
const softDeleteColumns = {
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
};
```

### Table definition template
```typescript
import { pgTable, text, varchar, numeric, smallint, boolean, uuid, timestamp, pgEnum } from 'drizzle-orm/pg-core';

// Define enums at the top of the schema file
export const propertyTypeEnum = pgEnum('property_type', ['apartment', 'villa', 'office', 'land', 'shop']);
export const propertyPurposeEnum = pgEnum('property_purpose', ['sale', 'rent']);

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  broker_id: uuid('broker_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  title_ar: text('title_ar'),
  title_en: text('title_en'),
  description_ar: text('description_ar'),
  description_en: text('description_en'),
  type: propertyTypeEnum('type').notNull(),
  purpose: propertyPurposeEnum('purpose').notNull(),
  price: numeric('price', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(), // market-configurable default — do not hardcode
  area_sqm: numeric('area_sqm', { precision: 8, scale: 2 }),
  bedrooms: smallint('bedrooms'),
  // location field: column name, type, and nullability deferred to Database stage (see DEC-012)
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
});
```

---

## Zod Schema Generation

```typescript
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { properties } from './schema';

// Generated schemas — use these in future server API validation and future
// server types; they do not define the implemented mobile runtime contract
export const insertPropertySchema = createInsertSchema(properties, {
  price: z.coerce.number().positive(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
});

export const selectPropertySchema = createSelectSchema(properties);
export type Property = typeof selectPropertySchema._type;
export type InsertProperty = typeof insertPropertySchema._type;
```

---

## Query Patterns

### Select with filter
```typescript
import { db } from '@workspace/db';
import { properties } from '@workspace/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

// Get active properties for a broker
async function getBrokerProperties(brokerId: string) {
  return db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.broker_id, brokerId),
        eq(properties.is_active, true),
        isNull(properties.deleted_at) // soft-delete filter
      )
    )
    .orderBy(desc(properties.created_at));
}
```

### Cursor-based pagination
```typescript
async function getPropertiesPaginated(cursor?: string, limit = 20) {
  return db
    .select()
    .from(properties)
    .where(
      and(
        isNull(properties.deleted_at),
        cursor ? lt(properties.id, cursor) : undefined
      )
    )
    .orderBy(desc(properties.created_at))
    .limit(limit + 1); // fetch one extra to determine hasNextPage
}
```

### Insert
```typescript
async function createProperty(data: InsertProperty) {
  const [created] = await db
    .insert(properties)
    .values(data)
    .returning();
  return created;
}
```

### Soft delete (always use this, never hard delete)
```typescript
async function deleteProperty(id: string) {
  await db
    .update(properties)
    .set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
    .where(eq(properties.id, id));
}
```

---

## Migration Workflow

```bash
# Generate migration files (development only)
pnpm --filter @workspace/db run generate

# Push schema to development DB
pnpm --filter @workspace/db run push

# Never run push on production without Founder approval
```

---

## Common Mistakes to Avoid

- **Never use `SELECT *`** — always specify columns
- **Never skip `isNull(deleted_at)` filter** on soft-deleted tables
- **Never use offset-based pagination** — use cursor-based
- **Never store money as float** — use `numeric(15,2)` (Drizzle maps this to string in JS — parse with `parseFloat()` when needed)
- **Never hard-delete user data** — always soft-delete with `deleted_at`, except for the narrow local saved-Property deletion authorized by DEC-042; that exception is not a general database deletion policy.
- **Never write raw SQL** unless it's a complex reporting query that can't be expressed in the ORM


---

## Governance Reconciliation — Effective Rules

This addendum is authoritative for future implementation after the approved governance reconciliation. Historical Stage 00.1–00.4 wording and prior decisions remain preserved as historical evidence; where a conflict exists, the later append-only reconciliation decisions control.

- The future server database layer remains PRE-IMPLEMENTATION and separately locked.
- Stage 00.5 is not defined and must not be fabricated.
- Stage 01 has not begun.
- Product implementation remains unauthorized until a bounded Stage 01 Impact Analysis is approved.
- No database migration is authorized or required by this reconciliation.
- Any role, price, Draft, or compatibility migration reference is a future schema/compatibility risk only.
- The implemented mobile app has a local SQLite/AsyncStorage dataset. Before any future server schema or synchronization work, the relevant stage must stop for a fresh compatibility and migration assessment.
- ViewState App is one Android/iOS product. Android-first is rollout priority only; iOS architectural compatibility is continuous.
- Simplicity and Speed, Capture First → Enrich Later, Private by default, Explicit sharing, and No silent loss remain mandatory.


## Governance Reconciliation — Database Stage Gates

No database schema or migration is authorized by the reconciliation. The current mobile app has an implemented local dataset, but no server database migration is authorized or required by this clarification.

Future database work must assess five Person classifications, separate Requirements and multiple Requirements per Seeker, Requirement Rent/Buy, separate Rental Price/Sale Price, platform-neutral location coordinates, Draft identity and recovery, media retention, backup/restore, and import/export compatibility.

Before future server work, perform a fresh compatibility and migration assessment for the implemented local dataset. Do not silently map old values or discard data.