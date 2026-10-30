import test from 'node:test';
import assert from 'node:assert/strict';
import type { SeekerRequirement } from '@workspace/property-domain';
import { linkRequirementToSeeker } from '../services/requirementOwnership.ts';

const unassigned: SeekerRequirement = {
  id: '123e4567-e89b-42d3-a456-426614174001',
  purpose: 'rent',
  propertyType: 'apartment',
  preferredAreaIds: [],
  preferredAreaMode: 'all_kuwait',
  budget: { minimum: 300, maximum: 500, currencyCode: 'KWD' },
  notes: '',
  rentalPeriodId: 'monthly',
};

test('links an unassigned Requirement without changing its identity', async () => {
  let stored: SeekerRequirement = unassigned;
  const outcome = await linkRequirementToSeeker({
    expected: unassigned,
    seekerId: 'person-1',
    store: {
      getPerson: async () => ({ id: 'person-1', classifications: ['seeker'] }),
      getRequirement: async id => id === stored.id ? stored : null,
      saveRequirement: async () => undefined,
      updateRequirement: async (expected, replacement) => {
        if (stored !== expected) return false;
        stored = replacement;
        return true;
      },
    },
  });
  assert.equal(outcome.status, 'linked');
  if (outcome.status === 'linked') {
    assert.equal(outcome.requirement.id, unassigned.id);
    assert.equal(outcome.requirement.seekerId, 'person-1');
  }
});

test('never overwrites an existing Requirement owner', async () => {
  const assigned = { ...unassigned, seekerId: 'person-1' };
  const outcome = await linkRequirementToSeeker({
    expected: assigned, seekerId: 'person-2',
    store: {
      getPerson: async () => ({ id: 'person-2', classifications: ['seeker'] }),
      getRequirement: async () => assigned,
      saveRequirement: async () => undefined,
      updateRequirement: async () => { throw new Error('must not write'); },
    },
  });
  assert.equal(outcome.status, 'ownership_conflict');
});

test('requires a real Person with the Seeker classification', async () => {
  const store = {
    getPerson: async () => null,
    getRequirement: async () => unassigned,
    saveRequirement: async () => undefined,
    updateRequirement: async () => true,
  };
  assert.equal((await linkRequirementToSeeker({ expected: unassigned, seekerId: 'missing', store })).status, 'missing_person');
  assert.equal((await linkRequirementToSeeker({
    expected: unassigned, seekerId: 'owner',
    store: { ...store, getPerson: async () => ({ id: 'owner', classifications: ['owner'] }) },
  })).status, 'non_seeker');
});
