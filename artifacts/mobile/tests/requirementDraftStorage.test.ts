import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  clearRequirementDraftBeforeNavigation,
  clearRequirementDraftIfUnchanged,
  listRequirementDraftsForOwner,
  loadRequirementDraft,
  saveRequirementDraft,
  type RequirementDraftPayload,
  type RequirementDraftStorage,
} from '@/services/requirementDraft';
import { buildPersonRequirement } from '@/services/personRequirementWorkflow';
import { retryRequirementReadback, savePersonRequirement } from '@/services/requirementSaveOutcome';

class MemoryStorage implements RequirementDraftStorage {
  constructor(private readonly values = new Map<string, string>()) {}

  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
  async getAllKeys() { return [...this.values.keys()]; }
  restart() { return new MemoryStorage(this.values); }
}

const blankPayload: RequirementDraftPayload = {
  purpose: 'rent',
  propertyType: 'apartment',
  areaIds: [],
  bedrooms: '',
  bathrooms: '',
  masterBedrooms: '',
  livingRooms: '',
  parking: '',
  floorNumber: '',
  requiredArea: '',
  driverRoom: false,
  catalog: [],
  amenities: [],
  excludedAmenities: [],
  services: [],
  constraintStrengths: {},
  minimumBudget: '',
  maximumBudget: '',
  cadence: 'monthly',
  notes: '',
};

test('Requirement drafts resume after storage restart without inventing budget or area values', async () => {
  const firstProcessStorage = new MemoryStorage();
  await saveRequirementDraft({
    ownerId: 'person-1',
    draftId: 'draft-1',
    finalRequirementId: 'requirement-1',
    payload: { ...blankPayload, bedrooms: '2' },
  }, firstProcessStorage);

  const afterRestart = await loadRequirementDraft(
    'person-1',
    'draft-1',
    firstProcessStorage.restart(),
  );
  assert.ok(afterRestart);
  assert.equal(afterRestart.ownerId, 'person-1');
  assert.equal(afterRestart.finalRequirementId, 'requirement-1');
  assert.equal(afterRestart.payload.bedrooms, '2');
  assert.equal(afterRestart.payload.minimumBudget, '');
  assert.equal(afterRestart.payload.maximumBudget, '');
  assert.deepEqual(afterRestart.payload.areaIds, []);
  assert.equal(afterRestart.payload.areaMode, undefined);
});

test('Requirement draft listing is isolated by exact Person owner identity', async () => {
  const storage = new MemoryStorage();
  await saveRequirementDraft({
    ownerId: 'person-a',
    draftId: 'draft-a',
    finalRequirementId: 'requirement-a',
    payload: blankPayload,
  }, storage);
  await saveRequirementDraft({
    ownerId: 'person-b',
    draftId: 'draft-b',
    finalRequirementId: 'requirement-b',
    payload: blankPayload,
  }, storage);

  assert.deepEqual((await listRequirementDraftsForOwner('person-a', storage)).map(item => item.draftId), ['draft-a']);
  assert.deepEqual((await listRequirementDraftsForOwner('person-b', storage)).map(item => item.draftId), ['draft-b']);
  assert.equal(await loadRequirementDraft('person-a', 'draft-b', storage), null);
});

test('finalization cleanup removes only the exact unchanged draft revision', async () => {
  const storage = new MemoryStorage();
  const first = await saveRequirementDraft({
    ownerId: 'person-1',
    draftId: 'draft-1',
    finalRequirementId: 'requirement-1',
    payload: blankPayload,
  }, storage);
  const newer = await saveRequirementDraft({
    ownerId: 'person-1',
    draftId: 'draft-1',
    finalRequirementId: 'requirement-1',
    payload: { ...blankPayload, notes: 'Changed after final save began.' },
  }, storage);
  assert.equal(await clearRequirementDraftIfUnchanged('person-1', 'draft-1', first.revision, storage), false);
  assert.equal((await loadRequirementDraft('person-1', 'draft-1', storage))?.revision, newer.revision);
  assert.equal(await clearRequirementDraftIfUnchanged('person-1', 'draft-1', newer.revision, storage), true);
  assert.equal(await loadRequirementDraft('person-1', 'draft-1', storage), null);
});

test('an incomplete draft stays outside canonical save, and confirmed exact-ID readback clears it before resuming navigation', async () => {
  const storage = new MemoryStorage();
  const finalRequirementId = '11111111-1111-4111-8111-111111111111';
  const savedDraft = await saveRequirementDraft({
    ownerId: 'person-1',
    draftId: 'draft-1',
    finalRequirementId,
    payload: blankPayload,
  }, storage);
  const incomplete = buildPersonRequirement('22222222-2222-4222-8222-222222222222', 'person-1', {
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: [],
    minimumBudget: undefined,
    maximumBudget: undefined,
    currencyCode: 'KWD',
    notes: '',
  });
  assert.equal(incomplete.ok, false);
  assert.equal((await loadRequirementDraft('person-1', 'draft-1', storage))?.revision, savedDraft.revision);

  const valid = buildPersonRequirement(finalRequirementId, 'person-1', {
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaIds: ['salmiya'],
    minimumBudget: 100,
    maximumBudget: 500,
    currencyCode: 'KWD',
    notes: '',
  });
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  let stored: typeof valid.value | null = null;
  let exposeReadback = false;
  const store = {
    getPerson: async () => ({ classifications: ['seeker'] }),
    getRequirement: async () => exposeReadback ? stored : null,
    saveRequirement: async (value: typeof valid.value) => { stored = value; },
    updateRequirement: async () => false,
  };
  let navigated = false;
  const onConfirmedReadback = async () => {
    await clearRequirementDraftBeforeNavigation({
      ownerId: 'person-1',
      draftId: 'draft-1',
      expectedRevision: savedDraft.revision,
      navigate: () => { navigated = true; },
    }, storage);
  };
  const unconfirmed = await savePersonRequirement({
    candidate: valid.value,
    baseline: null,
    store,
    navigate: onConfirmedReadback,
  });
  assert.equal(unconfirmed.status, 'saved_readback_failed');
  assert.equal(navigated, false);
  assert.ok(await loadRequirementDraft('person-1', 'draft-1', storage));

  exposeReadback = true;
  const confirmed = await retryRequirementReadback({
    candidate: valid.value,
    store,
    navigate: onConfirmedReadback,
  });
  assert.equal(confirmed.status, 'saved');
  assert.equal(navigated, true);
  assert.equal(await loadRequirementDraft('person-1', 'draft-1', storage), null);
});

test('new Requirement editor saves and resumes only the selected owner/draft from Person Details', async () => {
  const editor = await readFile('app/requirement/[requirementId].tsx', 'utf8');
  const person = await readFile('app/person/[personId].tsx', 'utf8');
  assert.match(editor, /testID="requirement-save-draft"/);
  assert.match(editor, /saveRequirementDraft\(\{\s*ownerId: owner\.id,\s*draftId: draftId\.current/);
  assert.match(editor, /loadRequirementDraft\(owner\.id, draftFromRoute\)/);
  assert.match(editor, /areaIds: \[\.\.\.areas\]/);
  assert.match(editor, /minimumBudget: minimum/);
  assert.match(editor, /maximumBudget: maximum/);
  assert.match(person, /listRequirementDraftsForOwner\(saved\.id\)/);
  assert.match(person, /testID=\{`person-resume-requirement-draft-\$\{draft\.draftId\}`\}/);
  assert.match(person, /draftId: draft\.draftId/);
});