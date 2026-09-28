import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLiteralText,
  createPrivacyMetadata,
  validateProperty,
  type Property,
  type SeekerRequirement,
} from '@workspace/property-domain';
import './platformModuleStubs.ts';
import {
  buildStudioProperty,
  buildStudioRequirement,
  createStudioFormValues,
  readStudioProperty,
  readStudioRequirement,
} from '../services/studioFormModel.ts';
import { createPerson, type Person, type PropertySource } from '../services/people.ts';
import { getPropertyCardSummary } from '../services/cardSummaryPresentation.ts';
import type { AttachmentFileStore, LocalAttachment } from '../services/attachmentOperations.ts';
import {
  basicStudioProperty,
  ensureStudioPropertySourceLink,
  getStudioPersonSourceRole,
  prepareStudioPropertyEditCandidate,
  retryStudioPropertyRecovery,
  saveStudioProperty,
  saveStudioRequirement,
  type StudioPropertyStore,
  type StudioPropertySourceStore,
  type StudioRequirementStore,
} from '../services/studioSave.ts';
import {
  createEditDraft,
  createPropertyUpdateOperation,
  persistPropertyUpdateOperation,
  PROPERTY_UPDATE_OPERATION_KEY,
} from '../services/propertyUpdateRecovery.ts';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
};

const offeredCandidate = (id: string, offerId: string, price = '125', mapsLink = '') => {
  const values = {
    ...createStudioFormValues('offered', 'rent'),
    locationAreaId: 'salmiya',
    mapsLink,
    price,
    areaSquareMeters: '35',
    bathrooms: '1',
    kitchen: 'yes' as const,
    hall: 'no' as const,
    parking: 'unknown' as const,
    floorNumber: '0',
    amenities: ['balcony'] as const,
    description: 'Bright studio',
  };
  return buildStudioProperty(values, id, offerId);
};

function propertyStore(initial: Property[] = [], rejectAfterBasicWrite = false) {
  const properties = new Map(initial.map(property => [property.core.id, property]));
  const writes: string[] = [];
  const store: StudioPropertyStore = {
    saveProperty: async property => {
      writes.push('basic');
      const existing = properties.get(property.core.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(property)) {
        throw new Error('PROPERTY_ID_ALREADY_EXISTS');
      }
      properties.set(property.core.id, property);
      if (rejectAfterBasicWrite) throw new Error('WRITE_REJECTED_AFTER_COMMIT');
    },
    getProperty: async id => properties.get(id) ?? null,
    getProperties: async () => [...properties.values()],
    compareAndUpdate: async (expected, replacement) => {
      writes.push('cas');
      if (JSON.stringify(properties.get(expected.core.id)) !== JSON.stringify(expected)) return false;
      properties.set(replacement.core.id, replacement);
      return true;
    },
  };
  return { store, properties, writes };
}

const seeker: Person = createPerson({
  id: 'person-studio-seeker',
  classifications: ['seeker'],
  name: 'Studio seeker',
  displayPhone: '55512345',
});

function requirementStore(person: Person = seeker, rejectAfterWrite = false) {
  const requirements = new Map<string, SeekerRequirement>();
  const writes: string[] = [];
  const store: StudioRequirementStore = {
    getPerson: async id => id === person.id ? person : null,
    getRequirement: async id => requirements.get(id) ?? null,
    saveRequirement: async requirement => {
      writes.push('save');
      if (requirements.has(requirement.id)) throw new Error('REQUIREMENT_ID_ALREADY_EXISTS');
      requirements.set(requirement.id, requirement);
      if (rejectAfterWrite) throw new Error('WRITE_REJECTED_AFTER_COMMIT');
    },
    updateRequirement: async (expected, replacement) => {
      writes.push('update');
      if (JSON.stringify(requirements.get(expected.id)) !== JSON.stringify(expected)) return false;
      requirements.set(replacement.id, replacement);
      return true;
    },
  };
  return { store, requirements, writes };
}

test('Studio offered creation writes BASIC first, enriches by CAS, and confirms the exact ID', async () => {
  const candidate = offeredCandidate('studio-property-one', 'studio-offer-one');
  const memory = propertyStore();
  const outcome = await saveStudioProperty({
    candidate,
    store: memory.store,
    storage: storage(),
  });

  assert.equal(outcome.status, 'saved');
  assert.deepEqual(memory.writes, ['basic', 'cas']);
  assert.deepEqual(memory.properties.get(candidate.core.id), candidate);
  assert.equal(basicStudioProperty(candidate).typeDetails, undefined);
  const readback = await memory.store.getProperty(candidate.core.id);
  assert.ok(readback);
  const reopenedValues = readStudioProperty(readback);
  assert.equal(reopenedValues.transaction, 'rent');
  assert.equal(reopenedValues.rentalPeriodId, 'monthly');
  assert.equal(reopenedValues.price, '125');
  const reopenedCandidate = buildStudioProperty(
    reopenedValues,
    readback.core.id,
    readback.activeOffer.id,
  );
  assert.deepEqual(reopenedCandidate, candidate);
  const writesBeforeRepeat = [...memory.writes];
  const repeated = await saveStudioProperty({
    candidate: reopenedCandidate,
    store: memory.store,
    storage: storage(),
  });
  assert.equal(repeated.status, 'saved');
  assert.deepEqual(memory.writes, writesBeforeRepeat);
  assert.equal(memory.properties.size, 1);

  const uncertain = propertyStore([], true);
  const recovered = await saveStudioProperty({
    candidate: offeredCandidate('studio-property-uncertain', 'studio-offer-uncertain'),
    store: uncertain.store,
    storage: storage(),
  });
  assert.equal(recovered.status, 'saved');
  assert.deepEqual(uncertain.writes, ['basic', 'cas']);
});

test('Offered Studio from a Person keeps one exact source and property link across retry/readback', async () => {
  const person = createPerson({
    id: 'person-studio-owner-exact',
    classifications: ['owner', 'broker'],
    name: 'Exact source',
    displayPhone: '55588888',
  });
  const property = offeredCandidate('studio-property-source-exact', 'studio-offer-source-exact');
  const links: Array<{ personId: string; propertyCoreId: string }> = [];
  let source: PropertySource | null = null;
  let sourceWrites = 0;
  const store: StudioPropertySourceStore = {
    getPerson: async id => id === person.id ? person : null,
    getPropertySource: async id => id === property.core.id ? source : null,
    getLinksForProperty: async id => links.filter(link => link.propertyCoreId === id),
    linkPersonToProperty: async link => {
      if (!links.some(existing => existing.personId === link.personId && existing.propertyCoreId === link.propertyCoreId)) links.push(link);
    },
    setPropertySource: async next => {
      sourceWrites += 1;
      source = next;
    },
  };
  const role = getStudioPersonSourceRole(person, 'broker');
  assert.equal(role, 'broker', 'an explicit source role is retained');
  assert.equal(getStudioPersonSourceRole(person), 'owner', 'a missing role is deterministically derived from the Person');
  await ensureStudioPropertySourceLink(property.core.id, person.id, role!, store);
  await ensureStudioPropertySourceLink(property.core.id, person.id, role!, store);
  assert.deepEqual(links, [{ personId: person.id, propertyCoreId: property.core.id }]);
  assert.deepEqual(source, { propertyCoreId: property.core.id, personId: person.id, role: 'broker' });
  assert.equal(sourceWrites, 1, 'exact readback retry does not duplicate or rewrite the source');
  assert.equal(property.core.id, 'studio-property-source-exact');
});

test('Studio offered editing updates the existing ID through durable CAS recovery', async () => {
  const baseline = offeredCandidate('studio-property-edit', 'studio-offer-edit');
  const candidate = offeredCandidate('studio-property-edit', 'studio-offer-edit', '150');
  const memory = propertyStore([baseline]);
  const outcome = await saveStudioProperty({
    candidate,
    baseline,
    store: memory.store,
    storage: storage(),
  });

  assert.equal(outcome.status, 'saved');
  assert.deepEqual(memory.writes, ['cas']);
  assert.deepEqual(memory.properties.get(baseline.core.id), candidate);
  assert.equal(memory.properties.size, 1);
});

test('Studio offered save commits attachment metadata in the exact confirmed Property candidate', async () => {
  const built = offeredCandidate('studio-property-attachments', 'studio-offer-attachments');
  const attachment = {
    id: 'studio-cover-attachment',
    kind: 'image' as const,
    originalName: 'studio-cover.jpg',
    mimeType: 'image/jpeg',
    order: 0,
    managedUri: 'file:///properties/studio-property-attachments/cover.jpg',
    isCover: true,
    privacy: createPrivacyMetadata('normal', 'normal'),
  };
  const candidate: Property = { ...built, attachments: [attachment] };
  const memory = propertyStore();
  const outcome = await saveStudioProperty({
    candidate,
    store: memory.store,
    storage: storage(),
  });
  assert.equal(outcome.status, 'saved');
  if (outcome.status !== 'saved') return;
  assert.deepEqual(outcome.property.attachments, [attachment]);
  assert.deepEqual(await memory.store.getProperty(candidate.core.id), candidate);
  assert.deepEqual(memory.writes, ['basic', 'cas']);
});

test('Studio recovery refuses a pending update with a different exact candidate', async () => {
  const baseline = offeredCandidate('studio-property-recovery-collision', 'studio-offer-collision');
  const pendingCandidate = offeredCandidate(
    'studio-property-recovery-collision',
    'studio-offer-collision',
    '150',
  );
  const requestedCandidate = offeredCandidate(
    'studio-property-recovery-collision',
    'studio-offer-collision',
    '175',
  );
  const draftSnapshot = createEditDraft(baseline);
  const operation = createPropertyUpdateOperation({
    operationId: 'studio-recovery-collision-operation',
    baseline,
    candidate: pendingCandidate,
    draftSnapshot,
    preparedAt: '2025-01-01T00:00:00.000Z',
  });
  const durable = storage();
  await persistPropertyUpdateOperation(operation, durable);
  const memory = propertyStore([baseline]);

  const result = await retryStudioPropertyRecovery({
    propertyId: baseline.core.id,
    candidate: requestedCandidate,
    baseline,
    store: memory.store,
    storage: durable,
  });

  assert.deepEqual(result, {
    status: 'recovery_required',
    propertyId: baseline.core.id,
    reason: 'pending_operation_mismatch',
  });
  assert.deepEqual(memory.writes, []);
  assert.deepEqual(memory.properties.get(baseline.core.id), baseline);
  assert.equal(
    await durable.getItem(PROPERTY_UPDATE_OPERATION_KEY),
    JSON.stringify(operation),
  );

  const mismatchedBaseline = offeredCandidate(
    'studio-property-recovery-collision',
    'studio-offer-collision',
    '110',
  );
  const baselineCollision = createPropertyUpdateOperation({
    operationId: 'studio-recovery-baseline-collision',
    baseline: mismatchedBaseline,
    candidate: requestedCandidate,
    draftSnapshot: createEditDraft(mismatchedBaseline),
    preparedAt: '2025-01-01T00:00:01.000Z',
  });
  const secondDurable = storage();
  await persistPropertyUpdateOperation(baselineCollision, secondDurable);
  const secondResult = await retryStudioPropertyRecovery({
    propertyId: baseline.core.id,
    candidate: requestedCandidate,
    baseline,
    store: memory.store,
    storage: secondDurable,
  });
  assert.deepEqual(secondResult, {
    status: 'recovery_required',
    propertyId: baseline.core.id,
    reason: 'pending_operation_mismatch',
  });
  assert.deepEqual(memory.writes, []);
  assert.deepEqual(memory.properties.get(baseline.core.id), baseline);
});

test('Studio edit reconciles legacy top-level area and reads back one canonical value', async () => {
  const baseline = {
    ...offeredCandidate('studio-property-area-edit', 'studio-offer-area'),
    areaSquareMeters: 35,
    areaUnit: 'square_meter' as const,
  };
  const built = offeredCandidate('studio-property-area-edit', 'studio-offer-area', '150');
  const builtWithUpdatedArea = {
    ...built,
    typeDetails: { ...built.typeDetails!, builtUpAreaSquareMeters: 48 },
  };
  const candidate = prepareStudioPropertyEditCandidate(baseline, builtWithUpdatedArea);
  const memory = propertyStore([baseline]);
  const outcome = await saveStudioProperty({
    candidate,
    baseline,
    store: memory.store,
    storage: storage(),
  });

  assert.equal(outcome.status, 'saved');
  if (outcome.status !== 'saved') return;
  assert.equal(outcome.property.areaSquareMeters, 48);
  assert.equal(outcome.property.areaUnit, 'square_meter');
  assert.equal(
    (outcome.property.typeDetails as Record<string, unknown> | undefined)?.builtUpAreaSquareMeters,
    undefined,
  );
  const formatters = {
    language: 'en' as const,
    translate: (key: string) => key === 'propertyType.apartment' ? 'Apartment'
      : key === 'enrich.apartment_subtype.studio' ? 'Studio' : key,
    formatPrice: (amount: number, currencyCode: string) => `${amount} ${currencyCode}`,
    formatRentalPrice: (amount: number, currencyCode: string) => `${amount} ${currencyCode}`,
  };
  assert.equal(
    getPropertyCardSummary(outcome.property, formatters).studioAreaLabel,
    'Actual Studio area (m²): 48',
    'edited Studio area remains visible from the retained canonical top-level area',
  );
  const arabicFormatters = {
    ...formatters,
    language: 'ar' as const,
    translate: (key: string) => key === 'propertyType.apartment' ? 'شقة'
      : key === 'enrich.apartment_subtype.studio' ? 'استوديو' : key,
  };
  assert.equal(
    getPropertyCardSummary(outcome.property, arabicFormatters).studioAreaLabel,
    'مساحة الاستوديو الفعلية (م²): 48',
  );
  assert.deepEqual(memory.properties.get(baseline.core.id), outcome.property);
});

test('Studio edit isolates legacy building fields without losing opaque metadata or property evidence', async () => {
  const basic = offeredCandidate('studio-property-legacy-building', 'studio-offer-legacy-building');
  const ownerSource = createLiteralText(
    'Introduced by the building guard',
    createPrivacyMetadata('owner_source', 'explicit_per_share'),
  );
  const privateNotes = createLiteralText(
    'Do not disclose',
    createPrivacyMetadata('private_notes', 'never'),
  );
  const attachment = {
    id: 'studio-legacy-cover',
    kind: 'image' as const,
    originalName: 'cover.jpg',
    mimeType: 'image/jpeg',
    order: 0,
    managedUri: 'file:///managed/studio-cover.jpg',
    isCover: true,
    privacy: createPrivacyMetadata('normal', 'normal'),
  };
  const baseline = {
    ...basic,
    core: { ...basic.core, ownerSource, privateNotes },
    typeDetails: {
      ...basic.typeDetails!,
      unitCount: 12,
      apartmentCount: 8,
      shopCount: 2,
      officeCount: 2,
      roomsPerUnit: 3,
      bathroomsPerUnit: 2,
      floorCount: 4,
      elevatorCount: 2,
      opaqueLegacyMetadata: { preserve: 'without interpretation' },
    },
    attachments: [attachment],
    locationEnrichment: {
      mapsLink: createLiteralText(
        'https://www.google.com/maps/place/Kuwait',
        createPrivacyMetadata('exact_location', 'explicit_per_share'),
      ),
    },
    createdAt: '2025-01-01T00:00:00.000Z',
  } as unknown as Property;
  const builtWithoutNotes = offeredCandidate(
    'studio-property-legacy-building',
    'studio-offer-legacy-building',
    '150',
    'https://www.google.com/maps/place/Kuwait',
  );
  const built = {
    ...builtWithoutNotes,
    core: { ...builtWithoutNotes.core, privateNotes },
  };
  const candidate = prepareStudioPropertyEditCandidate(baseline, built);

  assert(validateProperty(candidate).ok, 'Sanitized Studio edit candidate must pass production Property validation');
  const details = candidate.typeDetails as unknown as Record<string, unknown>;
  for (const field of [
    'unitCount', 'apartmentCount', 'shopCount', 'officeCount',
    'roomsPerUnit', 'bathroomsPerUnit', 'floorCount', 'elevatorCount',
  ]) {
    assert.equal(details[field], undefined, `${field} must not enter the Studio candidate`);
  }
  assert.deepEqual(details.opaqueLegacyMetadata, { preserve: 'without interpretation' });

  const memory = propertyStore([baseline]);
  const outcome = await saveStudioProperty({
    candidate,
    baseline,
    store: memory.store,
    storage: storage(),
  });
  assert.equal(outcome.status, 'saved');
  if (outcome.status !== 'saved') return;
  assert.deepEqual(await memory.store.getProperty(baseline.core.id), candidate);
  assert.deepEqual(outcome.property.attachments, baseline.attachments);
  assert.equal(outcome.property.core.ownerSource?.value, ownerSource.value);
  assert.equal(outcome.property.core.privateNotes?.value, privateNotes.value);
  assert.deepEqual(outcome.property.locationEnrichment, baseline.locationEnrichment);
  assert.equal(
    (outcome.property as Property & { createdAt?: string }).createdAt,
    (baseline as Property & { createdAt?: string }).createdAt,
  );
  assert.deepEqual(details.opaqueLegacyMetadata, { preserve: 'without interpretation' });
  assert.deepEqual(memory.writes, ['cas', 'cas']);
  assert.equal(memory.properties.size, 1);
});

test('Studio wanted save validates an existing Person and confirms the exact Requirement', async () => {
  const values = {
    ...createStudioFormValues('wanted', 'sale'),
    preferredAreaMode: 'all_kuwait' as const,
    budgetMinimum: '100',
    budgetMaximum: '300',
    bathrooms: '1',
    floorNumber: '0',
    kitchen: 'must_not_have' as const,
    amenities: ['elevator'] as const,
    description: 'Near work',
  };
  const candidate = buildStudioRequirement(values, '44444444-4444-4444-8444-444444444444', seeker.id);
  const memory = requirementStore(seeker, true);
  let navigationCount = 0;
  const outcome = await saveStudioRequirement({
    candidate,
    baseline: null,
    store: memory.store,
    navigate: () => { navigationCount += 1; },
  });

  assert.equal(outcome.status, 'saved');
  assert.deepEqual(memory.writes, ['save']);
  assert.deepEqual(memory.requirements.get(candidate.id), candidate);
  assert.equal(navigationCount, 1);
  const readback = await memory.store.getRequirement(candidate.id);
  assert.ok(readback);
  const reopenedValues = readStudioRequirement(readback);
  assert.equal(readback.purpose, 'buy');
  assert.equal(reopenedValues.transaction, 'sale');
  assert.equal(reopenedValues.budgetMinimum, '100');
  const reopenedCandidate = buildStudioRequirement(reopenedValues, readback.id, readback.seekerId);
  assert.deepEqual(reopenedCandidate, candidate);
  const repeated = await saveStudioRequirement({
    candidate: reopenedCandidate,
    baseline: null,
    store: memory.store,
    navigate: () => { navigationCount += 1; },
  });
  assert.equal(repeated.status, 'saved');
  assert.deepEqual(memory.requirements.get(candidate.id), candidate);
  assert.equal(memory.requirements.size, 1);
  assert.deepEqual(memory.writes, ['save', 'save']);
  assert.equal(navigationCount, 2);
  const updatedCandidate = buildStudioRequirement(
    { ...values, description: 'Updated studio notes' },
    candidate.id,
    seeker.id,
  );
  const edited = await saveStudioRequirement({
    candidate: updatedCandidate,
    baseline: candidate,
    store: memory.store,
    navigate: () => { navigationCount += 1; },
  });
  assert.equal(edited.status, 'saved');
  assert.deepEqual(memory.writes, ['save', 'save', 'update']);
  assert.deepEqual(memory.requirements.get(candidate.id), updatedCandidate);
  assert.equal(memory.requirements.size, 1);
  assert.equal(navigationCount, 3);

  const owner = createPerson({
    id: 'person-studio-owner',
    classifications: ['owner'],
    name: 'Studio owner',
    displayPhone: '55512346',
  });
  const ownerStore = requirementStore(owner, true);
  const ownerRequirement = { ...candidate, seekerId: owner.id };
  const ownerOutcome = await saveStudioRequirement({
    candidate: ownerRequirement,
    baseline: null,
    store: ownerStore.store,
    navigate: () => undefined,
  });
  assert.equal(ownerOutcome.status, 'non_seeker');
  assert.deepEqual(ownerStore.writes, []);
  assert.equal(ownerStore.requirements.has(ownerRequirement.id), false);

  const missing = await saveStudioRequirement({
    candidate: { ...candidate, seekerId: 'missing-person' },
    baseline: null,
    store: ownerStore.store,
    navigate: () => undefined,
  });
  assert.equal(missing.status, 'missing_person');
  assert.deepEqual(ownerStore.writes, []);
});

test('Studio Requirement duplicate-ID collision is rejected after exact-ID readback', async () => {
  const values = {
    ...createStudioFormValues('wanted', 'rent'),
    preferredAreaMode: 'all_kuwait' as const,
    budgetMinimum: '100',
    budgetMaximum: '300',
    description: 'Original Studio request',
  };
  const candidate = buildStudioRequirement(values, '55555555-5555-4555-8555-555555555555', seeker.id);
  const memory = requirementStore(seeker);
  const first = await saveStudioRequirement({
    candidate,
    baseline: null,
    store: memory.store,
    navigate: () => undefined,
  });
  assert.equal(first.status, 'saved');
  assert.deepEqual(await memory.store.getRequirement(candidate.id), candidate);

  const collision = buildStudioRequirement(
    { ...values, description: 'Different payload under the same identity' },
    candidate.id,
    seeker.id,
  );
  const navigationCount = { value: 0 };
  const duplicate = await saveStudioRequirement({
    candidate: collision,
    baseline: null,
    store: memory.store,
    navigate: () => { navigationCount.value += 1; },
  });
  assert.deepEqual(duplicate, {
    status: 'storage_failure',
    retryAllowed: false,
    conflict: true,
    diagnostic: { stage: 'readback', code: 'readback_failed', location: ['requirement', 'id'], errorType: 'REQUIREMENT_ID_ALREADY_EXISTS' },
  });
  assert.deepEqual(await memory.store.getRequirement(candidate.id), candidate);
  assert.deepEqual(memory.writes, ['save', 'save']);
  assert.equal(memory.requirements.size, 1);
  assert.equal(navigationCount.value, 0);
});

test('Wanted Studio rejects retired exact-location and attachment fields before writing', async () => {
  const values = {
    ...createStudioFormValues('wanted', 'rent'),
    preferredAreaMode: 'all_kuwait' as const,
    budgetMinimum: '100',
    budgetMaximum: '300',
  };
  const candidate = buildStudioRequirement(values, '66666666-6666-4666-8666-666666666666', seeker.id);
  const memory = requirementStore(seeker);
  let navigationCount = 0;
  const legacyCandidate = {
    ...candidate,
    studioMapsLink: 'https://maps.app.goo.gl/legacy',
    attachments: [{
      id: 'retired-image',
      kind: 'image',
      originalName: 'private.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      managedUri: 'file:///legacy-private-file',
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    }],
  } as unknown as SeekerRequirement;
  const result = await saveStudioRequirement({
    candidate: legacyCandidate,
    baseline: null,
    store: memory.store,
    navigate: () => { navigationCount += 1; },
  });
  assert.equal(result.status, 'invalid_requirement');
  assert.deepEqual(memory.writes, []);
  assert.equal(memory.requirements.size, 0);
  assert.equal(navigationCount, 0);
});
