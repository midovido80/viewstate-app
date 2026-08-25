# ViewState AI Skill — Testing

**Read this before writing any tests in ViewState.**

---

## Testing Stack

| Type | Library | Location |
|------|---------|---------|
| Unit tests (logic) | Vitest | `src/**/__tests__/*.test.ts` |
| Server integration tests | Vitest + supertest | `artifacts/api-server/src/**/__tests__/*.test.ts` |
| Component tests | React Native Testing Library + Vitest | `src/components/__tests__/*.test.tsx` |
| E2E / manual | Expo Go on device | Checklist in `docs/ux/` |

---

## Unit Test Template

```typescript
// src/modules/matching/__tests__/matchScore.test.ts
import { describe, it, expect } from 'vitest';
import { calculateMatchScore } from '../utils/matchScore';
import type { Property, BuyerRequirement } from '@workspace/db';

const mockProperty: Property = {
  id: 'prop-1',
  broker_id: 'broker-1',
  type: 'apartment',
  purpose: 'sale',
  price: '2500000',
  currency: 'MARKET_CURRENCY', // replace with active market currency code — never hardcode a real country's currency
  area_sqm: '120',
  bedrooms: 3,
  // location field: use market-config ID — field name deferred to Database stage
  is_active: true,
  // ... other fields
};

const mockRequirement: BuyerRequirement = {
  id: 'req-1',
  contact_id: 'contact-1',
  type: 'apartment',
  purpose: 'sale',
  budget_min: '2000000',
  budget_max: '3000000',
  area_min_sqm: '100',
  area_max_sqm: null,
  bedrooms_min: 2,
  // location preference field: use market-config IDs — field name deferred to Database stage
  is_active: true,
  // ... other fields
};

describe('calculateMatchScore', () => {
  it('returns 100 for a perfect match', () => {
    const result = calculateMatchScore({ property: mockProperty, requirement: mockRequirement });
    expect(result.score).toBe(100);
    expect(result.isMatch).toBe(true);
  });

  it('returns 0 when type does not match', () => {
    const result = calculateMatchScore({
      property: { ...mockProperty, type: 'villa' },
      requirement: { ...mockRequirement, type: 'apartment' },
    });
    expect(result.breakdown.type).toBe(0);
  });

  it('marks as no match when score < 60', () => {
    const result = calculateMatchScore({
      property: mockProperty,
      requirement: { ...mockRequirement, budget_max: '1000000' }, // price out of range
    });
    expect(result.isMatch).toBe(false);
  });

  it('handles null requirement fields without penalizing', () => {
    const result = calculateMatchScore({
      property: mockProperty,
      requirement: { ...mockRequirement, area_min_sqm: null, area_max_sqm: null },
    });
    expect(result.breakdown.area).toBe(5); // No restriction = full score
  });
});
```

---

## API Route Test Template

```typescript
// artifacts/api-server/src/routes/__tests__/properties.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../../app';

const request = supertest(app);

describe('POST /api/properties', () => {
  it('creates a property with valid data', async () => {
    const res = await request
      .post('/api/properties')
      .set('Authorization', `Bearer test-token`)
      .send({
        type: 'apartment',
        purpose: 'sale',
        price: 2500000,
        currency: 'MARKET_CURRENCY', // replace with active market currency code — never hardcode a real country's currency
        // location field: 'market-area-1' — field name deferred to Database stage
        title_ar: 'شقة للبيع',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'apartment',
      purpose: 'sale',
    });
  });

  it('returns 422 when price is missing', async () => {
    const res = await request
      .post('/api/properties')
      .set('Authorization', `Bearer test-token`)
      .send({ type: 'apartment', purpose: 'sale' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
```

---

## Component Test Template

```typescript
// src/components/__tests__/PropertyCard.test.tsx
import { render, screen } from '@testing-library/react-native';
import { PropertyCard } from '../PropertyCard';

describe('PropertyCard', () => {
  const mockProperty = {
    id: '1',
    title_ar: 'شقة رائعة',
    title_en: 'Great Apartment',
    price: 2500000,
    currency: 'MARKET_CURRENCY', // replace with active market currency code — never hardcode a real country's currency
    type: 'apartment' as const,
    purpose: 'sale' as const,
    // location field: 'market-area-1' — field name deferred to Database stage
  };

  it('renders Arabic title', () => {
    render(<PropertyCard property={mockProperty} locale="ar" />);
    expect(screen.getByText('شقة رائعة')).toBeTruthy();
  });

  it('renders English title when locale is en', () => {
    render(<PropertyCard property={mockProperty} locale="en" />);
    expect(screen.getByText('Great Apartment')).toBeTruthy();
  });

  it('has correct testID', () => {
    render(<PropertyCard property={mockProperty} locale="ar" />);
    expect(screen.getByTestId('property-card-1')).toBeTruthy();
  });
});
```

---

## Test Data Rules

- Never use real phone numbers or personal data in tests
- Use predictable IDs: `'prop-1'`, `'broker-1'`, `'req-1'`
- Arabic test strings: use simple, clearly fake data: `'شقة للاختبار'`
- Dates: use fixed dates: `new Date('2026-01-01T00:00:00Z')`
- Prices: use round numbers easy to reason about: `2000000`, `1500000`

---

## Running Tests

```bash
# Unit + component tests
pnpm --filter @workspace/mobile run test

# API server integration tests
pnpm --filter @workspace/api-server run test

# Watch mode
pnpm --filter @workspace/mobile run test -- --watch
```

---

## Coverage Requirements by Module

| Module | Min coverage |
|--------|-------------|
| Matching engine (pure logic) | 90% |
| Phone normalization | 100% |
| WhatsApp parser | 80% |
| Form validators | 85% |
| API routes | 80% |
| UI components | 60% (render + interaction) |


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


## Governance Reconciliation — Testing Stage Gates

Future testing must cover the six mandatory Impact Analysis sections: Android/iOS Compatibility Impact; Persisted Data / Migration / Compatibility; Privacy and Sharing; Draft and Save-failure Safety; Performance and Bounded-scale Risk; and Testing and Release Evidence.

Include real Android devices and Honor X9 where applicable, iPhone real-device testing, TestFlight verification before iOS freeze, Arabic/RTL and English/LTR, permissions, keyboard, navigation, accessibility, offline behavior, media retention, import/share privacy, migration safety, and release traceability.