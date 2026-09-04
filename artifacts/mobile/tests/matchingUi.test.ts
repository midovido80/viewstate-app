import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type {
  MatchingPropertyCandidate,
  Property,
} from '@workspace/property-domain';
import { buildTransientRequirement } from '../services/matchingUi.ts';
import { BrokerInitiatedMatching } from '../services/brokerInitiatedMatching.ts';

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
  assert.match(screen, /new BrokerInitiatedMatching\(transientStore, candidateSource\)/);
  assert.match(screen, /Crypto\.randomUUID\(\)/);
  assert.match(screen, /flexDirection: isRTL \? 'row-reverse' : 'row'/);
  assert.match(i18n, /'matching\.title': 'Matching'/);
  assert.match(i18n, /'matching\.title': 'المطابقة'/);
  assert.match(i18n, /'matching\.results\.unknown': 'Unknown'/);
  assert.match(i18n, /'matching\.results\.unknown': 'غير معروف'/);

  const explicitHandler = screen.indexOf('const runMatching = async () =>');
  const firstExecution = screen.indexOf('.runForRequirement(');
  assert.ok(explicitHandler >= 0 && firstExecution > explicitHandler);
  assert.doesNotMatch(
    screen,
    /saveRequirement|updateRequirement|saveProperty|setItem|setInterval|setTimeout|subscribe/,
  );
  assert.doesNotMatch(screen, /\.sort\(/);
});

test('Person entry selects its requested saved Requirement without regressing normal M5 focus state', async () => {
  const screen = await readFile('app/(tabs)/matching.tsx', 'utf8');
  assert.match(screen, /if \(requestedRequirementId && loadedRequirements\.some/);
  assert.match(screen, /setMode\('saved'\);\s*setSelectedRequirementId\(requestedRequirementId\)/);
  assert.match(screen, /else \{\s*setSelectedRequirementId\(current => current \?\? loadedRequirements\[0\]\?\.id \?\? null\)/);
  assert.doesNotMatch(screen, /else \{\s*setMode\('saved'\)/);
  assert.doesNotMatch(screen, /setSelectedRequirementId\(\s*requestedRequirementId.*:\s*loadedRequirements\[0\]/s);

  const explicitHandler = screen.indexOf('const runMatching = async () =>');
  const routeSelection = screen.indexOf('setSelectedRequirementId(requestedRequirementId)');
  const firstExecution = screen.indexOf('.runForRequirement(');
  assert.ok(routeSelection >= 0 && explicitHandler > routeSelection && firstExecution > explicitHandler);
});

test('non-seeker post-save state does not render a disabled Requirement CTA', async () => {
  const personScreen = await readFile('app/person/[personId].tsx', 'utf8');
  assert.match(personScreen, /params\.saved === '1' && person\.classifications\.includes\('seeker'\)/);
  assert.doesNotMatch(personScreen, /testID="person-saved-add-requirement"[^>]*disabled=/);
});
