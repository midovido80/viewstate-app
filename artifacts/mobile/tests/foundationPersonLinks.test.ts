import test from 'node:test';
import assert from 'node:assert/strict';

import './platformModuleStubs.ts';
import type { Property } from '@workspace/property-domain';
import { buildPersonRequirement } from '../services/personRequirementWorkflow.ts';
import { createPerson, personCanBePropertySource } from '../services/people.ts';
import { WEB_REQUIREMENTS_KEY } from '../services/requirementPersistence.ts';
import { WebStore } from '../services/persistence.ts';
import { savePersonRequirement } from '../services/requirementSaveOutcome.ts';

class MemoryStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const locks = {
  async request<T>(
    _name: string,
    _options: { mode: 'exclusive' },
    callback: () => Promise<T>,
  ): Promise<T> {
    return callback();
  },
};

function property(id: string): Property {
  return {
    core: {
      id,
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
    },
    activeOffer: {
      id: `${id}-offer`,
      propertyCoreId: id,
      transaction: 'sale',
      salePrice: { amount: 350, currencyCode: 'KWD' },
    },
  };
}

test('Property sources are optional role relationships, independent of Person classifications', async () => {
  const storage = new MemoryStorage();
  const store = new WebStore(storage, locks);
  await store.init();

  const contact = createPerson({
    id: 'contact-owner',
    classifications: ['owner'],
    name: 'Existing owner contact',
    displayPhone: '50000000',
  });
  await store.savePerson(contact);
  await store.saveProperty(property('property-with-source'));
  await store.saveProperty(property('property-without-source'));

  assert.equal(personCanBePropertySource(contact, 'broker'), true);
  assert.equal(await store.getPropertySource('property-without-source'), null);

  const source = {
    propertyCoreId: 'property-with-source',
    personId: contact.id,
    role: 'broker' as const,
  };
  await store.setPropertySource(source);
  await store.setPropertySource(source);

  assert.deepEqual(await store.getPropertySource(source.propertyCoreId), source);
  assert.deepEqual(await store.getPropertySourcesForPerson(contact.id), [source]);
  assert.deepEqual(await store.getPersonPropertyLinks(), []);
  assert.deepEqual((await store.getPeople()).map(person => person.id), [contact.id]);

  await assert.rejects(
    store.setPropertySource({
      propertyCoreId: source.propertyCoreId,
      personId: 'missing-person',
      role: 'owner',
    }),
    /PROPERTY_SOURCE_TARGET_MISSING/,
  );
  assert.deepEqual(await store.getPropertySource(source.propertyCoreId), source);
});

test('an existing non-seeker Person may own one exact-readback Requirement', async () => {
  const storage = new MemoryStorage();
  const store = new WebStore(storage, locks);
  await store.init();
  const owner = createPerson({
    id: 'owner-requirement-person',
    classifications: ['owner'],
    name: 'Owner',
    displayPhone: '51111111',
  });
  await store.savePerson(owner);
  const secondOwner = createPerson({
    id: 'different-existing-person',
    classifications: ['owner'],
    name: 'Second owner',
    displayPhone: '52222222',
  });
  await store.savePerson(secondOwner);

  const built = buildPersonRequirement(
    '11111111-1111-4111-8111-111111111111',
    owner.id,
    {
      purpose: 'rent',
      propertyType: 'apartment',
      preferredAreaIds: ['salmiya'],
      minimumBudget: 350,
      maximumBudget: 450,
      currencyCode: 'KWD',
      notes: '',
    },
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;

  let writes = 0;
  const outcome = await savePersonRequirement({
    candidate: built.value,
    baseline: null,
    store: {
      getPerson: id => store.getPerson(id),
      getRequirement: id => store.getRequirement(id),
      saveRequirement: async requirement => {
        writes += 1;
        await store.saveRequirement(requirement);
      },
      updateRequirement: (expected, replacement) =>
        store.updateRequirement(expected, replacement),
    },
    navigate: () => undefined,
  });
  assert.deepEqual(outcome, { status: 'saved' });
  assert.deepEqual(await store.getRequirement(built.value.id), built.value);
  assert.equal(writes, 1);

  const conflict = await savePersonRequirement({
    candidate: { ...built.value, seekerId: secondOwner.id },
    baseline: null,
    store: {
      getPerson: id => store.getPerson(id),
      getRequirement: id => store.getRequirement(id),
      saveRequirement: requirement => store.saveRequirement(requirement),
      updateRequirement: (expected, replacement) =>
        store.updateRequirement(expected, replacement),
    },
    navigate: () => assert.fail('mismatched identity must not navigate'),
  });
  assert.deepEqual(conflict, {
    status: 'storage_failure',
    retryAllowed: false,
    conflict: true,
  });
  assert.deepEqual(
    JSON.parse(storage.values.get(WEB_REQUIREMENTS_KEY) ?? '[]')
      .map((requirement: { id: string }) => requirement.id),
    [built.value.id],
  );
});