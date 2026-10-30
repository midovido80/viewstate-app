import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createStudioFormValues, buildStudioRequirement, readStudioRequirement, validateStudioForm } from '@/services/studioFormModel';
import { getStudioCatalogField, isStudioCatalogFieldApplicable, STUDIO_FORM_FIELD_ORDER } from '@/services/studioCatalog';
import { resolveSourcePath } from './sourcePath.ts';

test('PRODUCTION CONTRACT: Wanted Studio criteria build a domain-only Requirement', () => {
  const values = {
    ...createStudioFormValues('wanted', 'rent'),
    preferredAreaMode: 'specific_areas' as const,
    preferredAreaIds: ['salmiya', 'hawalli'],
    budgetMinimum: '450',
    budgetMaximum: '500',
    rentalPeriodId: 'monthly' as const,
    areaSquareMeters: '88',
  };
  assert.equal(validateStudioForm(values).ok, true);
  const requirement = buildStudioRequirement(values, '99999999-9999-4999-8999-999999999999', 'seeker-id');
  assert.deepEqual(requirement.preferredAreaIds, ['salmiya', 'hawalli']);
  assert.deepEqual(requirement.budget, { minimum: 450, maximum: 500, currencyCode: 'KWD' });
  assert.equal(requirement.purpose === 'rent' ? requirement.rentalPeriodId : undefined, 'monthly');
  assert.ok(requirement.catalogPreferences?.some(item =>
    item.field === 'builtUpAreaSquareMeters' && item.kind === 'number' && item.value === 88));
  assert.equal('studioMapsLink' in requirement, false);
  assert.equal('attachments' in requirement, false);
  assert.equal(readStudioRequirement(requirement).mapsLink, '');
});

test('PRODUCTION CONTRACT: Wanted excludes map and attachment UI while Offered retains it', async () => {
  const studio = await readFile(resolveSourcePath('../app/capture/studio.tsx', import.meta.url), 'utf8');
  const form = studio.slice(studio.indexOf('const renderForm ='), studio.indexOf('const reviewItem ='));

  assert.equal(isStudioCatalogFieldApplicable('mapsLink', 'wanted'), false);
  assert.equal(getStudioCatalogField('mapsLink').modes.includes('wanted'), false);
  assert.ok(!STUDIO_FORM_FIELD_ORDER.wanted.includes('mapsLink'));
  assert.match(form, /mode === 'offered' \? renderExactLocationSection\(\) : null/);
  assert.match(form, /mode === 'offered' \? renderStudioAttachments\(\) : null/);
  assert.match(studio, /renderReview\(\)\}\s*\{mode === 'offered' \? renderStudioAttachments\(\) : null\}/);
  assert.doesNotMatch(form, /mode === 'wanted'[\s\S]{0,140}renderExactLocationSection\(\)/);
  assert.doesNotMatch(form, /mode === 'wanted'[\s\S]{0,140}renderStudioAttachments\(\)/);
});