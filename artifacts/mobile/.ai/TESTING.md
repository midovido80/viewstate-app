# ViewState App — Testing Protocol

**Status:** PRE-IMPLEMENTATION  
**Last updated:** 2026-08-13

---

## Governing Rule

Testing is not optional. Per Rule 8: after each completed layer, the AI must run technical tests, functional tests, new-user simulation, and regression checks before reporting completion. A layer is never "done" until all four checks pass.

---

## Testing Layers

### Layer 1 — Technical: TypeScript + Unit Tests (Vitest)
- **What:** TypeScript typecheck, pure functions, matching logic, form validators, phone normalization, WhatsApp parser
- **Location:** `src/**/__tests__/*.test.ts`
- **Run:** `pnpm --filter @workspace/mobile run typecheck` + `pnpm --filter @workspace/mobile run test`
- **Required:** Zero TS errors. All unit tests pass.

### Layer 2 — Functional: API Integration Tests (Vitest + supertest)
- **What:** API route handlers — happy path and error path per route
- **Location:** `artifacts/api-server/src/**/__tests__/*.test.ts`
- **Run:** `pnpm --filter @workspace/api-server run test`
- **Required:** Every POST/PUT/DELETE route has at least one happy-path + one error-path test.

### Layer 3 — Functional: Component Tests (React Native Testing Library)
- **What:** Individual UI components in isolation
- **Location:** `src/components/__tests__/*.test.tsx`
- **Required:** Every shared component (cards, inputs, buttons) has a render + basic interaction test.

### Layer 4 — New-User Simulation (manual, Expo Go)
- **What:** Follow the exact user flow as a first-time user with no prior knowledge
- **When:** After every layer completion, before Final Report
- **For Arabic:** Switch device to Arabic/RTL, complete the same flow
- **For English:** Switch device to English/LTR, complete the same flow
- **Check:** Does the flow work start-to-finish? Are there any dead ends or confusing states?

### Layer 5 — Regression (automated + manual)
- **What:** Verify previously completed layers still work after this layer's changes
- **Required:** Every feature listed as "done" in `CURRENT_STATE.md` must still function
- **Critical regression tests:** Auth flow, primary CRUD operations, Global Search, RTL layout

---

## Layer-Specific Required Tests

| Layer | Required tests before layer is closed |
|-------|---------------------------------------|
| Foundation / Auth | Login, register, OTP verify, session expiry, invalid credentials, logout |
| Contacts | Create (minimal), create (full), edit, delete (soft), role assignment, deduplication |
| Properties | Create (minimal), create (full), edit, delete (soft), governorate filter |
| Requirements | Create, edit, delete, validate budget range |
| Matching | Score calculation for all field combinations, edge cases (null fields, no match, perfect match), breakdown display |
| WhatsApp Import | Parse iOS format, parse Android format, handle malformed file, extract phones, deduplication |
| Contacts Import | Permission grant, permission deny, normalize phone, deduplication |
| Media | Upload success, upload failure, size enforcement, photo reorder |
| Global Search | Search returns contacts, search returns properties, empty results, Arabic input, English input |

---

## Test Data Rules

- Never use real phone numbers or personal data in tests
- Use predictable IDs: `'prop-1'`, `'contact-1'`
- Arabic test strings: simple, clearly fake: `'شقة للاختبار'`, `'اختبار فقط'`
- Dates: fixed ISO strings: `new Date('2026-01-01T00:00:00Z')`
- Prices: round numbers: `2000000`, `1500000`, `500000`

---

## Test ID Convention

Every interactive element must have a `testID`:

```
[module]-[element-type]-[identifier]

Examples:
  contact-card-123
  property-create-submit-button
  match-score-badge
  global-search-input
  contact-role-buyer-toggle
```

---

## Coverage Requirements

| Module | Min unit test coverage |
|--------|----------------------|
| Matching engine (pure logic) | 90% |
| Phone normalization | 100% |
| WhatsApp parser | 80% |
| Form validators | 85% |
| API routes | 80% |
| Shared UI components | 60% |

---

## Prohibited Testing Shortcuts

- No `// @ts-ignore` in test files
- No `setTimeout` delays — use `waitFor` from RNTL
- No mocking without an explaining comment
- No `it.skip` without a dated TODO comment
- No marking a layer complete before all 4 check types pass (Rule 8)
