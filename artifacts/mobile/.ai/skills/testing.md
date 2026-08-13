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
  currency: 'AED', // use market-appropriate currency in real tests — this is illustrative
  area_sqm: '120',
  bedrooms: 3,
  location_area: 'market-area-1', // use market-config ID — not a hardcoded country-specific value
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
  location_areas: ['market-area-1', 'market-area-2'], // use market-config IDs
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
        currency: 'AED', // market-configurable — use active market currency in real tests
        location_area: 'market-area-1', // market-config ID
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
    currency: 'AED', // market-configurable — use active market currency in real tests
    type: 'apartment' as const,
    purpose: 'sale' as const,
    location_area: 'market-area-1', // market-config ID
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
