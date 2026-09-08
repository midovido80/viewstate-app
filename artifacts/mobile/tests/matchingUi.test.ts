import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type {
  MatchResult,
  MatchingPropertyCandidate,
  Property,
  SeekerRequirement,
} from '@workspace/property-domain';
import {
  beginMatchingRun,
  buildMatchAllPresentation,
  buildTransientRequirement,
  groupMatchAllResultsByPerson,
  invalidateMatchingRun,
  isCurrentMatchingRun,
  loadMatchingDataSnapshot,
  runSavedMatchingSnapshot,
  runMatchingForAllRequirements,
  scopeMatchingSnapshotToRequirement,
  storesForMatchingSnapshot,
  validMatchingRequirements,
} from '../services/matchingUi.ts';
import { BrokerInitiatedMatching } from '../services/brokerInitiatedMatching.ts';
import { MyPropertiesMatchingSource } from '../services/myPropertiesMatchingSource.ts';
import { createPerson } from '../services/people.ts';

const REQUIREMENT_ID = '55555555-5555-4555-8555-555555555555';
const AREA_ID = 'abdullah_al_salem';

function matchingProperty(id: string): Property {
  return {
    core: {
      id,
      propertyType: 'apartment',
      locationArea: { id: AREA_ID },
    },
    activeOffer: {
      id: `${id}-offer`,
      propertyCoreId: id,
      transaction: 'rent',
      rentalPrice: { amount: 650, currencyCode: 'KWD' },
      rentalPeriodId: 'monthly',
    },
    typeDetails: {
      propertyType: 'apartment',
      bedroomCount: 2,
      bathroomCount: 2,
    },
  };
}

test('builds the complete approved transient Rent Requirement without persistence', () => {
  const result = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'seeker-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: 'literal broker note',
    bedroomsMinimum: 2,
    bathroomsMinimum: 1,
    occupancy: 'family',
    swimmingPool: false,
    gym: true,
    seaView: false,
    centralAC: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    id: REQUIREMENT_ID,
    seekerId: 'seeker-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [AREA_ID],
    budget: { minimum: 500, maximum: 800, currencyCode: 'KWD' },
    notes: 'literal broker note',
    bedroomsMinimum: 2,
    bathroomsMinimum: 1,
    occupancy: 'family',
    swimmingPool: false,
    gym: true,
    seaView: false,
    centralAC: true,
  });
});

test('builds Buy without carrying any Rent-only input into M1', () => {
  const result = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'seeker-1',
    purpose: 'buy',
    propertyType: 'villa',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 100_000,
    maximumBudget: 500_000,
    notes: '',
    bedroomsMinimum: 4,
    occupancy: 'family',
    swimmingPool: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal('bedroomsMinimum' in result.value, false);
  assert.equal('occupancy' in result.value, false);
  assert.equal('swimmingPool' in result.value, false);
});

test('builds transient Shop criteria without carrying residential Rent input', () => {
  const result = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'seeker-1',
    purpose: 'rent',
    propertyType: 'shop',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
    minimumBuiltUpAreaSquareMeters: 80,
    maximumBuiltUpAreaSquareMeters: 120,
    commercialActivity: 'Coffee & Gifts',
    floorNumber: 0,
    minimumFrontageWidthMeters: 8,
    bedroomsMinimum: 9,
    bathroomsMinimum: 9,
    occupancy: 'family',
    swimmingPool: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.minimumBuiltUpAreaSquareMeters, 80);
  assert.equal(result.value.maximumBuiltUpAreaSquareMeters, 120);
  assert.equal(result.value.commercialActivity, 'Coffee & Gifts');
  assert.equal(result.value.floorNumber, 0);
  assert.equal(result.value.minimumFrontageWidthMeters, 8);
  for (const field of ['bedroomsMinimum', 'bathroomsMinimum', 'occupancy', 'swimmingPool']) {
    assert.equal((result.value as unknown as Record<string, unknown>)[field], undefined);
  }
});

test('builds min-only, max-only, and bounded commercial area ranges in Quick Match', () => {
  for (const propertyType of ['shop', 'office', 'floor'] as const) {
    for (const range of [
      { minimumBuiltUpAreaSquareMeters: 80, maximumBuiltUpAreaSquareMeters: 120 },
      { minimumBuiltUpAreaSquareMeters: 80 },
      { maximumBuiltUpAreaSquareMeters: 120 },
      {},
    ]) {
      const result = buildTransientRequirement({
        id: REQUIREMENT_ID,
        seekerId: 'seeker-1',
        purpose: 'buy',
        propertyType,
        ...(propertyType === 'floor' ? { floorUse: 'commercial' as const } : {}),
        preferredAreaIds: [AREA_ID],
        minimumBudget: 100_000,
        maximumBudget: 500_000,
        notes: '',
        ...range,
      });
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      assert.equal(
        result.value.minimumBuiltUpAreaSquareMeters,
        range.minimumBuiltUpAreaSquareMeters,
      );
      assert.equal(
        result.value.maximumBuiltUpAreaSquareMeters,
        range.maximumBuiltUpAreaSquareMeters,
      );
    }
  }
});

test('Quick Match keeps Residential and Commercial Floor criteria separate', () => {
  const residential = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'seeker-1',
    purpose: 'rent',
    propertyType: 'floor',
    floorUse: 'residential',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
    bedroomsMinimum: 3,
    bathroomsMinimum: 2,
    occupancy: 'family',
    minimumBuiltUpAreaSquareMeters: 100,
    commercialActivity: 'Retail',
  });
  assert.equal(residential.ok, true);
  if (residential.ok) {
    assert.equal(residential.value.floorUse, 'residential');
    assert.equal((residential.value as unknown as Record<string, unknown>).bedroomsMinimum, 3);
    assert.equal(residential.value.minimumBuiltUpAreaSquareMeters, undefined);
    assert.equal(residential.value.commercialActivity, undefined);
  }

  const commercial = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'seeker-1',
    purpose: 'rent',
    propertyType: 'floor',
    floorUse: 'commercial',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
    bedroomsMinimum: 3,
    occupancy: 'family',
    minimumBuiltUpAreaSquareMeters: 100,
    maximumBuiltUpAreaSquareMeters: 200,
    commercialActivity: 'Retail',
    floorNumber: 2,
    minimumFrontageWidthMeters: 8,
  });
  assert.equal(commercial.ok, true);
  if (commercial.ok) {
    assert.equal(commercial.value.floorUse, 'commercial');
    assert.equal(commercial.value.minimumBuiltUpAreaSquareMeters, 100);
    assert.equal(commercial.value.commercialActivity, 'Retail');
    assert.equal(commercial.value.floorNumber, 2);
    assert.equal(commercial.value.minimumFrontageWidthMeters, 8);
    assert.equal((commercial.value as unknown as Record<string, unknown>).bedroomsMinimum, undefined);
    assert.equal((commercial.value as unknown as Record<string, unknown>).occupancy, undefined);
  }
});

test('Quick Match rejects malformed commercial area text instead of omitting it', async () => {
  const screen = await readFile('app/(tabs)/matching.tsx', 'utf8');
  assert.match(screen, /matching-floor-use-\$\{value\}/);
  assert.match(screen, /propertyType === 'floor' && !floorUse/);
  assert.match(screen, /propertyType === 'floor' && floorUse === 'commercial'/);
  assert.match(screen, /parseOptionalRequirementNumber\(shopArea\)/);
  assert.match(screen, /parseOptionalRequirementNumber\(shopAreaMaximum\)/);
  assert.match(
    screen,
    /!parsedCommercialAreaMinimum\.ok \|\| !parsedCommercialAreaMaximum\.ok/,
  );
  assert.match(
    screen,
    /minimumBuiltUpAreaSquareMeters: parsedCommercialAreaMinimum\.value/,
  );
  assert.match(
    screen,
    /maximumBuiltUpAreaSquareMeters: parsedCommercialAreaMaximum\.value/,
  );
});

test('rejects non-canonical areas and incomplete or reversed budgets', () => {
  const nonCanonical = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'seeker-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: ['not-approved'],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
  });
  assert.equal(nonCanonical.ok, false);
  if (!nonCanonical.ok) {
    assert.ok(nonCanonical.issues.some(issue => issue.code === 'invalid_area_id'));
  }

  const reversedBudget = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'seeker-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 900,
    maximumBudget: 800,
    notes: '',
  });
  assert.equal(reversedBudget.ok, false);
  if (!reversedBudget.ok) {
    assert.ok(reversedBudget.issues.some(issue => issue.code === 'invalid_budget'));
  }
});

test('passes a quick transient Requirement through M4 without a Match store', async () => {
  const transient = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'manual-seeker',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
    bedroomsMinimum: 2,
    bathroomsMinimum: 1,
  });
  assert.equal(transient.ok, true);
  if (!transient.ok) return;

  const candidates: MatchingPropertyCandidate[] = [
    {
      property: matchingProperty('qualified-property'),
      evidence: { bedrooms: 2, bathrooms: 2 },
    },
  ];
  const result = await new BrokerInitiatedMatching(
    {
      getRequirement: async id => id === transient.value.id
        ? transient.value
        : null,
    },
    {
      getCandidates: async () => candidates,
    },
  ).runForRequirement(transient.value.id);

  assert.deepEqual(result.matches.map(match => match.propertyId), [
    'qualified-property',
  ]);
  assert.ok(result.matches.every(match => match.score >= 70 && match.qualifies));
});

test('Match All runs every valid Requirement in deterministic input order', async () => {
  const first = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'person-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
  });
  const second = buildTransientRequirement({
    id: '66666666-6666-4666-8666-666666666666',
    seekerId: 'person-2',
    purpose: 'buy',
    propertyType: 'villa',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 100000,
    maximumBudget: 200000,
    notes: '',
  });
  assert.ok(first.ok && second.ok);
  if (!first.ok || !second.ok) return;
  const called: string[] = [];
  const runs = await runMatchingForAllRequirements(
    [first.value, second.value],
    async requirementId => {
      called.push(requirementId);
      return { requirementId, matches: [] };
    },
  );
  assert.deepEqual(called, [first.value.id, second.value.id]);
  assert.deepEqual(runs.map(run => run.requirementId), called);
});

test('exact Requirement context scopes runs without narrowing the Property candidate snapshot', async () => {
  const requirement = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'person-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
  });
  assert.equal(requirement.ok, true);
  if (!requirement.ok) return;
  const other = { ...requirement.value, id: 'other-requirement' };
  const candidate = matchingProperty('context-property');
  const snapshot = {
    requirements: [requirement.value, other],
    people: [createPerson({
      id: 'person-1',
      name: 'Context seeker',
      displayPhone: '+96550000001',
      classifications: ['seeker'],
      notes: '',
    })],
    properties: [candidate],
  };
  const scoped = scopeMatchingSnapshotToRequirement(snapshot, REQUIREMENT_ID);
  assert.ok(scoped);
  assert.deepEqual(scoped.requirements.map(item => item.id), [REQUIREMENT_ID]);
  assert.equal(scoped.properties[0], candidate);
  assert.equal(scopeMatchingSnapshotToRequirement(snapshot, 'deleted-id'), null);

  const matched = await runSavedMatchingSnapshot(scoped);
  assert.deepEqual(matched.runs.map(run => run.requirementId), [REQUIREMENT_ID]);
  assert.equal(matched.presentation.properties[0], candidate);
  assert.equal(matched.runs[0]?.matches[0]?.propertyId, candidate.core.id);
});

test('a slower matching run cannot overwrite a newer run or a mode change', async () => {
  const generation = { current: 0 };
  let releaseOlder!: () => void;
  const olderGate = new Promise<void>(resolve => {
    releaseOlder = resolve;
  });
  let displayed = '';
  const older = beginMatchingRun(generation);
  const olderCompletion = olderGate.then(() => {
    if (isCurrentMatchingRun(generation, older)) displayed = 'older';
  });
  const newer = beginMatchingRun(generation);
  if (isCurrentMatchingRun(generation, newer)) displayed = 'newer';
  releaseOlder();
  await olderCompletion;
  assert.equal(displayed, 'newer');

  invalidateMatchingRun(generation);
  assert.equal(isCurrentMatchingRun(generation, newer), false);
});

test('Match All evaluates and displays one captured cross-area snapshot', async () => {
  const storedRequirement = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'person-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: ['abdullah_al_salem'],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
    bedroomsMinimum: 2,
    bathroomsMinimum: 2,
  });
  assert.equal(storedRequirement.ok, true);
  if (!storedRequirement.ok) return;

  const person = createPerson({
    id: 'person-1',
    name: 'Snapshot seeker',
    displayPhone: '+96550000001',
    classifications: ['seeker'],
    notes: '',
  });
  const outsideProperty: Property = {
    ...matchingProperty('cross-area-property'),
    core: {
      ...matchingProperty('cross-area-property').core,
      locationArea: { id: 'adailiya' },
    },
    typeDetails: {
      propertyType: 'apartment',
      bedroomCount: 2,
      bathroomCount: 2,
    },
  };
  let currentProperties: Property[] = [outsideProperty];
  const snapshot = await loadMatchingDataSnapshot({
    getRequirements: async () => [storedRequirement.value],
    getPeople: async () => [person],
    getProperties: async () => currentProperties,
  });

  currentProperties = [{
    ...outsideProperty,
    core: {
      ...outsideProperty.core,
      locationArea: { id: 'abdullah_al_salem' },
    },
  }];
  const snapshotStores = storesForMatchingSnapshot(snapshot);
  const matching = new BrokerInitiatedMatching(
    snapshotStores.requirementStore,
    new MyPropertiesMatchingSource(snapshotStores.propertyStore),
  );
  const runs = await runMatchingForAllRequirements(
    snapshot.requirements,
    requirementId => matching.runForRequirement(requirementId),
  );
  const groups = groupMatchAllResultsByPerson(
    snapshot.requirements,
    snapshot.people,
    runs,
  );
  const result = groups[0]?.requirementGroups[0]?.matches[0];
  const displayedProperty = snapshot.properties.find(
    property => property.core.id === result?.propertyId,
  );
  const location = result?.explanations.find(
    item => item.criterion === 'ordered_location',
  );
  const bathrooms = result?.explanations.find(
    item => item.criterion === 'bathrooms',
  );

  assert.equal(displayedProperty?.core.locationArea.id, 'adailiya');
  assert.equal(result?.locationRank, null);
  assert.equal(location?.status, 'not_met');
  assert.equal(location?.awardedPoints, 6);
  assert.equal(location?.possiblePoints, 30);
  assert.equal(bathrooms?.status, 'matched');
  assert.equal(bathrooms?.awardedPoints, 10);
  assert.equal(result?.qualifies, true);
  assert.ok((result?.score ?? 0) >= 70);
});

test('same-area snapshot keeps the full preferred-location score', async () => {
  const storedRequirement = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'person-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: ['abdullah_al_salem'],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
  });
  assert.equal(storedRequirement.ok, true);
  if (!storedRequirement.ok) return;
  const sameAreaProperty = matchingProperty('same-area-property');
  const snapshot = await loadMatchingDataSnapshot({
    getRequirements: async () => [storedRequirement.value],
    getPeople: async () => [],
    getProperties: async () => [sameAreaProperty],
  });
  const snapshotStores = storesForMatchingSnapshot(snapshot);
  const result = await new BrokerInitiatedMatching(
    snapshotStores.requirementStore,
    new MyPropertiesMatchingSource(snapshotStores.propertyStore),
  ).runForRequirement(storedRequirement.value.id);
  const location = result.matches[0]?.explanations.find(
    item => item.criterion === 'ordered_location',
  );

  assert.equal(result.matches[0]?.locationRank, 1);
  assert.equal(location?.status, 'matched');
  assert.equal(location?.awardedPoints, 30);
  assert.equal(location?.possiblePoints, 30);
});

test('Match All presentation keeps result labels on the exact scored snapshot', () => {
  const requirement = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'person-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: ['bayan'],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
  });
  assert.equal(requirement.ok, true);
  if (!requirement.ok) return;
  const person = createPerson({
    id: 'person-1',
    name: 'Snapshot seeker',
    displayPhone: '+96550000001',
    classifications: ['seeker'],
    notes: '',
  });
  const scoredProperty = {
    ...matchingProperty('stable-property-id'),
    core: {
      ...matchingProperty('stable-property-id').core,
      locationArea: { id: 'bayan' },
    },
  };
  const laterRevision = {
    ...scoredProperty,
    core: {
      ...scoredProperty.core,
      locationArea: { id: 'daiya' },
    },
  };
  const result: MatchResult = {
    requirementId: requirement.value.id,
    propertyId: scoredProperty.core.id,
    eligible: true,
    qualifies: true,
    score: 100,
    includedWeight: 100,
    locationRank: 1,
    priceDistanceFromBudgetMidpoint: 0,
    ineligibilityReasons: [],
    explanations: [],
  };
  const presentation = buildMatchAllPresentation(
    {
      requirements: [requirement.value],
      people: [person],
      properties: [scoredProperty],
    },
    [{ requirementId: requirement.value.id, matches: [result] }],
  );

  assert.equal(laterRevision.core.locationArea.id, 'daiya');
  assert.equal(
    presentation.properties.find(item => item.core.id === result.propertyId)
      ?.core.locationArea.id,
    'bayan',
  );
  assert.equal(
    presentation.groups[0]?.requirementGroups[0]?.requirement.preferredAreaIds[0],
    'bayan',
  );
});

test('Match All groups multiple Requirements once per Person and omits empty Persons', () => {
  const first = buildTransientRequirement({
    id: REQUIREMENT_ID,
    seekerId: 'person-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
  });
  const second = buildTransientRequirement({
    id: '66666666-6666-4666-8666-666666666666',
    seekerId: 'person-1',
    purpose: 'buy',
    propertyType: 'villa',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 100000,
    maximumBudget: 200000,
    notes: '',
  });
  const empty = buildTransientRequirement({
    id: '77777777-7777-4777-8777-777777777777',
    seekerId: 'person-2',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [AREA_ID],
    minimumBudget: 500,
    maximumBudget: 800,
    notes: '',
  });
  assert.ok(first.ok && second.ok && empty.ok);
  if (!first.ok || !second.ok || !empty.ok) return;
  const people = [
    createPerson({
      id: 'person-1',
      name: 'Ahmed',
      displayPhone: '+96550000001',
      classifications: ['seeker'],
      notes: '',
    }),
    createPerson({
      id: 'person-2',
      name: 'No matches',
      displayPhone: '+96550000002',
      classifications: ['seeker'],
      notes: '',
    }),
  ];
  const match = (propertyId: string, score: number): MatchResult => ({
    requirementId: REQUIREMENT_ID,
    propertyId,
    eligible: true,
    score,
    qualifies: true,
    includedWeight: 100,
    locationRank: 0,
    priceDistanceFromBudgetMidpoint: 0,
    ineligibilityReasons: [],
    explanations: [],
  });
  const groups = groupMatchAllResultsByPerson(
    [first.value, second.value, empty.value],
    people,
    [
      { requirementId: first.value.id, matches: [match('property-a', 92)] },
      { requirementId: second.value.id, matches: [match('property-b', 83)] },
      { requirementId: empty.value.id, matches: [] },
    ],
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.person.id, 'person-1');
  assert.deepEqual(
    groups[0]?.requirementGroups.map(group => group.matches[0]?.propertyId),
    ['property-a', 'property-b'],
  );
});

test('Match All filters invalid saved Requirements without changing them', () => {
  const valid = {
    id: REQUIREMENT_ID,
    seekerId: 'person-1',
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [AREA_ID],
    budget: { minimum: 500, maximum: 800, currencyCode: 'KWD' },
    notes: '',
  } as SeekerRequirement;
  const invalid = {
    ...valid,
    id: '66666666-6666-4666-8666-666666666666',
    preferredAreaIds: ['not-canonical'],
  };
  assert.deepEqual(validMatchingRequirements([valid, invalid]), [valid]);
  assert.deepEqual(invalid.preferredAreaIds, ['not-canonical']);
});

test('wires the manual bilingual M5 tab and transient results without automatic matching', async () => {
  const [screen, tabLayout, i18n] = await Promise.all([
    readFile('app/(tabs)/matching.tsx', 'utf8'),
    readFile('app/(tabs)/_layout.tsx', 'utf8'),
    readFile('contexts/I18nContext.tsx', 'utf8'),
  ]);

  assert.match(tabLayout, /name="matching"/);
  assert.match(tabLayout, /name="target"/);
  assert.match(screen, /testID="matching-mode-saved"/);
  assert.match(screen, /testID="matching-mode-quick"/);
  assert.match(screen, /testID="matching-run"/);
  assert.match(screen, /testID="matching-zero-results"/);
  assert.match(screen, /result\.explanations\.map/);
  assert.match(screen, /matching\.results\.unknown/);
  assert.match(screen, /MATCH_QUALIFICATION_THRESHOLD/);
  assert.match(screen, /loadMatchingDataSnapshot\(store\)/);
  assert.match(screen, /runSavedMatchingSnapshot\(targetSnapshot\)/);
  assert.match(screen, /scopeMatchingSnapshotToRequirement\(snapshot, requestedRequirementId\)/);
  assert.match(screen, /new BrokerInitiatedMatching\(transientStore, candidateSource\)/);
  assert.match(screen, /Crypto\.randomUUID\(\)/);
  assert.match(screen, /flexDirection: isRTL \? 'row-reverse' : 'row'/);
  assert.match(i18n, /'matching\.title': 'Matching'/);
  assert.match(i18n, /'matching\.title': 'المطابقة'/);
  assert.match(i18n, /'matching\.results\.unknown': 'Unknown'/);
  assert.match(i18n, /'matching\.results\.unknown': 'غير معروف'/);
  assert.match(i18n, /'matching\.runAll': 'Match all'/);
  assert.match(i18n, /'matching\.runAll': 'مطابقة الكل'/);
  assert.match(screen, /router\.push\(`\/person\/\$\{encodeURIComponent\(group\.person\.id\)\}`\)/);
  assert.match(screen, /router\.push\(`\/property\/\$\{encodeURIComponent\(result\.propertyId\)\}`\)/);

  const explicitHandler = screen.indexOf('const runMatching = async () =>');
  const firstExecution = screen.indexOf('.runForRequirement(');
  assert.ok(explicitHandler >= 0 && firstExecution > explicitHandler);
  assert.doesNotMatch(
    screen,
    /saveRequirement|updateRequirement|saveProperty|setItem|setInterval|setTimeout|subscribe/,
  );
  assert.doesNotMatch(screen, /\.sort\(/);
});

test('Requirement route opens exact saved context and stale IDs cannot fall back to Match All', async () => {
  const screen = await readFile('app/(tabs)/matching.tsx', 'utf8');
  assert.match(screen, /if \(requestedRequirementId\) \{/);
  assert.match(screen, /scopeMatchingSnapshotToRequirement\(snapshot, requestedRequirementId\)/);
  assert.match(screen, /setError\(t\('brain\.results\.unavailable'\)\)/);
  assert.match(screen, /runSavedMatchingSnapshot\(scoped\)/);
  assert.match(screen, /'matching\.saved\.exactTitle'/);
  assert.match(screen, /'matching\.runExact'/);
  assert.doesNotMatch(screen, /selectedRequirementId|setSelectedRequirementId/);
});

test('every valid Person role can create and view Requirements', async () => {
  const personScreen = await readFile('app/person/[personId].tsx', 'utf8');
  const matchingScreen = await readFile('app/(tabs)/matching.tsx', 'utf8');
  assert.match(personScreen, /params\.saved === '1' \?/);
  assert.match(personScreen, /testID="person-add-requirement"/);
  assert.match(personScreen, /store\.getRequirementsForSeeker\(id\)/);
  assert.doesNotMatch(personScreen, /classifications\.includes\('seeker'\)/);
  assert.doesNotMatch(personScreen, /testID="person-saved-add-requirement"[^>]*disabled=/);
  assert.match(matchingScreen, /const requirementPeople = useMemo\(\(\) => people, \[people\]\)/);
  assert.doesNotMatch(matchingScreen, /people\.filter\(person => person\.classifications\.includes\('seeker'\)\)/);
});
