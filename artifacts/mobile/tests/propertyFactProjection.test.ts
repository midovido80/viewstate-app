import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTypeDetails, type Property } from '@workspace/property-domain';
import {
  hasUnresolvedPropertyFactConflicts,
  projectPropertyFacts,
  isDemoFeatureSuppressed,
  writeCanonicalArea,
} from '../services/propertyFactProjection';
import { buildPropertyUpdateCandidate, createEditDraft, migratePropertyEditDraft, createPropertyUpdateOperation, executePropertyUpdateRecovery } from '../services/propertyUpdateRecovery';

const property = (overrides: Partial<Property> = {}) => ({
  core: {
    id: 'property-1',
    propertyType: 'apartment',
    locationArea: { id: 'salmiya' },
  },
  activeOffer: {
    id: 'offer-1',
    propertyCoreId: 'property-1',
    transaction: 'rent',
    rentalPrice: { amount: 100, currencyCode: 'KWD' },
    rentalPeriodId: 'monthly',
  },
  ...overrides,
}) as Property;

test('legacy-only area is a read fallback and zero remains present', () => {
  const result = projectPropertyFacts(property({
    demoCapture: { categoryId: 'family_apartment', areaSquareMeters: 0, areaUnit: 'square_meter' },
  }));
  assert.equal(result.areaSquareMeters, 0);
  assert.equal(result.conflicts.length, 0);
});

test('square-foot legacy areas convert once to deterministic square meters for read and edit', () => {
  const legacy = property({
    areaSquareMeters: 1000,
    areaUnit: 'square_foot',
    demoCapture: { categoryId: 'family_apartment', areaSquareMeters: 1000, areaUnit: 'square_foot' },
  });
  const projected = projectPropertyFacts(legacy);
  assert.equal(projected.areaSquareMeters, 92.903);
  assert.equal(projected.areaUnit, 'square_meter');
  assert.equal(projected.conflicts.length, 0);
  const draft = createEditDraft(legacy);
  assert.equal(draft.choices.areaSquareMeters, 92.903);
  assert.equal(draft.choices.areaUnit, 'square_meter');
  const candidate = buildPropertyUpdateCandidate(legacy, draft.choices);
  assert.equal(candidate.areaSquareMeters, 92.903);
  assert.equal(candidate.areaUnit, 'square_meter');
});

test('feature suppression is property-type aware and preserves apartment Pool', () => {
  assert.equal(isDemoFeatureSuppressed('pool', 'apartment', {}), false);
  assert.equal(isDemoFeatureSuppressed('pool', 'apartment', { hasPool: true }), false);
  assert.equal(isDemoFeatureSuppressed('pool', 'chalet', {}), true);
  assert.equal(isDemoFeatureSuppressed('pool', 'villa', { hasPool: true }), true);
  assert.equal(isDemoFeatureSuppressed('private_pool', 'villa', { hasPool: true }), false);
});

test('legacy chalet Pool projects into one canonical detail when typeDetails is absent', () => {
  const result = projectPropertyFacts(property({
    core: { id: 'property-1', propertyType: 'chalet', locationArea: { id: 'salmiya' } },
    demoCapture: { categoryId: 'chalet', selectedFeatures: ['pool'] },
  }));
  assert.equal(result.templateFacts.hasPool, true);
  assert.equal(result.templateFacts.privatePool, undefined);
});

test('canonical type-details snapshot prevents mapped legacy resurrection while legacy-only Villa facts fall back', () => {
  const demoCapture = {
    categoryId: 'villa',
    numericValues: { bedroomCount: 2, masterBedroomCount: 1 },
    choices: { furnishing: 'furnished' },
    selectedFeatures: ['garden'],
  } as const;
  const legacyVilla = property({
    core: { id: 'property-1', propertyType: 'villa', locationArea: { id: 'salmiya' } },
    demoCapture,
  });
  const legacyFacts = projectPropertyFacts(legacyVilla).templateFacts;
  assert.equal(legacyFacts.bedroomCount, 2);
  assert.equal(legacyFacts.furnishing, 'furnished');
  assert.equal(legacyFacts.hasGarden, true);

  const canonicalBaseline = property({
    core: { id: 'property-1', propertyType: 'villa', locationArea: { id: 'salmiya' } },
    typeDetails: {
      propertyType: 'villa',
      bedroomCount: 2,
      furnishing: 'furnished',
      hasGarden: true,
    },
    demoCapture,
  });
  const draft = createEditDraft(canonicalBaseline);
  const deletedCandidate = buildPropertyUpdateCandidate(canonicalBaseline, {
    ...draft.choices,
    canonicalDetails: {},
  });
  assert.equal(deletedCandidate.typeDetails?.propertyType, 'villa');
  assert.equal(
    validateTypeDetails(deletedCandidate.typeDetails!, deletedCandidate.core).ok,
    true,
  );
  assert.deepEqual(projectPropertyFacts(deletedCandidate).templateFacts, {});

  const candidate = buildPropertyUpdateCandidate(canonicalBaseline, {
    ...draft.choices,
    // Bedroom count remains explicitly zero, furnishing is deleted, and Garden
    // remains explicitly false; the type discriminator marks the snapshot.
    canonicalDetails: { bedroomCount: '0', furnishing: '', hasGarden: 'false' },
  });

  assert.equal(candidate.typeDetails?.propertyType, 'villa');
  assert.equal(
    validateTypeDetails(candidate.typeDetails!, candidate.core).ok,
    true,
    'the saved propertyType discriminator is a valid canonical snapshot marker',
  );
  assert.equal((candidate.typeDetails as { bedroomCount?: number }).bedroomCount, 0);
  assert.equal((candidate.typeDetails as { hasGarden?: boolean }).hasGarden, false);
  assert.equal((candidate.typeDetails as { furnishing?: string }).furnishing, undefined);

  const projected = projectPropertyFacts(candidate);
  assert.deepEqual(projected.templateFacts, {});
});

test('mismatched demo category does not project legacy facts onto another property type', () => {
  const result = projectPropertyFacts(property({
    core: { id: 'property-1', propertyType: 'shop', locationArea: { id: 'salmiya' } },
    demoCapture: {
      categoryId: 'villa',
      numericValues: { bedroomCount: 3, masterBedroomCount: 1 },
      choices: { furnishing: 'furnished' },
      selectedFeatures: ['garden'],
    },
  }));
  assert.deepEqual(result.templateFacts, {});
});

test('canonical area wins when values are equal and conflicts when they differ', () => {
  const equal = projectPropertyFacts(property({
    areaSquareMeters: 80,
    demoCapture: { categoryId: 'family_apartment', areaSquareMeters: 80, areaUnit: 'square_meter' },
  }));
  assert.equal(equal.areaSquareMeters, 80);
  assert.equal(equal.conflicts.length, 0);

  const conflict = projectPropertyFacts(property({
    areaSquareMeters: 80,
    demoCapture: { categoryId: 'family_apartment', areaSquareMeters: 90, areaUnit: 'square_meter' },
  }));
  assert.equal(hasUnresolvedPropertyFactConflicts(property({
    areaSquareMeters: 80,
    demoCapture: { categoryId: 'family_apartment', areaSquareMeters: 90, areaUnit: 'square_meter' },
  })), true);
  assert.deepEqual(conflict.conflicts[0], { key: 'area', canonicalValue: 80, legacyValue: 90 });
});

test('canonical write converges area without deleting distinct template facts', () => {
  const baseline = property({
    demoCapture: {
      categoryId: 'family_apartment',
      areaSquareMeters: 90,
      numericValues: { bedroomCount: 3 },
    },
  });
  const candidate = writeCanonicalArea(baseline, 80, 'square_meter');
  assert.equal(candidate.areaSquareMeters, 80);
  assert.equal(candidate.demoCapture?.areaSquareMeters, undefined);
  assert.equal(candidate.demoCapture?.numericValues?.bedroomCount, 3);
});

test('modern edit candidate preserves enrichment privacy, attachment metadata, and identity', () => {
  const baseline = property({
    core: {
      id: 'property-1',
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
      description: { value: 'old description', privacy: { classification: 'normal', disclosurePolicy: 'normal' } },
      privateNotes: { value: 'private', privacy: { classification: 'private_notes', disclosurePolicy: 'never' } },
    },
    locationEnrichment: {
      paciNumber: { value: '123', privacy: { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' } },
    },
    attachments: [{
      id: 'attachment-1',
      kind: 'image',
      originalName: 'cover.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      managedUri: 'file:///cover.jpg',
      isCover: true,
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    }],
  });
  const draft = createEditDraft(baseline);
  const candidate = buildPropertyUpdateCandidate(baseline, {
    ...draft.choices,
    description: 'new description',
    privateNotes: 'still private',
    paciNumber: '456',
    attachments: draft.choices.attachments,
  });
  assert.equal(candidate.core.id, baseline.core.id);
  assert.equal(candidate.activeOffer.id, baseline.activeOffer.id);
  assert.equal(candidate.core.description?.value, 'new description');
  assert.equal(candidate.core.privateNotes?.privacy.disclosurePolicy, 'never');
  assert.equal(candidate.locationEnrichment?.paciNumber?.privacy.disclosurePolicy, 'explicit_per_share');
  assert.equal(candidate.attachments?.[0].id, 'attachment-1');
  assert.equal(candidate.attachments?.[0].managedUri, 'file:///cover.jpg');
});

test('legacy edit drafts migrate without deleting untouched enrichment or attachments', () => {
  const baseline = property({
    core: {
      id: 'property-1',
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
      description: { value: 'kept', privacy: { classification: 'normal', disclosurePolicy: 'normal' } },
      privateNotes: { value: 'kept private', privacy: { classification: 'private_notes', disclosurePolicy: 'never' } },
    },
    attachments: [{
      id: 'attachment-legacy',
      kind: 'pdf',
      originalName: 'old.pdf',
      mimeType: 'application/pdf',
      order: 0,
      managedUri: 'file:///old.pdf',
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    }],
  });
  const draft = createEditDraft(baseline);
  const legacy = {
    ...draft,
    choices: {
      propertyType: draft.choices.propertyType,
      transaction: draft.choices.transaction,
      priceAmount: draft.choices.priceAmount,
      locationAreaId: draft.choices.locationAreaId,
      ...(draft.choices.rentalPeriodId ? { rentalPeriodId: draft.choices.rentalPeriodId } : {}),
    },
  } as typeof draft;
  const migrated = migratePropertyEditDraft(legacy);
  assert.equal(migrated.choices.description, 'kept');
  assert.equal(migrated.choices.privateNotes, 'kept private');
  assert.equal(migrated.choices.attachments?.[0].id, 'attachment-legacy');
  const candidate = buildPropertyUpdateCandidate(legacy.baseline, legacy.choices);
  assert.equal(candidate.core.description?.value, 'kept');
  assert.equal(candidate.attachments?.[0].id, 'attachment-legacy');
});

test('attachment cleanup evidence deletes only retired files after CAS and is retryable', async () => {
  const baseline = property();
  const candidate = property({ core: { ...baseline.core, description: { value: 'new', privacy: { classification: 'normal', disclosurePolicy: 'normal' } } } });
  const draft = createEditDraft(baseline);
  const operation = createPropertyUpdateOperation({
    operationId: 'attachment-op',
    baseline,
    candidate,
    draftSnapshot: draft,
    preparedAt: '2025-01-01T00:00:00.000Z',
    attachmentCleanup: {
      newlyCopiedUris: ['file:///new.jpg'],
      retiredManagedUris: ['file:///retired.jpg'],
      phase: 'after_cas',
      status: 'pending',
    },
  });
  const values = new Map<string, string>([['@viewstate_property_update_operation_v1', JSON.stringify(operation)]]);
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
  const deleted: string[] = [];
  const result = await executePropertyUpdateRecovery({
    operation,
    allowUpdate: false,
    getProperty: async () => candidate,
    compareAndUpdate: async () => false,
    storage,
    attachmentFileStore: { copyToProperty: async () => '', delete: async uri => { deleted.push(uri); } },
  });
  assert.deepEqual(result, { status: 'complete', updatedNow: false });
  assert.deepEqual(deleted, ['file:///retired.jpg']);
  assert.equal(values.has('@viewstate_property_update_operation_v1'), false);
});
