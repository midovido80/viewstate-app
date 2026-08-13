# ViewState App — Testing Protocol

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Philosophy

Tests are written alongside the code they test — never after the fact. No layer is considered "done" until its tests pass. The AI must not mark a task complete if tests are failing.

---

## Testing Layers

### Layer 1 — Unit Tests (Vitest)
- **What:** Pure functions, utility helpers, i18n helpers, matching engine logic, form validators
- **Where:** `src/**/__tests__/*.test.ts`
- **Required coverage:** Every exported function in `src/lib/` and `src/modules/*/utils/`
- **Run:** `pnpm --filter @workspace/mobile run test`

### Layer 2 — Integration Tests (server-side)
- **What:** API route handlers — given a request, assert the response shape and status
- **Where:** `artifacts/api-server/src/**/__tests__/*.test.ts`
- **Pattern:** Use supertest against the Express app
- **Required:** Every POST/PUT/DELETE route has at least one happy-path and one error-path test

### Layer 3 — Component Tests (React Native Testing Library)
- **What:** Individual React Native components in isolation
- **Where:** `src/components/__tests__/*.test.tsx`
- **Required:** Every shared component (cards, inputs, buttons) has a render test

### Layer 4 — E2E / Manual (Expo Go on device)
- **What:** Full user flows on a real device
- **When:** Before every release, after every major feature
- **Checklist location:** `docs/ux/e2e-checklist.md` (to be created per feature)

---

## Test File Conventions

```typescript
// src/modules/matching/__tests__/matchScore.test.ts
import { calculateMatchScore } from '../utils/matchScore';

describe('calculateMatchScore', () => {
  it('returns 100 for perfect match', () => {
    // ...
  });

  it('returns 0 when no fields match', () => {
    // ...
  });

  it('handles missing optional fields gracefully', () => {
    // ...
  });
});
```

---

## What Must Be Tested Before Each Layer Is Closed

| Layer | Required tests |
|-------|---------------|
| Foundation / Auth | Login, register, session expiry, invalid credentials |
| Property Module | CRUD operations, bilingual field validation, inactive filtering |
| Contacts Module | Import flow, deduplication, phone normalization |
| Requirements Module | CRUD, validation of budget range, governorate list |
| Matching Engine | Score calculation unit tests, edge cases (no matches, partial matches) |
| WhatsApp Import | Parse known chat formats, handle malformed input, extract contact correctly |
| Media Layer | Upload success, upload failure, size limit enforcement |
| UI / Screens | Render tests for every shared component |

---

## Test IDs

Every interactive element in the UI must have a `testID` prop:

```tsx
<TouchableOpacity testID="property-card-123" onPress={...}>
```

Pattern: `[module]-[element-type]-[id-or-context]`

---

## Prohibited Testing Shortcuts

- No `// @ts-ignore` in test files
- No `setTimeout` delays to wait for async operations — use `waitFor` from RNTL
- No mocking of modules without a comment explaining why
- No skipped tests (`it.skip`) in committed code unless there is a dated TODO comment
