import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  checkMatchEligibility,
  evaluateMatch,
  validateProperty,
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
  assert.notEqual(candidate.property, localProperty);
  assert.deepEqual(candidate.property.core, {
    id: localProperty.core.id,
    propertyType: 'house',
    locationArea: { id: 'area-1' },
  });
  assert.equal('privateNotes' in candidate.property.core, false);
  assert.equal('attachments' in candidate.property, false);
  assert.equal('locationEnrichment' in candidate.property, false);
  assert.equal('notes' in candidate.property, false);
  assert.equal('furnishing' in (candidate.property.typeDetails ?? {}), false);
  assert.equal('hasWaterfront' in (candidate.property.typeDetails ?? {}), false);
});

test('maps supported chalet pool evidence without treating waterfront as sea view', () => {
  const candidate = normalizeMyPropertyCandidate(property({
    propertyType: 'chalet',
    typeDetails: {
      propertyType: 'chalet',
      bedroomCount: 4,
      bathroomCount: 3,
      hasPool: true,
      hasWaterfront: true,
    },
  }));

  assert.ok(candidate);
  assert.deepEqual(candidate.evidence, {
    bedrooms: 4,
    bathrooms: 3,
    swimmingPool: true,
  });
  assert.equal('seaView' in (candidate.evidence ?? {}), false);
  assert.deepEqual(candidate.property.typeDetails, {
    propertyType: 'chalet',
    bedroomCount: 4,
    bathroomCount: 3,
    hasPool: true,
  });
});

test('maps only approved Shop evidence for property-type-aware matching', () => {
  const candidate = normalizeMyPropertyCandidate(property({
    propertyType: 'shop',
    typeDetails: {
      propertyType: 'shop',
      builtUpAreaSquareMeters: 80,
      commercialActivity: {
        value: 'Coffee & Gifts',
        privacy: { classification: 'normal', disclosurePolicy: 'normal' },
      },
      floorNumber: 0,
      frontageWidthMeters: 8,
    },
  }));

  assert.ok(candidate);
  assert.deepEqual(candidate.evidence, {
    builtUpAreaSquareMeters: 80,
    commercialActivity: 'Coffee & Gifts',
    floorNumber: 0,
    frontageWidthMeters: 8,
  });
  assert.deepEqual(candidate.property.typeDetails, {
    propertyType: 'shop',
    builtUpAreaSquareMeters: 80,
    floorNumber: 0,
    frontageWidthMeters: 8,
  });
  assert.equal(validateProperty(candidate.property).ok, true);
});

test('maps factual area evidence for Office and Commercial Floor', () => {
  const office = normalizeMyPropertyCandidate(property({
    propertyType: 'office',
    typeDetails: {
      propertyType: 'office',
      builtUpAreaSquareMeters: 110,
    },
  }));
  const floor = normalizeMyPropertyCandidate(property({
    propertyType: 'floor',
    typeDetails: {
      propertyType: 'floor',
      floorUse: 'commercial',
      builtUpAreaSquareMeters: 220,
    },
  }));

  assert.ok(office);
  assert.ok(floor);
  assert.equal(office.evidence?.builtUpAreaSquareMeters, 110);
  assert.equal(floor.evidence?.builtUpAreaSquareMeters, 220);
  assert.equal(validateProperty(office.property).ok, true);
  assert.equal(validateProperty(floor.property).ok, true);
});

test('bathroom scoring distinguishes mapped data from an omitted Requirement criterion', () => {
  const mapped = normalizeMyPropertyCandidate(property({
    area: 'adailiya',
    typeDetails: {
      propertyType: 'apartment',
      bedroomCount: 2,
      bathroomCount: 3,
    },
  }));
  assert.ok(mapped);
  assert.equal(mapped.evidence?.bathrooms, 3);
  assert.equal(
    mapped.property.typeDetails && 'bathroomCount' in mapped.property.typeDetails
      ? mapped.property.typeDetails.bathroomCount
      : undefined,
    3,
  );

  const withCriterion = evaluateMatch(requirement({
    preferredAreaIds: ['abdullah_al_salem'],
    bathroomsMinimum: 2,
  }), mapped);
  const bathroomMatch = withCriterion.explanations.find(
    item => item.criterion === 'bathrooms',
  );
  const outsideLocation = withCriterion.explanations.find(
    item => item.criterion === 'ordered_location',
  );
  assert.equal(bathroomMatch?.status, 'matched');
  assert.equal(bathroomMatch?.awardedPoints, 10);
  assert.equal(outsideLocation?.awardedPoints, 6);

  const withoutCriterion = evaluateMatch(requirement({
    preferredAreaIds: ['abdullah_al_salem'],
    bathroomsMinimum: undefined,
  }), mapped);
  assert.equal(
    withoutCriterion.explanations.some(item => item.criterion === 'bathrooms'),
    false,
  );
});

test('local source keeps location mismatches while filtering hard-ineligible records and duplicate IDs', async () => {
  const validFirst = property({ id: 'valid-first' });
  const validSecond = property({ id: 'valid-second', area: 'area-2' });
  const duplicate = property({ id: 'valid-first', amount: 700 });
  const malformed = {
    core: { id: 'valid-second', propertyType: 'apartment', locationArea: { id: 'area-1' } },
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
    ['valid-first', 'outside-location', 'valid-second'],
  );
  assert.equal(
    candidates.every(candidate =>
      evaluateMatch(requirement(), candidate).eligible
    ),
    true,
  );
});

test('a first valid duplicate deterministically wins before eligibility filtering', async () => {
  const firstIneligible = property({ id: 'duplicate', amount: 801 });
  const laterEligible = property({ id: 'duplicate', amount: 650 });
  const source = new MyPropertiesMatchingSource(storeWith([
    firstIneligible,
    laterEligible,
  ]));

  assert.deepEqual(await source.getCandidates(requirement()), []);
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

test('the source uses eligibility-only M2 logic and never invokes full scoring', async () => {
  const localProperty = property();
  const candidate = normalizeMyPropertyCandidate(localProperty);
  assert.ok(candidate);
  assert.deepEqual(
    checkMatchEligibility(requirement(), candidate),
    {
      eligible: true,
      locationRank: 1,
      ineligibilityReasons: [],
    },
  );
  const sourceText = await readFile(
    'services/myPropertiesMatchingSource.ts',
    'utf8',
  );
  assert.match(sourceText, /checkMatchEligibility\(requirement, candidate\)/);
  assert.doesNotMatch(sourceText, /evaluateMatch/);
});