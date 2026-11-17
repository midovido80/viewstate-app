# ViewState AI Skill — TypeScript

**Read this before writing any TypeScript in ViewState.**

---

## Core Rules

### Strict mode — always
TypeScript is configured with `strict: true`. Every `tsconfig.json` in this monorepo extends `tsconfig.base.json` which enables all strict checks. No exceptions.

### No `any`
- `any` is banned in production code
- If you receive `any` from a third-party library, immediately narrow the type with a type guard or cast to a specific type with a comment
- `unknown` is acceptable for external data — validate with Zod before using

### Zod for all external data
```typescript
import { z } from 'zod/v4';

// Parse server API responses with the approved generated API contract/schema.
// Future server persistence validation may use generated Zod schemas from drizzle-zod.
// Do not derive the implemented mobile domain or local persistence contract from
// the future server Drizzle tables.
// For third-party data (WhatsApp export, contacts), write a dedicated Zod schema
```

### Explicit return types on exported functions
```typescript
// ✅ Good
export function calculateMatchScore(property: Property, requirement: Requirement): number {
  ...
}

// ❌ Bad — return type is implicit
export function calculateMatchScore(property: Property, requirement: Requirement) {
  ...
}
```

### Type aliases for domain concepts
```typescript
// Define type aliases at module level for clarity
type PropertyId = string;
type ContactId = string;
type MatchScore = number; // 0-100

// Use branded types for IDs to prevent accidental swaps
type Branded<T, Brand extends string> = T & { readonly __brand: Brand };
type PropertyId = Branded<string, 'PropertyId'>;
```

### Enum pattern
```typescript
// Use string literal unions, not TypeScript enums
type PropertyType = 'apartment' | 'villa' | 'office' | 'land' | 'shop';
type PropertyPurpose = 'sale' | 'rent';

// For runtime validation, use Zod enum
const PropertyTypeSchema = z.enum(['apartment', 'villa', 'office', 'land', 'shop']);
```

### useState typing
```typescript
// Always explicit — never inferred from initial value
const [properties, setProperties] = useState<Property[]>([]);
const [loading, setLoading] = useState<boolean>(false);
const [error, setError] = useState<string | null>(null);
```

### Optional chaining and nullish coalescing
```typescript
// Always use ?. and ?? — never assume a value exists without checking
const title = property?.title_ar ?? property?.title_en ?? 'Untitled';
```

---

## Boundary-Specific ViewState Types

Types are boundary-specific. The implemented mobile runtime uses its shared mobile domain contracts and validation with local SQLite/AsyncStorage persistence. Future server records may be generated from the future server Drizzle schema via drizzle-zod. Do not treat the future server schema as the mobile runtime contract. The interfaces below are reference-only examples for the future server boundary:

```typescript
// REFERENCE ONLY — future server boundary; not the implemented mobile contract
interface User {
  id: string;
  phone: string;
  name_ar: string | null;
  name_en: string | null;
  role: 'broker' | 'buyer' | 'admin';
  is_verified: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface Property {
  id: string;
  broker_id: string;
  title_ar: string | null;
  title_en: string | null;
  type: 'apartment' | 'villa' | 'office' | 'land' | 'shop';
  purpose: 'sale' | 'rent';
  price: number;
  currency: string;           // market-configurable — exact default deferred to Database stage
  area_sqm: number | null;
  bedrooms: number | null;
  // location field: market-configurable concept — exact field name and type deferred to Database stage
  district: string | null;
  // classification field: 4-label optional status tag — exact field name and type deferred to Database stage
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
```

---

## Module Imports

```typescript
// ✅ Correct — use @/ alias for all project-local imports
import { useColors } from '@/hooks/useColors';
import { Property } from '@/modules/properties/types';

// ❌ Wrong — relative paths
import { useColors } from '../../hooks/useColors';
```

---

## Error Types

```typescript
// Standard error type for API responses
interface ApiError {
  code: string;
  message_ar: string;
  message_en: string;
}

// Type guard
function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message_ar' in error &&
    'message_en' in error
  );
}
```
