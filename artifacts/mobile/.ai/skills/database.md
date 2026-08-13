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
  location_area: text('location_area'), // market-configurable — see DATABASE_RULES.md DEC-012
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

// Generated schemas — use these in API validation and client types
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
- **Never hard-delete user data** — always soft-delete with `deleted_at`
- **Never write raw SQL** unless it's a complex reporting query that can't be expressed in the ORM
