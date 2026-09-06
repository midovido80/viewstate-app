import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import type {
  Property,
  RentSeekerRequirement,
  SeekerRequirement,
} from '@workspace/property-domain';
import {
  BrokerInitiatedMatching,
  type BrokerMatchingCandidateSource,
  type BrokerMatchingRequirementStore,
} from '../services/brokerInitiatedMatching.ts';
import { MyPropertiesMatchingSource } from '../services/myPropertiesMatchingSource.ts';

const requirement = (
  overrides: Partial<RentSeekerRequirement> = {},
): RentSeekerRequirement => ({
  id: '11111111-1111-4111-8111-111111111111',
  seekerId: 'seeker-1',
  purpose: 'rent',
  propertyType: 'apartment',
  preferredAreaIds: ['area-1', 'area-2'],
  budget: { minimum: 500, maximum: 800, currencyCode: 'KWD' },
  notes: 'broker-only note must not reach results',
  bedroomsMinimum: 2,
  bathroomsMinimum: 1,
  swimmingPool: true,
  ...overrides,
});

function property(options: {
  readonly id: string;
  readonly area?: string;
  readonly amount?: number;
  readonly propertyType?: Property['core']['propertyType'];
  readonly typeDetails?: Property['typeDetails'];
  readonly extra?: Record<string, unknown>;
}): Property {
  return {
    core: {
      id: options.id,
      propertyType: options.propertyType ?? 'apartment',
      locationArea: { id: options.area ?? 'area-1' },
      privateNotes: {
        value: 'private note must not reach results',
        privacy: { classification: 'private_notes', disclosurePolicy: 'never' },
      },
    },
    activeOffer: {
      id: `${options.id}-offer`,
      propertyCoreId: options.id,
      transaction: 'rent',
      rentalPrice: {
        amount: options.amount ?? 650,
        currencyCode: 'KWD',
      },
      rentalPeriodId: 'monthly',
    },
    typeDetails: options.typeDetails,
    ...options.extra,
  } as Property;
}

function storeFor(
  value: SeekerRequirement | null,
): BrokerMatchingRequirementStore & { readonly lookupIds: string[] } {
  const lookupIds: string[] = [];
  return {
    lookupIds,
    getRequirement: async (id: string) => {
      lookupIds.push(id);
      return value;
    },
  };
}

function sourceFor(
  candidates: ReturnType<MyPropertiesMatchingSource['getCandidates']> extends
    Promise<infer Result> ? Result : never,
): BrokerMatchingCandidateSource & { readonly requested: SeekerRequirement[] } {
  const requested: SeekerRequirement[] = [];
  return {
    requested,
    getCandidates: async (requestedRequirement) => {
      requested.push(requestedRequirement);
      return candidates;
    },
  };
}

test('looks up, validates, and connects the existing Requirement to the source', async () => {
  const storedRequirement = requirement();
  const store = storeFor(storedRequirement);
  const source = sourceFor([]);
  const matching = new BrokerInitiatedMatching(store, source);

  const result = await matching.runForRequirement(storedRequirement.id);

  assert.deepEqual(result, {
    requirementId: storedRequirement.id,
    matches: [],
  });
  assert.deepEqual(store.lookupIds, [storedRequirement.id]);
  assert.equal(source.requested.length, 1);
  assert.equal(source.requested[0], storedRequirement);
});

test('rejects missing, mismatched, and invalid Requirements before candidate lookup', async () => {
  const missingStore = storeFor(null);
  const missingSource = sourceFor([]);
  await assert.rejects(
    () => new BrokerInitiatedMatching(missingStore, missingSource)
      .runForRequirement('missing'),
    /MATCHING_REQUIREMENT_NOT_FOUND/,
  );
  assert.equal(missingSource.requested.length, 0);

  const mismatchedStore = storeFor({ ...requirement(), id: '22222222-2222-4222-8222-222222222222' });
  const mismatchedSource = sourceFor([]);
  await assert.rejects(
    () => new BrokerInitiatedMatching(mismatchedStore, mismatchedSource)
      .runForRequirement('11111111-1111-4111-8111-111111111111'),
    /MATCHING_REQUIREMENT_ID_MISMATCH/,
  );
  assert.equal(mismatchedSource.requested.length, 0);

  const invalidStore = storeFor({
    ...requirement(),
    preferredAreaIds: [],
  });
  const invalidSource = sourceFor([]);
  await assert.rejects(
    () => new BrokerInitiatedMatching(invalidStore, invalidSource)
      .runForRequirement(requirement().id),
    /MATCHING_REQUIREMENT_INVALID/,
  );
  assert.equal(invalidSource.requested.length, 0);
});

test('delegates eligibility, scoring, ranking, and qualification filtering to M2', async () => {
  const storedRequirement = requirement({ occupancy: 'family' });
  const qualifiedAtPreferredArea = property({
    id: 'preferred',
    area: 'area-1',
    typeDetails: {
      propertyType: 'apartment',
      bedroomCount: 2,
      bathroomCount: 1,
    },
  });
  const unqualifiedAtSecondArea = property({
    id: 'below-threshold',
    area: 'area-2',
    typeDetails: undefined,
  });
  const exactlyAtThreshold = property({
    id: 'at-threshold',
    area: 'area-1',
    typeDetails: undefined,
  });
  const source = new MyPropertiesMatchingSource({
    getProperties: async () => [
      unqualifiedAtSecondArea,
      exactlyAtThreshold,
      qualifiedAtPreferredArea,
    ],
  });
  const matching = new BrokerInitiatedMatching(
    storeFor(storedRequirement),
    source,
  );

  const result = await matching.runForRequirement(storedRequirement.id);

  assert.deepEqual(
    result.matches.map(match => match.propertyId),
    ['preferred', 'at-threshold'],
  );
  assert.equal(result.matches[0]?.eligible, true);
  assert.equal(result.matches[0]?.score, 90);
  assert.equal(result.matches[0]?.qualifies, true);
  assert.equal(result.matches[1]?.score, 70);
  assert.equal(result.matches[1]?.qualifies, true);
});

test('returns zero matches successfully when no candidate qualifies', async () => {
  const storedRequirement = requirement();
  const onlyBelowThreshold = property({
    id: 'below-threshold',
    area: 'area-2',
    typeDetails: undefined,
  });
  const source = new MyPropertiesMatchingSource({
    getProperties: async () => [onlyBelowThreshold],
  });
  const result = await new BrokerInitiatedMatching(
    storeFor(storedRequirement),
    source,
  ).runForRequirement(storedRequirement.id);

  assert.deepEqual(result.matches, []);
});

test('includes an otherwise matching chalet outside preferred locations at the unchanged threshold', async () => {
  const storedRequirement = requirement({
    propertyType: 'chalet',
    swimmingPool: true,
  });
  const outsidePreferredAreas = property({
    id: 'outside-area-chalet',
    area: 'area-outside',
    propertyType: 'chalet',
    typeDetails: {
      propertyType: 'chalet',
      bedroomCount: 3,
      bathroomCount: 2,
      hasPool: true,
      hasWaterfront: true,
    },
  });
  const source = new MyPropertiesMatchingSource({
    getProperties: async () => [outsidePreferredAreas],
  });
  const result = await new BrokerInitiatedMatching(
    storeFor(storedRequirement),
    source,
  ).runForRequirement(storedRequirement.id);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.propertyId, 'outside-area-chalet');
  assert.equal(result.matches[0]?.eligible, true);
  assert.equal(result.matches[0]?.score, 74.74);
  assert.equal(result.matches[0]?.qualifies, true);
});

test('preserves M2 tie ordering and has no persistence or automatic execution path', async () => {
  const storedRequirement = requirement({
    bedroomsMinimum: undefined,
    bathroomsMinimum: undefined,
    swimmingPool: undefined,
  });
  const first = property({ id: 'first', area: 'area-1' });
  const second = property({ id: 'second', area: 'area-1' });
  const store = storeFor(storedRequirement);
  const source = new MyPropertiesMatchingSource({
    getProperties: async () => [second, first],
  });
  const matching = new BrokerInitiatedMatching(store, source);

  const before = store.lookupIds.length;
  const result = await matching.runForRequirement(storedRequirement.id);

  assert.equal(before, 0);
  assert.deepEqual(result.matches.map(match => match.propertyId), ['second', 'first']);
  assert.equal(store.lookupIds.length, 1);
  assert.equal('saveRequirement' in matching, false);
  assert.equal('updateRequirement' in matching, false);
  const sourceText = await readFile(
    'services/brokerInitiatedMatching.ts',
    'utf8',
  );
  assert.doesNotMatch(sourceText, /saveRequirement|updateRequirement|setItem|runAsync/);
});

test('keeps M3 privacy projection and returns only transient M2 results', async () => {
  const storedRequirement = requirement({
    bedroomsMinimum: undefined,
    bathroomsMinimum: undefined,
    swimmingPool: undefined,
  });
  const localProperty = property({
    id: 'private-local',
    typeDetails: {
      propertyType: 'apartment',
      bedroomCount: 2,
      bathroomCount: 1,
      apartmentSubtype: 'duplex',
    },
    extra: {
      notes: 'free text must not reach transient results',
      attachments: [{
        id: 'attachment-1',
        kind: 'image',
        originalName: 'private.jpg',
        mimeType: 'image/jpeg',
        order: 0,
        managedUri: 'file://private.jpg',
        privacy: { classification: 'normal', disclosurePolicy: 'normal' },
      }],
      locationEnrichment: {
        exactLocation: 'private location',
      },
    },
  });
  const source = new MyPropertiesMatchingSource({
    getProperties: async () => [localProperty],
  });
  const result = await new BrokerInitiatedMatching(
    storeFor(storedRequirement),
    source,
  ).runForRequirement(storedRequirement.id);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.propertyId, 'private-local');
  assert.equal('property' in result.matches[0]!, false);
  assert.equal('candidate' in result.matches[0]!, false);
  assert.doesNotMatch(
    JSON.stringify(result),
    /broker-only note|private note|free text|attachment-1|private location/,
  );
});