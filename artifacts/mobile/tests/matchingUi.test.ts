import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MATCH_ENGINE_VERSION, evaluateMatch } from '@workspace/property-domain';
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
    rentalPeriodId: 'monthly',
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
  assert.equal(result.value.bedroomsMinimum, 4);
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
  assert.ok(result.matches.every(match => match.engineVersion === MATCH_ENGINE_VERSION && match.qualifies));
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
      return { engineVersion: MATCH_ENGINE_VERSION, requirementId, matches: [], needsConfirmation: [] };
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
    engineVersion: MATCH_ENGINE_VERSION,
    category: 'direct', differenceCount: 0, unknownCount: 0,
    requirementId: REQUIREMENT_ID,
    propertyId,
    eligible: true,
    score,
    priceAmount: 650,
    qualifies: true,
    includedWeight: 100,
    locationRank: 0,
    ineligibilityReasons: [],
    explanations: [],
  });
  const groups = groupMatchAllResultsByPerson(
    [first.value, second.value, empty.value],
    people,
    [
      { engineVersion: MATCH_ENGINE_VERSION, requirementId: first.value.id, matches: [match('property-a', 92)], needsConfirmation: [] },
      { engineVersion: MATCH_ENGINE_VERSION, requirementId: second.value.id, matches: [{ ...match('property-b', 83), requirementId: second.value.id }], needsConfirmation: [] },
      { engineVersion: MATCH_ENGINE_VERSION, requirementId: empty.value.id, matches: [], needsConfirmation: [] },
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
  assert.match(screen, /MatchingResultCard/);
  assert.match(screen, /needsConfirmation/);
  assert.match(screen, /MATCH_ENGINE_VERSION/);
  assert.match(screen, /new BrokerInitiatedMatching\(store, candidateSource\)/);
  assert.match(screen, /runMatchingForAllRequirements/);
  assert.match(screen, /groupMatchAllResultsByPerson/);
  assert.match(screen, /runGenerationRef/);
  assert.match(screen, /store\.getProperty\(propertyId\)/);
  assert.match(
    screen,
    /return \(\) => \{\s*active = false;\s*runGenerationRef\.current \+= 1;/,
  );
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
  assert.match(screen, /router\.push\(`\/property\/\$\{encodeURIComponent\(propertyId\)\}`/);

  const explicitHandler = screen.indexOf('const runMatching = async (');
  const firstExecution = screen.indexOf('.runForRequirement(');
  assert.ok(explicitHandler >= 0 && firstExecution > explicitHandler);
  assert.doesNotMatch(
    screen,
    /saveRequirement|updateRequirement|saveProperty|setItem|setInterval|setTimeout|subscribe/,
  );
  assert.doesNotMatch(screen, /\.sort\(/);
});

test('Person entry scopes execution to the requested Requirement without falling back to Match All', async () => {
  const screen = await readFile('app/(tabs)/matching.tsx', 'utf8');
  assert.match(screen, /if \(requestedRequirementId\) setMode\('saved'\)/);
  assert.match(screen, /requirements\.filter\(item => item\.id === requestedRequirementId\)/);

  const explicitHandler = screen.indexOf('const runMatching = async (');
  const routeSelection = screen.indexOf("if (requestedRequirementId) setMode('saved')");
  const firstExecution = screen.indexOf('.runForRequirement(');
  assert.ok(routeSelection >= 0 && explicitHandler > routeSelection && firstExecution > explicitHandler);
});

test('Person Details keeps post-save feedback transient and uses classification actions', async () => {
  const personScreen = await readFile('app/person/[personId].tsx', 'utf8');
  assert.match(personScreen, /testID="person-action-confirmation"/);
  assert.match(personScreen, /testID="person-primary-action"/);
  assert.match(personScreen, /getPersonWantedRequirementRoute\(person\.id\)/);
  assert.doesNotMatch(personScreen, /person-saved-next-step|person-saved-add-property|person-add-wanted-studio/);
  assert.doesNotMatch(personScreen, /person-add-requirement/);
});

test('result grouping rejects stale engine versions and filters cross-request results', () => {
  const requirement = buildTransientRequirement({ id: REQUIREMENT_ID, seekerId: 'person-1', purpose: 'rent', propertyType: 'apartment', preferredAreaIds: [AREA_ID], minimumBudget: 500, maximumBudget: 800, notes: '' });
  assert.ok(requirement.ok); if (!requirement.ok) return;
  const people = [createPerson({ id: 'person-1', name: 'A', displayPhone: '+96550000001', classifications: ['seeker'], notes: '' })];
  const match = evaluateMatch(requirement.value, { property: matchingProperty('p') });
  const stale = groupMatchAllResultsByPerson([requirement.value], people, [{ engineVersion: 'old', requirementId: REQUIREMENT_ID, matches: [match], needsConfirmation: [] } as never]);
  assert.deepEqual(stale, []);
  const mixed = groupMatchAllResultsByPerson([requirement.value], people, [{ engineVersion: MATCH_ENGINE_VERSION, requirementId: REQUIREMENT_ID, matches: [match, { ...match, propertyId: 'other', requirementId: 'other' }], needsConfirmation: [] }]);
  assert.deepEqual(mixed[0].requirementGroups[0].matches.map(item => item.propertyId), ['p']);
});

test('cards and refinements handle repeated taps in both languages without changing records', async () => {
  const { registerHooks } = await import('node:module');
  const state = { ar: false, open: true };
  (globalThis as any).__matchingInteraction = state;
  (globalThis as any).React = { createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props: { ...props, children: children.length > 1 ? children : children[0] ?? props?.children } }) };
  const stubs = new Map<string, string>([
    ['react', `export const useState = () => [globalThis.__matchingInteraction.open, value => { globalThis.__matchingInteraction.open = value; }];`],
    ['react-native', `export const Text = 'Text'; export const View = 'View';`],
    ['@/components/Button', `export const Button = 'Button';`],
    ['@/components/PropertyFormCard', `export const PropertyFormCard = 'PropertyFormCard';`],
    ['@/components/ChoiceTile', `export const ChoiceGrid = 'ChoiceGrid'; export const ChoiceTile = 'ChoiceTile';`],
    ['@/components/KuwaitAreaSelector', `export const KuwaitAreaSelector = 'KuwaitAreaSelector';`],
    ['@/contexts/I18nContext', `export const useI18n = () => ({ language: globalThis.__matchingInteraction.ar ? 'ar' : 'en', isRTL: globalThis.__matchingInteraction.ar, fonts: { regular: 'r', medium: 'm', semiBold: 's', bold: 'b' }, t: key => key });`],
    ['@/hooks/useColors', `export const useColors = () => ({ foreground: '#111', mutedForeground: '#555' });`],
  ]);
  const hooks = registerHooks({
    resolve(specifier, context, next) { return stubs.has(specifier) ? { url: 'matching-interaction:' + encodeURIComponent(specifier), shortCircuit: true } : next(specifier, context); },
    load(url, context, next) { return url.startsWith('matching-interaction:') ? { format: 'module', source: stubs.get(decodeURIComponent(url.slice('matching-interaction:'.length)))!, shortCircuit: true } : next(url, context); },
  });
  const elements = (value: any): any[] => Array.isArray(value) ? value.flatMap(elements) : value?.props ? [value, ...elements(value.props.children)] : [];
  try {
    const { MatchingResultCard } = await import('../components/MatchingResultCard.tsx');
    const { MatchingRefinements } = await import('../components/MatchingRefinements.tsx');
    const r = buildTransientRequirement({ id: REQUIREMENT_ID, seekerId: 's', purpose: 'rent', propertyType: 'apartment', preferredAreaIds: [AREA_ID], minimumBudget: 500, maximumBudget: 800, notes: '' });
    assert.ok(r.ok); if (!r.ok) return;
    const p = matchingProperty('p'); const result = evaluateMatch(r.value, { property: p });
    const before = JSON.stringify([r.value, p]);
    for (const ar of [false, true]) {
      state.ar = ar; let opens = 0; let replacements = 0;
      const buttons: any[] = elements(MatchingResultCard({ result, rank: 1, property: p, requirement: r.value, onPress: () => opens++, onReplace: () => replacements++ })).filter(item => item.type === 'Button');
      assert.equal(buttons.length, 2);
      buttons[0].props.onPress(); buttons[0].props.onPress(); buttons[1].props.onPress(); buttons[1].props.onPress();
      assert.equal(opens, 2); assert.equal(replacements, 2);
      assert.equal(buttons[0].props.title, ar ? 'عرض العقار' : 'View property');
      let policy: import('@workspace/property-domain').MatchingPolicy = {};
      const render = () => elements(MatchingRefinements({ requirement: r.value, policy, busy: false, onChange: next => { policy = next; } }));
      render().find(item => item.props.optionId === 'budget')!.props.onPress(); assert.deepEqual(policy.strictFields, ['budget']);
      render().find(item => item.props.optionId === 'budget')!.props.onPress(); assert.deepEqual(policy.strictFields, []);
      render().find(item => item.type === 'KuwaitAreaSelector')!.props.onChange(['salmiya']); assert.deepEqual(policy.alternativeAreaIds, ['salmiya']);
    }
    assert.equal(JSON.stringify([r.value, p]), before);
  } finally { hooks.deregister(); }
});
