import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateMatch,
  type Property,
  type RentSeekerRequirement,
} from '@workspace/property-domain';
import {
  MyPropertiesMatchingSource,
  normalizeMyPropertyCandidate,
  type MyPropertiesStore,
} from '../services/myPropertiesMatchingSource.ts';

const requirement = (
  overrides: Partial<RentSeekerRequirement> = {},
): RentSeekerRequirement => ({
  id: '11111111-1111-4111-8111-111111111111',
  seekerId: 'seeker-1',
  purpose: 'rent',
  propertyType: 'apartment',
  preferredAreaIds: ['area-1', 'area-2'],
  budget: { minimum: 500, maximum: 800, currencyCode: 'KWD' },
  notes: 'must not enter candidate evidence',
  bedroomsMinimum: 2,
  bathroomsMinimum: 1,
  swimmingPool: true,
  ...overrides,
});

function property(options: {
  readonly id?: string;
  readonly area?: string;
  readonly propertyType?: Property['core']['propertyType'];
  readonly amount?: number;
  readonly currencyCode?: string;
  readonly typeDetails?: Property['typeDetails'];
  readonly extra?: Record<string, unknown>;
} = {}): Property {
  const id = options.id ?? 'property-1';
  return {
    core: {
      id,
      propertyType: options.propertyType ?? 'apartment',
      locationArea: { id: options.area ?? 'area-1' },
      privateNotes: {
        value: 'private local note',
        privacy: { classification: 'private_notes', disclosurePolicy: 'never' },
      },
    },
    activeOffer: {
      id: `${id}-offer`,
      propertyCoreId: id,
      transaction: 'rent',
      rentalPrice: {
        amount: options.amount ?? 650,
        currencyCode: options.currencyCode ?? 'KWD',
      },
      rentalPeriodId: 'monthly',
    },
    typeDetails: options.typeDetails ?? {
      propertyType: 'apartment',
      bedroomCount: 2,
      bathroomCount: 1,
    },
    ...options.extra,
  } as Property;
}

function storeWith(properties: unknown[]): MyPropertiesStore {
  return {
    getProperties: async () => properties as Property[],
  };
}

test('normalizes approved local fields and keeps non-M2 data out of evidence', () => {
  const localProperty = property({
    propertyType: 'house',
    typeDetails: {
      propertyType: 'house',
      bedroomCount: 3,
      bathroomCount: 2,
      hasPool: true,
      // This is deliberately not a matching field.
      furnishing: 'furnished',
    },
    extra: {
      notes: 'unapproved free text',
      locationEnrichment: {
        mapsLink: {
          value: 'https://private.example',
          privacy: { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' },
        },
      },
    },
  });

  const candidate = normalizeMyPropertyCandidate(localProperty);
  assert.ok(candidate);
  assert.deepEqual(candidate.evidence, {
    bedrooms: 3,
    bathrooms: 2,
    swimmingPool: true,
  });
  const evidence = candidate.evidence ?? {};
  assert.equal('notes' in evidence, false);
  assert.equal('privateNotes' in evidence, false);
  assert.equal('hasWaterfront' in evidence, false);
  assert.equal('locationEnrichment' in evidence, false);
  assert.equal(candidate.property, localProperty);
});

test('local source filters malformed records, hard-ineligible records, and duplicate IDs', async () => {
  const validFirst = property({ id: 'valid-first' });
  const validSecond = property({ id: 'valid-second', area: 'area-2' });
  const duplicate = property({ id: 'valid-first', amount: 700 });
  const malformed = {
    core: { id: 'malformed', propertyType: 'apartment', locationArea: { id: 'area-1' } },
    activeOffer: null,
  };
  const wrongType = property({ id: 'wrong-type', propertyType: 'villa' });
  const wrongTransaction = {
    ...property({ id: 'wrong-transaction' }),
    activeOffer: {
      id: 'wrong-transaction-offer',
      propertyCoreId: 'wrong-transaction',
      transaction: 'sale' as const,
      salePrice: { amount: 650, currencyCode: 'KWD' },
    },
  };
  const outsideBudget = property({ id: 'outside-budget', amount: 801 });
  const outsideLocation = property({ id: 'outside-location', area: 'area-3' });
  const wrongCurrency = property({
    id: 'wrong-currency',
    currencyCode: 'USD',
  });

  const source = new MyPropertiesMatchingSource(storeWith([
    validFirst,
    malformed,
    wrongType,
    wrongTransaction,
    outsideBudget,
    outsideLocation,
    wrongCurrency,
    duplicate,
    validSecond,
  ]));

  const candidates = await source.getCandidates(requirement());
  assert.deepEqual(
    candidates.map(candidate => candidate.property.core.id),
    ['valid-first', 'valid-second'],
  );
  assert.equal(
    candidates.every(candidate =>
      evaluateMatch(requirement(), candidate).eligible
    ),
    true,
  );
});

test('preserves deterministic PropertyStore order after normalization and filtering', async () => {
  const newest = property({ id: 'newest', area: 'area-2' });
  const older = property({ id: 'older', area: 'area-1' });
  const source = new MyPropertiesMatchingSource(storeWith([newest, older]));

  const candidates = await source.getCandidates(
    requirement({
      bedroomsMinimum: undefined,
      bathroomsMinimum: undefined,
      swimmingPool: undefined,
    }),
  );
  assert.deepEqual(
    candidates.map(candidate => candidate.property.core.id),
    ['newest', 'older'],
  );
  assert.deepEqual(
    await source.getCandidates(
      requirement({
        bedroomsMinimum: undefined,
        bathroomsMinimum: undefined,
        swimmingPool: undefined,
      }),
    ),
    candidates,
  );
});

test('only valid local Property data is sent to the frozen M2 boundary', async () => {
  const localProperty = property({
    propertyType: 'house',
    typeDetails: {
      propertyType: 'house',
      bedroomCount: 2,
      bathroomCount: 1,
      hasPool: true,
    },
    extra: {
      notes: 'not a domain field',
      source: 'not a domain field',
    },
  });
  const source = new MyPropertiesMatchingSource(storeWith([localProperty]));
  const [candidate] = await source.getCandidates(
    requirement({ propertyType: 'house' }),
  );

  assert.ok(candidate);
  const result = evaluateMatch(requirement({ propertyType: 'house' }), candidate);
  assert.equal(result.eligible, true);
  assert.equal(result.score, 100);
  assert.equal(result.qualifies, true);
  const evidence = candidate.evidence ?? {};
  assert.equal('notes' in evidence, false);
  assert.equal('source' in evidence, false);
});