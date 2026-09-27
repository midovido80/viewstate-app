import assert from 'node:assert/strict';
import test from 'node:test';
import type { SeekerRequirement } from '@workspace/property-domain';
import { buildStudioRequirement, createStudioFormValues } from '@/services/studioFormModel';
import { WebRequirementStore } from '@/services/requirementPersistence';
import { createPerson } from '@/services/people';
import { saveStudioRequirement } from '@/services/studioSave';
import {
  retryRequirementReadback,
  verifyUncertainRequirementWrite,
} from '@/services/requirementSaveOutcome';
import type { RequirementStore } from '@/services/requirementPersistence';
import type { AttachmentFileStore, LocalAttachment } from '@/services/attachmentOperations';
import { reorderAttachments, setAttachmentCover } from '@/services/attachmentOperations';
import {
  prepareRequirementAttachments,
  saveRequirementAttachments,
} from '@/services/studioAttachmentPersistence';

const requirement = (id: string): SeekerRequirement => ({
  id,
  seekerId: 'seeker-1',
  purpose: 'rent',
  propertyType: 'apartment',
  preferredAreaIds: ['area-1'],
  preferredAreaMode: 'specific_areas',
  budget: { minimum: 100, maximum: 200, currencyCode: 'KWD' },
  notes: '',
});

class MemoryRequirementStore implements RequirementStore {
  readonly records = new Map<string, SeekerRequirement>();
  saveErrorAfterWrite = false;
  updateResult: boolean | undefined;

  async saveRequirement(value: SeekerRequirement): Promise<void> {
    this.records.set(value.id, value);
    if (this.saveErrorAfterWrite) throw new Error('ambiguous commit');
  }
  async getRequirement(id: string): Promise<SeekerRequirement | null> {
    return this.records.get(id) ?? null;
  }
  async getRequirements(): Promise<SeekerRequirement[]> {
    return [...this.records.values()];
  }
  async getRequirementsForSeeker(seekerId: string): Promise<SeekerRequirement[]> {
    return (await this.getRequirements()).filter(item => item.seekerId === seekerId);
  }
  async updateRequirement(expected: SeekerRequirement, replacement: SeekerRequirement): Promise<boolean> {
    if (this.updateResult === false) return false;
    const current = this.records.get(expected.id);
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
    this.records.set(replacement.id, replacement);
    return true;
  }
}

function mockFileStore(events: string[] = []): AttachmentFileStore & {
  copyToRequirement(id: string, attachmentId: string, source: { uri: string; name: string; mimeType: string }): Promise<string>;
} {
  return {
    copyToProperty: async () => 'file:///unused',
    copyToRequirement: async (id, attachmentId, source) => {
      events.push(`copy:${id}:${attachmentId}:${source.mimeType}`);
      return `file:///requirements/${id}/attachments/${attachmentId}`;
    },
    delete: async uri => { events.push(`delete:${uri}`); },
  };
}

test('prepares media and PDF into requirement-ID managed storage', async () => {
  const events: string[] = [];
  const prepared = await prepareRequirementAttachments({
    requirementId: 'requirement-uuid',
    existing: [],
    sources: [
      { uri: 'content://picker/photo', name: 'room.jpg', mimeType: 'image/jpeg' },
      { uri: 'content://picker/brief', name: 'brief.pdf', mimeType: 'application/pdf' },
    ],
    createId: (() => { let index = 0; return () => `attachment-${++index}`; })(),
    fileStore: mockFileStore(events),
  });
  assert.equal(prepared[0].kind, 'image');
  assert.equal(prepared[1].kind, 'pdf');
  assert.equal(prepared[1].order, 1);
  assert(events.every(event => event.includes(':requirement-uuid:')));
});

test('reorders evidence and changes the cover only to an image', () => {
  const attachments = [
    { id: 'image', kind: 'image' as const, originalName: 'room.jpg', mimeType: 'image/jpeg', uri: 'file:///room', order: 0 },
    { id: 'pdf', kind: 'pdf' as const, originalName: 'brief.pdf', mimeType: 'application/pdf', uri: 'file:///brief', order: 1 },
  ];
  const reordered = reorderAttachments(attachments, ['pdf', 'image']);
  assert.deepEqual(reordered.map(item => [item.id, item.order]), [['pdf', 0], ['image', 1]]);
  assert.equal(setAttachmentCover(reordered, 'image').find(item => item.id === 'image')?.isCover, true);
  assert.throws(() => setAttachmentCover(reordered, 'pdf'), /ATTACHMENT_COVER_MUST_BE_IMAGE/);
});

test('creates a Requirement with the exact candidate ID and keeps newly copied media', async () => {
  const store = new MemoryRequirementStore();
  const events: string[] = [];
  const result = await saveRequirementAttachments({
    candidate: requirement('11111111-1111-4111-8111-111111111111'),
    baseline: null,
    store,
    fileStore: mockFileStore(events),
    sources: [{ uri: 'content://picker/photo', name: 'room.jpg', mimeType: 'image/jpeg' }],
  });
  assert.equal(result.status, 'saved');
  assert.equal(store.records.size, 1);
  assert.equal([...store.records.keys()][0], '11111111-1111-4111-8111-111111111111');
  assert.equal(events.some(event => event.startsWith('delete:')), false);
});

test('edits exact Requirement ID and deletes removed files only after successful persistence', async () => {
  const store = new MemoryRequirementStore();
  const requirementId = '22222222-2222-4222-8222-222222222222';
  const baseline = {
    ...requirement(requirementId),
    attachments: [{
      id: 'old-image', kind: 'image' as const, originalName: 'old.jpg', mimeType: 'image/jpeg',
      order: 0, managedUri: `file:///requirements/${requirementId}/attachments/old-image`,
      privacy: { classification: 'normal' as const, disclosurePolicy: 'normal' as const },
    }],
  };
  store.records.set(baseline.id, baseline);
  const events: string[] = [];
  const fileStore = mockFileStore(events);
  const originalDelete = fileStore.delete;
  fileStore.delete = async uri => {
    assert.equal((await store.getRequirement(baseline.id))?.attachments, undefined);
    await originalDelete(uri);
  };
  const result = await saveRequirementAttachments({
    candidate: requirement(baseline.id),
    baseline,
    store,
    fileStore,
  });
  assert.equal(result.status, 'saved');
  assert.deepEqual(events, [`delete:file:///requirements/${requirementId}/attachments/old-image`]);
});

test('distinguishes a missing Requirement from a false CAS conflict', async () => {
  const store = new MemoryRequirementStore();
  const missingId = '33333333-3333-4333-8333-333333333333';
  const missing = await saveRequirementAttachments({
    candidate: requirement(missingId),
    baseline: requirement(missingId),
    store,
    fileStore: mockFileStore(),
  });
  assert.equal(missing.status, 'missing');

  const baseline = requirement('44444444-4444-4444-8444-444444444444');
  store.records.set(baseline.id, baseline);
  store.updateResult = false;
  const conflict = await saveRequirementAttachments({
    candidate: { ...baseline, notes: 'changed' },
    baseline,
    store,
    fileStore: mockFileStore(),
  });
  assert.equal(conflict.status, 'conflict');
});

test('exact readback resolves an ambiguous committed create without deleting media', async () => {
  const store = new MemoryRequirementStore();
  store.saveErrorAfterWrite = true;
  const events: string[] = [];
  const result = await saveRequirementAttachments({
    candidate: requirement('55555555-5555-4555-8555-555555555555'),
    baseline: null,
    store,
    fileStore: mockFileStore(events),
    sources: [{ uri: 'content://picker/photo', name: 'room.jpg', mimeType: 'image/jpeg' }],
  });
  assert.equal(result.status, 'saved');
  assert.equal(events.some(event => event.startsWith('delete:')), false);
});

test('Studio save compares normalized real-store requirements across create, edit, and duplicate checks', async () => {
  const kv = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => kv.get(key) ?? null,
    setItem: async (key: string, value: string) => { kv.set(key, value); },
  };
  const seeker = createPerson({
    id: '88888888-8888-4888-8888-888888888888',
    classifications: ['seeker'],
    name: 'Studio test seeker',
    displayPhone: '55512345',
  });
  const normalizedStore = new WebRequirementStore(
    storage,
    () => ({ request: async (_name, _options, callback) => callback() }),
    { getPerson: async id => id === seeker.id ? seeker : null },
  );
  const studioStore = {
    getPerson: async (id: string) => id === seeker.id ? seeker : null,
    getRequirement: (id: string) => normalizedStore.getRequirement(id),
    saveRequirement: (value: SeekerRequirement) => normalizedStore.saveRequirement(value),
    updateRequirement: (expected: SeekerRequirement, replacement: SeekerRequirement) =>
      normalizedStore.updateRequirement(expected, replacement),
  };
  const values = {
    ...createStudioFormValues('wanted', 'rent'),
    preferredAreaMode: 'specific_areas' as const,
    preferredAreaIds: ['salmiya'],
    budgetMinimum: '100',
    budgetMaximum: '500',
    areaSquareMeters: '30',
    kitchen: 'required' as const,
    mapsLink: 'https://www.google.com/maps/place/Salmiya',
    description: 'Studio near work',
  };
  const id = '99999999-9999-4999-8999-999999999999';
  const candidate = buildStudioRequirement(values, id, seeker.id);
  const media: LocalAttachment = {
    id: 'real-store-studio-image',
    kind: 'image',
    originalName: 'studio.jpg',
    mimeType: 'image/jpeg',
    uri: `file:///requirements/${id}/attachments/studio.jpg`,
    order: 0,
    isCover: true,
  };
  const deleted: string[] = [];
  const fileStore: AttachmentFileStore = {
    copyToProperty: async () => 'file:///unused',
    copyToRequirement: async () => media.uri,
    delete: async uri => { deleted.push(uri); },
  };
  const saved = await saveStudioRequirement({
    candidate,
    baseline: null,
    store: studioStore,
    navigate: () => undefined,
    attachmentPersistence: { fileStore, preparedAttachments: [media] },
  });
  assert.deepEqual(saved, { status: 'saved' });
  const normalized = await normalizedStore.getRequirement(id);
  assert.ok(normalized);
  assert.equal(normalized.studioMapsLink, values.mapsLink);
  assert.equal(normalized.purpose === 'rent' ? normalized.rentalPeriodId : undefined, 'monthly');
  assert.ok(normalized.catalogPreferences?.some(item =>
    item.field === 'apartmentSubtype' && item.kind === 'choice' && item.value === 'studio'));
  assert.equal(normalized.attachments?.[0].id, media.id);
  assert.equal(normalized.attachments?.[0].isCover, true);
  assert.deepEqual(deleted, []);
  const readbackCandidate = Object.fromEntries(
    Object.entries({ ...candidate, attachments: normalized.attachments }).reverse(),
  ) as unknown as SeekerRequirement;
  assert.deepEqual(
    await verifyUncertainRequirementWrite({
      candidate: readbackCandidate,
      store: studioStore,
      navigate: () => undefined,
    }),
    { status: 'saved' },
  );
  assert.deepEqual(
    await retryRequirementReadback({
      candidate: readbackCandidate,
      store: studioStore,
      navigate: () => undefined,
    }),
    { status: 'saved' },
  );

  const edited = await saveStudioRequirement({
    candidate: { ...normalized, notes: 'Updated notes' },
    baseline: normalized,
    store: studioStore,
    navigate: () => undefined,
    attachmentPersistence: { fileStore, preparedAttachments: [] },
  });
  assert.deepEqual(edited, { status: 'saved' });
  const editedReadback = await normalizedStore.getRequirement(id);
  assert.equal(editedReadback?.notes, 'Updated notes');
  assert.deepEqual(editedReadback?.attachments, normalized.attachments);
  assert.equal(editedReadback?.studioMapsLink, values.mapsLink);

  const duplicate = await saveStudioRequirement({
    candidate: { ...candidate, notes: 'Different record under the same ID' },
    baseline: null,
    store: studioStore,
    navigate: () => undefined,
    attachmentPersistence: { fileStore, preparedAttachments: [media] },
  });
  assert.equal(duplicate.status, 'edit_conflict');
  assert.deepEqual(await normalizedStore.getRequirement(id), editedReadback);
  assert.deepEqual(deleted, [], 'preflight duplicate protection must retain the staged file');
});

test('definite Requirement write failure keeps prepared media available for safe retry', async () => {
  const store = new MemoryRequirementStore();
  store.saveRequirement = async () => undefined;
  const events: string[] = [];
  const media: LocalAttachment = {
    id: 'retryable-image',
    kind: 'image',
    originalName: 'retry.jpg',
    mimeType: 'image/jpeg',
    uri: 'file:///requirements/retryable/image.jpg',
    order: 0,
  };
  const outcome = await saveRequirementAttachments({
    candidate: requirement('66666666-6666-4666-8666-666666666666'),
    baseline: null,
    store,
    fileStore: mockFileStore(events),
    preparedAttachments: [media],
  });
  assert.equal(outcome.status, 'storage_failure');
  assert.deepEqual(events, [], 'the selected file remains available to retry the same exact candidate');
});