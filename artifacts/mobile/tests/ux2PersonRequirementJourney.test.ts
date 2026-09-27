import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import './platformModuleStubs.ts';
import { PROPERTY_TYPES, normalizeSeekerRequirement, type SeekerRequirement } from '@workspace/property-domain';
import { buildPersonRequirement, formValuesFromRequirement } from '../services/personRequirementWorkflow.ts';
import { PERSON_CLASSIFICATIONS, createPerson, personCanBePropertySource } from '../services/people.ts';
import { getApplicablePropertyFormFields } from '../services/propertyFormCatalog.ts';
import {
  RequirementRouteGeneration,
  retryRequirementNavigation,
  retryRequirementReadback,
  savePersonRequirement,
  shouldRenderRequirementRecoveryControls,
  tryStartRequirementSave,
} from '../services/requirementSaveOutcome.ts';

const seekerId = 'ux2-seeker';
const rentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const buyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('UX-2 keeps Property source roles independent from Person classifications', () => {
  assert.deepEqual(PERSON_CLASSIFICATIONS, ['seeker', 'owner', 'broker', 'real_estate_company', 'building_guard']);
  const person = createPerson({
    id: seekerId, classifications: ['seeker', 'broker'], name: '  Contact Name  ',
    displayPhone: '50000000', notes: 'private note',
  });
  assert.equal(person.name, '  Contact Name  ');
  assert.equal(person.displayPhone, '50000000');
  assert.equal(personCanBePropertySource(person, 'broker'), true);
  assert.equal(personCanBePropertySource(person, 'owner'), true);
});

test('UX-2 Rent preferences preserve zero, false, absence, and exact/custom values after reopening', () => {
  const result = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 0, maximumBudget: 900, currencyCode: 'KWD', notes: '',
    bedroomsMinimum: 0, swimmingPool: false, preferredAmenityExclusions: ['balcony'],
    catalogPreferences: [
      { field: 'floorNumber', kind: 'number', comparison: 'exact', value: 7 },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const restored = formValuesFromRequirement(result.value);
  assert.equal(restored.bedroomsMinimum, 0);
  assert.equal(restored.swimmingPool, false);
  assert.equal(restored.gym, undefined);
  assert.deepEqual(restored.preferredAmenityExclusions, ['balcony']);
  assert.equal(restored.catalogPreferences?.[0].kind, 'number');
  assert.deepEqual(restored.catalogPreferences, result.value.catalogPreferences);
  assert.equal(result.value.id, rentId);
  assert.equal(result.value.seekerId, seekerId);
});

test('UX-2 Buy and Floor preferences persist under canonical applicability without Rent fields', () => {
  assert.ok(PROPERTY_TYPES.includes('floor'));
  const residential = getApplicablePropertyFormFields('floor', 'residential').map(item => item.field);
  const commercial = getApplicablePropertyFormFields('floor', 'commercial').map(item => item.field);
  assert.ok(residential.includes('bedroomCount'));
  assert.ok(!commercial.includes('bedroomCount'));
  assert.ok(commercial.includes('commercialActivity'));
  const buy = buildPersonRequirement(buyId, seekerId, {
    purpose: 'buy', propertyType: 'floor', floorUse: 'commercial',
    preferredAreaIds: ['hawalli'], minimumBudget: 1, maximumBudget: 100000,
    currencyCode: 'KWD', notes: 'office preference',
    catalogPreferences: [
      { field: 'commercialActivity', kind: 'choice', value: 'retail' },
    ],
  });
  assert.equal(buy.ok, true);
  if (!buy.ok) return;
  assert.equal(buy.value.floorUse, 'commercial');
  assert.equal(buy.value.purpose, 'buy');
  assert.equal('bedroomsMinimum' in buy.value, false);
  assert.deepEqual(formValuesFromRequirement(buy.value).catalogPreferences, buy.value.catalogPreferences);
  const invalid = normalizeSeekerRequirement({
    ...buy.value, catalogPreferences: [{ field: 'bedroomCount', kind: 'number', comparison: 'exact', value: 2 }],
  });
  assert.equal(invalid.ok, false);
});

test('UX-2 source role travels with the Person through every existing capture route', async () => {
  for (const route of ['index', 'transaction', 'property-type', 'price', 'location', 'summary']) {
    const source = await readFile(`app/capture/${route}.tsx`, 'utf8');
    assert.match(source, /useLocalSearchParams/, `${route} must read its route context`);
    assert.match(source, /linkPersonId/, `${route} must retain the Person link`);
    assert.match(source, /sourceRole/, `${route} must retain the selected source role`);
  }

  const transaction = await readFile('app/capture/transaction.tsx', 'utf8');
  assert.match(transaction, /firstParam\(params\.linkPersonId\)/);
  assert.match(transaction, /firstParam\(params\.sourceRole\)/);
  assert.match(transaction, /pathname: '\/capture\/property-type'/);
  assert.match(transaction, /params:\s*\{[\s\S]*firstParam\(params\.linkPersonId\)[\s\S]*firstParam\(params\.sourceRole\)[\s\S]*\}/);

  const propertyType = await readFile('app/capture/property-type.tsx', 'utf8');
  assert.match(propertyType, /const linkPersonId = firstParam\(params\.linkPersonId\)/);
  assert.match(propertyType, /const sourceRole = firstParam\(params\.sourceRole\)/);
  assert.match(propertyType, /const routeParams = \{[\s\S]*\.\.\.\(linkPersonId \? \{ linkPersonId \} : \{\}\),[\s\S]*\.\.\.\(sourceRole \? \{ sourceRole \} : \{\}\),[\s\S]*\};/);
  assert.match(propertyType, /params:\s*\{\s*\.\.\.routeParams/);

  const entry = await readFile('app/person/[personId].tsx', 'utf8');
  assert.match(entry, /const eligibleSourceRoles = person\.classifications\.filter/);
  assert.match(entry, /eligibleSourceRoles\.map\(role =>/);
  assert.match(entry, /person\.classifications\.map\(classification =>/);
  assert.match(entry, /person\.classifications\.includes\(selectedSourceRole\)/);
  assert.match(entry, /pathname: '\/capture'/);
  assert.match(entry, /linkPersonId: person\.id/);
  assert.match(entry, /sourceRole: role/);
  assert.match(entry, /role: selectedSourceRole/);
  assert.doesNotMatch(entry, /person-saved-add-property|person-add-wanted-studio|person-add-requirement/);
  for (const route of ['index', 'summary']) {
    const source = await readFile(`app/capture/${route}.tsx`, 'utf8');
    assert.match(source, /setPropertySource\(/);
    assert.match(source, /linkPersonToProperty\(/);
  }
});

test('UX-2 Requirement save requires an existing Person, not seeker classification', async () => {
  const built = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: '',
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  let writes = 0;
  const baseStore = {
    getRequirement: async () => null,
    saveRequirement: async () => { writes += 1; },
    updateRequirement: async () => true,
  };
  const missing = await savePersonRequirement({
    candidate: built.value, baseline: null,
    store: { ...baseStore, getPerson: async () => null },
    navigate: () => assert.fail('must not navigate'),
  });
  assert.deepEqual(missing, { status: 'missing_person' });
  const ownerRequirement = await savePersonRequirement({
    candidate: built.value, baseline: null,
    store: {
      ...baseStore,
      getPerson: async () => ({ classifications: ['owner'] }),
      getRequirement: async () => built.value,
    },
    navigate: () => undefined,
  });
  assert.deepEqual(ownerRequirement, { status: 'saved' });
  assert.equal(writes, 1);
});

test('UX-2 storage and readback failures keep writes bounded and allow confirmation-only recovery', async () => {
  const built = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: '',
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  let writes = 0;
  let reads = 0;
  let navigations = 0;
  let unavailable = true;
  const store = {
    getPerson: async () => ({ classifications: ['seeker'] }),
    getRequirement: async (id: string) => {
      reads += 1;
      assert.equal(id, built.value.id);
      if (unavailable) throw new Error('private storage detail');
      return built.value;
    },
    saveRequirement: async () => { writes += 1; },
    updateRequirement: async () => true,
  };
  const readbackFailed = await savePersonRequirement({
    candidate: built.value, baseline: null, store,
    navigate: () => { navigations += 1; },
  });
  assert.deepEqual(readbackFailed, { status: 'saved_readback_failed' });
  assert.equal(writes, 1);
  unavailable = false;
  const recovered = await retryRequirementReadback({
    candidate: built.value, store,
    navigate: () => { navigations += 1; },
  });
  assert.deepEqual(recovered, { status: 'saved' });
  assert.equal(writes, 1, 'readback recovery must never write a second time');
  assert.equal(reads, 2);
  assert.equal(navigations, 1);
});

test('UX-2 rejected write checks its exact ID and recovers a committed write without creating again', async () => {
  const built = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: '',
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  let writes = 0;
  let reads = 0;
  let navigations = 0;
  const store = {
    getPerson: async () => ({ classifications: ['seeker'] }),
    getRequirement: async (id: string) => {
      reads += 1;
      assert.equal(id, rentId);
      return built.value;
    },
    saveRequirement: async () => { writes += 1; throw new Error('private storage detail'); },
    updateRequirement: async () => true,
  };
  const outcome = await savePersonRequirement({
    candidate: built.value, baseline: null, store,
    navigate: () => { navigations += 1; },
  });
  assert.deepEqual(outcome, { status: 'saved' });
  assert.equal(writes, 1);
  assert.equal(reads, 1, 'uncertain write is checked by exact ID');
  assert.equal(navigations, 1);
});

test('UX-2 unresolved writes require exact-ID verification before a manual retry', async () => {
  const built = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: '',
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  let writes = 0;
  let reads = 0;
  const store = {
    getPerson: async () => ({ classifications: ['seeker'] }),
    getRequirement: async (id: string) => { reads += 1; assert.equal(id, rentId); return null; },
    saveRequirement: async () => { writes += 1; throw new Error('private storage detail'); },
    updateRequirement: async () => true,
  };
  const outcome = await savePersonRequirement({
    candidate: built.value, baseline: null, store,
    navigate: () => assert.fail('must not navigate'),
  });
  assert.deepEqual(outcome, { status: 'storage_failure', retryAllowed: true });
  assert.equal(writes, 1);
  assert.equal(reads, 1, 'the exact-ID lookup must happen before retry can be enabled');
});

test('UX-2 edit updates retain the same Requirement ID and verify its seeker ownership', async () => {
  const original = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: 'old',
  });
  const replacement = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: 'updated',
  });
  assert.equal(original.ok, true);
  assert.equal(replacement.ok, true);
  if (!original.ok || !replacement.ok) return;
  let updatedIds: string[] = [];
  let creates = 0;
  const outcome = await savePersonRequirement({
    candidate: replacement.value,
    baseline: original.value,
    store: {
      getPerson: async () => ({ classifications: ['seeker'] }),
      getRequirement: async id => { assert.equal(id, rentId); return replacement.value; },
      saveRequirement: async () => { creates += 1; },
      updateRequirement: async (expected, next) => {
        updatedIds = [expected.id, next.id];
        return true;
      },
    },
    navigate: () => undefined,
  });
  assert.deepEqual(outcome, { status: 'saved' });
  assert.deepEqual(updatedIds, [rentId, rentId]);
  assert.equal(creates, 0);
});

test('UX-2 competing edit is a non-retryable conflict and preserves the draft for an explicit reopen', async () => {
  const original = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: 'latest saved notes',
  });
  const pendingEdit = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: 'my unsaved notes',
  });
  assert.equal(original.ok, true);
  assert.equal(pendingEdit.ok, true);
  if (!original.ok || !pendingEdit.ok) return;
  let updates = 0;
  let creates = 0;
  const outcome = await savePersonRequirement({
    candidate: pendingEdit.value,
    baseline: original.value,
    store: {
      getPerson: async () => ({ classifications: ['seeker'] }),
      getRequirement: async () => original.value,
      saveRequirement: async () => { creates += 1; },
      updateRequirement: async () => { updates += 1; return false; },
    },
    navigate: () => assert.fail('conflict must not navigate without the user choosing'),
  });
  assert.deepEqual(outcome, { status: 'edit_conflict' });
  assert.equal(updates, 1);
  assert.equal(creates, 0);
  assert.equal(pendingEdit.value.notes, 'my unsaved notes', 'pending editor values remain intact');
  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(route, /editConflictRequirement\.current = requirement/);
  assert.match(route, /save_edit_conflict/);
  assert.match(route, /testID="requirement-reopen-latest"/);
  assert.match(route, /onPress=\{confirmReopenLatest\}/);
  assert.match(route, /if \(window\.confirm\(message\)\) void openPersonDetails\(\)/);
  assert.match(route, /style: 'cancel'/);
  assert.match(route, /will discard them/);
  assert.match(route, /disabled=\{!!confirmedRequirement\.current \|\| !!uncertainRequirement\.current \|\| !!editConflictRequirement\.current\}/);
  assert.doesNotMatch(route, /outcome\.status === 'edit_conflict'[\s\S]{0,180}setNotes\(/);
});

test('UX-2 route generation prevents stale async saves from navigating or applying outcomes', async () => {
  const built = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: '',
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const generation = new RequirementRouteGeneration();
  const routeA = generation.advance();
  let finishWrite!: () => void;
  const pendingWrite = new Promise<void>(resolve => { finishWrite = resolve; });
  let navigations = 0;
  let stateApplications = 0;
  const store = {
    getPerson: async () => ({ classifications: ['seeker'] }),
    getRequirement: async () => built.value,
    saveRequirement: async () => pendingWrite,
    updateRequirement: async () => true,
  };
  const oldRouteSave = savePersonRequirement({
    candidate: built.value,
    baseline: null,
    store,
    navigate: () => {
      if (generation.isCurrent(routeA)) navigations += 1;
    },
  }).then(outcome => {
    if (generation.isCurrent(routeA)) stateApplications += 1;
    return outcome;
  });
  generation.advance();
  finishWrite();
  assert.deepEqual(await oldRouteSave, { status: 'saved' });
  assert.equal(navigations, 0);
  assert.equal(stateApplications, 0);
  const routeB = generation.capture();
  let finishReadback!: (requirement: SeekerRequirement) => void;
  const pendingReadback = new Promise<SeekerRequirement>(resolve => { finishReadback = resolve; });
  let recoveryNavigations = 0;
  let recoveryStateApplications = 0;
  const oldRouteRecovery = retryRequirementReadback({
    candidate: built.value,
    store: { getRequirement: async () => pendingReadback },
    navigate: () => {
      if (generation.isCurrent(routeB)) recoveryNavigations += 1;
    },
  }).then(outcome => {
    if (generation.isCurrent(routeB)) recoveryStateApplications += 1;
    return outcome;
  });
  generation.advance();
  finishReadback(built.value);
  assert.deepEqual(await oldRouteRecovery, { status: 'saved' });
  assert.equal(recoveryNavigations, 0);
  assert.equal(recoveryStateApplications, 0);
  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  assert.match(route, /useLayoutEffect\(\(\) => \{\s*routeGeneration\.current\.advance\(\)/);
  assert.match(route, /return \(\) => \{ routeGeneration\.current\.advance\(\); \};/);
  assert.match(route, /if \(isCurrentRoute\(\)\) applySaveOutcome\(outcome, result\.value\)/);
  assert.match(route, /if \(isCurrentRoute\(\)\) applySaveOutcome\(outcome, target\)/);
  assert.match(route, /: undefined/);
});

test('UX-2 concurrent and post-commit submits cannot launch a second write', async () => {
  const flight = { current: false };
  let releaseWrite!: () => void;
  const pendingWrite = new Promise<void>(resolve => { releaseWrite = resolve; });
  let writes = 0;
  const submit = async (committed = false, uncertain = false) => {
    if (!tryStartRequirementSave(flight, committed, uncertain)) return;
    try {
      writes += 1;
      await pendingWrite;
    } finally {
      flight.current = false;
    }
  };
  const first = submit();
  await submit();
  assert.equal(writes, 1, 'a second submit during an active write is ignored');
  releaseWrite();
  await first;
  await submit(true);
  await submit(false, true);
  assert.equal(tryStartRequirementSave(flight, false, false, true), false);
  assert.equal(writes, 1, 'committed, unresolved, or edit-conflicted outcomes never start another write');
});

test('UX-2 failed navigation offers navigation-only recovery and route displays localized safe messages', async () => {
  const built = buildPersonRequirement(rentId, seekerId, {
    purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'],
    minimumBudget: 1, maximumBudget: 100, currencyCode: 'KWD', notes: '',
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  let writes = 0;
  let navigateFails = true;
  const store = {
    getPerson: async () => ({ classifications: ['seeker'] }),
    getRequirement: async () => built.value,
    saveRequirement: async () => { writes += 1; },
    updateRequirement: async () => true,
  };
  const failed = await savePersonRequirement({
    candidate: built.value, baseline: null, store,
    navigate: () => { if (navigateFails) throw new Error('private navigation detail'); },
  });
  assert.deepEqual(failed, { status: 'saved_navigation_failed' });
  navigateFails = false;
  assert.deepEqual(await retryRequirementNavigation(() => { if (navigateFails) throw new Error('private'); }), { status: 'saved' });
  assert.equal(writes, 1, 'navigation retry cannot create a second Requirement');
  const route = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const messages = await readFile('services/requirementIssueMessage.ts', 'utf8');
  assert.match(route, /testID="requirement-error">\{error\}/);
  assert.match(route, /testID="requirement-save-recovery"/);
  assert.match(route, /testID="requirement-open-person-details"/);
  assert.match(route, /shouldRenderRequirementRecoveryControls\(\!\!error, recoveryAction\)/);
  assert.equal(shouldRenderRequirementRecoveryControls(false, 'readback'), true, 'recovery control remains visible after its message is dismissed');
  assert.equal(shouldRenderRequirementRecoveryControls(false, null), false);
  assert.equal(tryStartRequirementSave({ current: false }, true, false), false, 'dismissing the error cannot unlock a confirmed save');
  assert.match(route, /tryStartRequirementSave\(saveFlight, !!confirmedRequirement\.current, !!uncertainRequirement\.current, !!editConflictRequirement\.current\)/);
  assert.match(route, /disabled=\{!!confirmedRequirement\.current \|\| !!uncertainRequirement\.current \|\| !!editConflictRequirement\.current\}/);
  const saveStart = route.indexOf('const save = async () =>');
  assert.ok(route.indexOf('tryStartRequirementSave(saveFlight, !!confirmedRequirement.current, !!uncertainRequirement.current, !!editConflictRequirement.current)', saveStart) < route.indexOf('const result = candidate();', saveStart));
  for (const code of ['save_missing_person', 'save_non_seeker', 'save_edit_conflict', 'save_storage_failure', 'save_readback_failed', 'save_navigation_failed']) {
    assert.match(messages, new RegExp(`${code}: \\['[^']+', '[^']+'\\]`));
  }
  assert.doesNotMatch(messages, /private storage detail|private navigation detail/);
});