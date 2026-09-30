import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveSourcePath } from './sourcePath.ts';
import { buildPersonRequirement } from '../services/personRequirementWorkflow.ts';
import { buildStudioRequirement, createStudioFormValues } from '../services/studioFormModel.ts';
import { validMatchingRequirements } from '../services/matchingUi.ts';

test('generic and Studio builders preserve an unassigned Wanted record', () => {
  const generic = buildPersonRequirement(
    '123e4567-e89b-42d3-a456-426614174010',
    undefined,
    {
      purpose: 'buy',
      propertyType: 'apartment',
      preferredAreaIds: [],
      preferredAreaMode: 'all_kuwait',
      minimumBudget: 50000,
      maximumBudget: 70000,
      currencyCode: 'KWD',
      notes: '',
      catalogPreferences: [{ field: 'apartmentSubtype', kind: 'choice', value: 'standard_apartment' }],
    },
  );
  assert.equal(generic.ok, true);
  if (generic.ok) assert.equal(generic.value.seekerId, undefined);

  const values = {
    ...createStudioFormValues('wanted', 'rent'),
    preferredAreaMode: 'all_kuwait' as const,
    budgetMinimum: '300',
    budgetMaximum: '500',
    bathrooms: '1',
  };
  const studio = buildStudioRequirement(values, '123e4567-e89b-42d3-a456-426614174011', undefined);
  assert.equal(studio.seekerId, undefined);
  assert.deepEqual(validMatchingRequirements([studio]), []);
});

test('capture routes save first and offer link-existing, add-and-link, or link-later actions', async () => {
  const [studio, generic, details, person] = await Promise.all([
    readFile(resolveSourcePath('../app/capture/studio.tsx', import.meta.url), 'utf8'),
    readFile(resolveSourcePath('../app/requirement/[requirementId].tsx', import.meta.url), 'utf8'),
    readFile(resolveSourcePath('../app/requirement/view/[requirementId].tsx', import.meta.url), 'utf8'),
    readFile(resolveSourcePath('../app/person/new.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(studio, /studio-link-existing-person/);
  assert.match(studio, /studio-add-person-and-link/);
  assert.match(studio, /studio-link-later/);
  assert.doesNotMatch(studio, /mode === 'wanted' && !selectedPersonId/);
  assert.match(generic, /pathname: '\/requirement\/view\/\[requirementId\]'/);
  assert.match(details, /requirement-link-existing/);
  assert.match(details, /requirement-add-person/);
  assert.match(person, /returnRequirementId/);
  assert.match(person, /linkRequirementToSeeker/);
});
