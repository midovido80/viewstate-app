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
  buildTransientRequirement,
  groupMatchAllResultsByPerson,
  runMatchingForAllRequirements,
  validMatchingRequirements,
} from '../services/matchingUi.ts';
import { BrokerInitiatedMatching } from '../services/brokerInitiatedMatching.ts';
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
  assert.match(screen, /new BrokerInitiatedMatching\(store, candidateSource\)/);
  assert.match(screen, /runMatchingForAllRequirements/);
  assert.match(screen, /groupMatchAllResultsByPerson/);
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

test('Person entry opens the saved Match All mode without selecting one Requirement', async () => {
  const screen = await readFile('app/(tabs)/matching.tsx', 'utf8');
  assert.match(screen, /if \(requestedRequirementId\) setMode\('saved'\)/);
  assert.doesNotMatch(screen, /selectedRequirementId|setSelectedRequirementId/);

  const explicitHandler = screen.indexOf('const runMatching = async () =>');
  const routeSelection = screen.indexOf("if (requestedRequirementId) setMode('saved')");
  const firstExecution = screen.indexOf('.runForRequirement(');
  assert.ok(routeSelection >= 0 && explicitHandler > routeSelection && firstExecution > explicitHandler);
});

test('non-seeker post-save state does not render a disabled Requirement CTA', async () => {
  const personScreen = await readFile('app/person/[personId].tsx', 'utf8');
  assert.match(personScreen, /params\.saved === '1' && person\.classifications\.includes\('seeker'\)/);
  assert.doesNotMatch(personScreen, /testID="person-saved-add-requirement"[^>]*disabled=/);
});
