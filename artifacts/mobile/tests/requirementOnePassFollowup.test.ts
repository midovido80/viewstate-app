import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { CatalogPreference, SeekerRequirement } from '@workspace/property-domain';
import { buildPersonRequirement } from '../services/personRequirementWorkflow.ts';
import { getWantedApartmentSubtypeLabel } from '../services/propertyDetailPresentation.ts';
import {
  retryRequirementReadback,
  savePersonRequirement,
  tryStartRequirementSave,
} from '../services/requirementSaveOutcome.ts';

const requirementId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const seekerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function candidate(notes = ''): SeekerRequirement {
  const result = buildPersonRequirement(requirementId, seekerId, {
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [],
    preferredAreaMode: 'all_kuwait',
    minimumBudget: 100,
    maximumBudget: 500,
    currencyCode: 'KWD',
    notes,
    catalogPreferences: [
      { field: 'apartmentSubtype', kind: 'choice', value: 'standard_apartment' },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Test Requirement candidate must be valid.');
  return result.value;
}

test('Requirement enters its specifications page from explicit catalog context', async () => {
  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(route, /hasExplicitCatalogSelection\s*=\s*\(routePurpose === 'rent' \|\| routePurpose === 'buy'\)/);
  assert.match(route, /routePropertyType !== 'apartment' \|\| initialApartmentSubtype !== undefined/);
  assert.match(route, /const startsAtSpecifications = editing \|\| hasExplicitCatalogSelection/);
  assert.match(route, /useState\(startsAtSpecifications \? 3 : 0\)/);
  assert.match(route, /setStep\(startsAtSpecifications \? 3 : 0\)/);
  assert.match(route, /step === 3 && <View testID="requirement-core-step">[\s\S]*requirement-all-kuwait/);
  assert.match(route, /step === 5 && <><Text style=\{styles\.heading\}>\{label\('Review'/);
  assert.match(route, /projectRequirementIntent\(\{ purpose \}, language\)\.label.*propertyType\.\$\{propertyType\}/);
  assert.match(route, /choiceReviewLines\(leadingFields\)/);
  assert.match(route, /getWantedApartmentSubtypeLabel/);
  assert.match(route, /isWantedStudio\(baseline\)/, 'Studio Requirements retain their dedicated forwarding path');
});

test('Requirement Back revisits catalog choices while retaining the specification draft', async () => {
  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(route, /startsAtSpecifications && value === 1 \? 3 : value \+ 1/);
  assert.match(route, /startsAtSpecifications && step === 3\)\s*\{\s*setShowCatalogBackControls\(true\);\s*setStep\(1\)/);
  assert.match(route, /showCatalogBackControls && propertyType === 'apartment'/);
  assert.match(route, /changeApartmentSubtype/);
  assert.match(route, /setCatalog\(current => \[[\s\S]*getGenericRequirementApartmentSubtypePreference\(next\)/);
  assert.match(route, /onPress=\{previousStep\}/);
  assert.match(route, /if \(startsAtSpecifications && step === 3\)[\s\S]*setStep\(1\)/);
  assert.match(route, /setBedrooms\(''\); setBathrooms\(''\)/, 'only an explicit incompatible type transition clears incompatible values');
});

test('Requirement save submit is single-flight and a confirmed draft cannot be resubmitted', async () => {
  const value = candidate();
  const records = new Map<string, SeekerRequirement>();
  let writes = 0;
  let releaseWrite!: () => void;
  const pendingWrite = new Promise<void>(resolve => { releaseWrite = resolve; });
  const store = {
    getPerson: async (id: string) => id === seekerId ? { id, classifications: ['seeker'] } : null,
    getRequirement: async (id: string) => records.get(id) ?? null,
    saveRequirement: async (requirement: SeekerRequirement) => {
      writes += 1;
      await pendingWrite;
      records.set(requirement.id, requirement);
    },
    updateRequirement: async () => false,
  };
  const flight = { current: false };
  let committed = false;
  const submit = async () => {
    if (!tryStartRequirementSave(flight, committed, false)) return;
    try {
      const outcome = await savePersonRequirement({
        candidate: value,
        baseline: null,
        store,
        navigate: () => undefined,
      });
      committed = outcome.status === 'saved';
    } finally {
      flight.current = false;
    }
  };
  const first = submit();
  await submit();
  assert.equal(writes, 1, 'rapid repeated presses start one write');
  releaseWrite();
  await first;
  await submit();
  assert.equal(writes, 1, 'a confirmed draft is not persisted a second time');

  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(route, /tryStartRequirementSave\(saveFlight, !!confirmedRequirement\.current/);
  assert.match(route, /disabled=\{saving \|\| !!confirmedRequirement\.current/);
  assert.match(route, /savePersonRequirement\(\{/);
});

test('Requirement readback recovery uses the exact draft ID and does not write again', async () => {
  const value = candidate();
  let writes = 1;
  const expectedReads: string[] = [];
  const recovered = await retryRequirementReadback({
    candidate: value,
    store: {
      getRequirement: async id => {
        expectedReads.push(id);
        return value;
      },
    },
    navigate: () => undefined,
  });
  assert.deepEqual(recovered, { status: 'saved' });
  assert.deepEqual(expectedReads, [requirementId]);
  assert.equal(writes, 1, 'recovery only confirms the existing write');
  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(route, /retryRequirementReadback\(\{ candidate: target, store, navigate \}\)/);
  assert.match(route, /setRecoveryAction\('readback'\)/);
  assert.match(route, /save_readback_failed/);
  assert.match(route, /localizedRequirementIssue/);
  assert.doesNotMatch(route, /console\.(log|error)\(/);
});

test('editing a Requirement begins in specifications and retains its stable ID', async () => {
  const baseline = candidate('existing draft');
  const replacement = { ...baseline, notes: 'updated' };
  let updates = 0;
  let creates = 0;
  const outcome = await savePersonRequirement({
    candidate: replacement,
    baseline,
    store: {
      getPerson: async () => ({ id: seekerId, classifications: ['seeker'] }),
      getRequirement: async id => {
        assert.equal(id, requirementId);
        return replacement;
      },
      saveRequirement: async () => { creates += 1; },
      updateRequirement: async (expected, next) => {
        updates += 1;
        assert.equal(expected.id, requirementId);
        assert.equal(next.id, requirementId);
        return true;
      },
    },
    navigate: () => undefined,
  });
  assert.deepEqual(outcome, { status: 'saved' });
  assert.equal(replacement.id, baseline.id);
  assert.equal(updates, 1);
  assert.equal(creates, 0);
  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(route, /const startsAtSpecifications = editing \|\| hasExplicitCatalogSelection/);
  assert.match(route, /draftId\.current = editing \? routeRequirementId : generateDomainId\(\)/);
  assert.match(route, /baseline\?\.id \?\? draftId\.current/);
});

test('Requirement detail/review subtype labels are semantic without changing the Apartment type', async () => {
  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const standard = [{
    field: 'apartmentSubtype' as const,
    kind: 'choice' as const,
    value: 'standard_apartment',
  }];
  const studio = [{ ...standard[0], value: 'studio' }];
  const duplex = [{ ...standard[0], value: 'duplex' }];
  const wanted = (catalogPreferences: readonly CatalogPreference[]) => ({
    propertyType: 'apartment' as const,
    catalogPreferences,
  });
  assert.equal(getWantedApartmentSubtypeLabel(wanted(standard), 'en'), 'Standard Apartment');
  assert.equal(getWantedApartmentSubtypeLabel(wanted(standard), 'ar'), 'شقة عادية');
  assert.equal(getWantedApartmentSubtypeLabel(wanted(studio), 'en'), 'Studio');
  assert.equal(getWantedApartmentSubtypeLabel(wanted(studio), 'ar'), 'استوديو');
  assert.equal(getWantedApartmentSubtypeLabel(wanted(duplex), 'en'), 'Duplex');
  assert.equal(getWantedApartmentSubtypeLabel(wanted(duplex), 'ar'), 'دوبلكس');
  assert.match(route, /t\(`propertyType\.\$\{propertyType\}`\)/, 'Review keeps canonical Apartment as the property type');
  assert.match(route, /const apartmentSubtypeLabel = \(value: string\) => getWantedApartmentSubtypeLabel/);
  assert.match(route, /item\.field === 'apartmentSubtype' \? apartmentSubtypeLabel\(item\.value\)/);
});

test('a confirmed Requirement with a no-op navigation stays committed against a second submit', async () => {
  const value = candidate();
  const records = new Map<string, SeekerRequirement>();
  let writes = 0;
  const store = {
    getPerson: async (id: string) => id === seekerId ? { id, classifications: ['seeker'] } : null,
    getRequirement: async (id: string) => records.get(id) ?? null,
    saveRequirement: async (requirement: SeekerRequirement) => {
      writes += 1;
      records.set(requirement.id, requirement);
    },
    updateRequirement: async () => false,
  };
  const flight = { current: false };
  let confirmedRequirement: SeekerRequirement | null = null;
  if (tryStartRequirementSave(flight, !!confirmedRequirement, false, false)) {
    const outcome = await savePersonRequirement({
      candidate: value,
      baseline: null,
      store,
      navigate: () => undefined,
    });
    if (outcome.status === 'saved') confirmedRequirement = value;
    flight.current = false;
  }
  assert.equal(writes, 1);
  assert.equal(confirmedRequirement?.id, requirementId);
  assert.equal(
    tryStartRequirementSave(flight, !!confirmedRequirement, false, false),
    false,
    'the committed sentinel blocks Save after navigation resolves without leaving the route',
  );
  assert.equal(writes, 1);

  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const savedBranchStart = route.indexOf("if (outcome.status === 'saved') {");
  const savedBranchEnd = route.indexOf("} else if (outcome.status === 'missing_person')", savedBranchStart);
  const savedBranch = route.slice(savedBranchStart, savedBranchEnd);
  assert.match(savedBranch, /confirmedRequirement\.current = requirement/);
  assert.doesNotMatch(savedBranch, /confirmedRequirement\.current = null/);
  assert.match(route, /tryStartRequirementSave\(saveFlight, !!confirmedRequirement\.current/);
  assert.match(route, /disabled=\{saving \|\| !!confirmedRequirement\.current/);
});