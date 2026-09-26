import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createStudioFormValues, validateStudioForm } from '@/services/studioFormModel';
import { resolveSourcePath } from './sourcePath.ts';

const source = readFile(
  resolveSourcePath('../app/capture/studio.tsx', import.meta.url),
  'utf8',
);

test('BEHAVIOR: Wanted form withholds criteria until an existing Person identity is resolved', async () => {
  const studio = await source;
  const form = studio.slice(studio.indexOf('const renderForm ='), studio.indexOf('const reviewItem ='));

  assert.match(studio, /store\.getPerson\(seekerParam\)/);
  assert.match(studio, /setSelectedPersonId\(seekerParam \?\? ''\)/);
  assert.match(studio, /selectedPerson\.id === seekerParam/);
  assert.match(form, /\{mode === 'wanted' \? renderPersonSelector\(\) : null\}/);
  assert.match(form, /mode === 'wanted' && !wantedIdentityReady \? null :/);
  assert.ok(
    form.indexOf("renderPersonSelector()") < form.indexOf("mode === 'wanted' && !wantedIdentityReady"),
    'the identity selector must precede every lengthy Wanted criterion',
  );
  assert.match(studio, /onPress=\{\(\) => choosePerson\(person\.id\)\}/);
  assert.doesNotMatch(studio, /createPerson|addPerson|newPerson/i);
});

test('BEHAVIOR: empty saved-Person list offers the localized existing add flow, while load failures stay errors', async () => {
  const studio = await source;
  const selector = studio.slice(
    studio.indexOf('const renderPersonSelector ='),
    studio.indexOf('const validate ='),
  );
  const emptyStateStart = selector.indexOf('people.length === 0 ? (');
  const emptyStateEnd = selector.indexOf('\n      ) : (', emptyStateStart);
  const emptyState = selector.slice(emptyStateStart, emptyStateEnd);

  assert.ok(emptyStateStart >= 0 && emptyStateEnd > emptyStateStart);
  assert.ok(
    selector.indexOf('peopleError && !selectedPerson ?') < emptyStateStart,
    'a People load failure must be rendered instead of the empty state',
  );
  assert.match(emptyState, /title=\{t\('people\.add'\)\}/);
  assert.match(emptyState, /onPress=\{\(\) => router\.push\('\/person\/new' as never\)\}/);
  assert.match(emptyState, /testID="studio-add-person"/);
  assert.match(emptyState, /Add Wanted Studio/);
  assert.match(emptyState, /إضافة طلب استوديو/);
  assert.match(studio, /const showingReview = step === 'review' && wantedIdentityReady/);
  assert.match(studio, /\{!showingReview \? renderForm\(\) :/);
});

test('BEHAVIOR: validation errors target the Person, area, and cadence controls', async () => {
  const studio = await source;
  const wanted = {
    ...createStudioFormValues('wanted', 'rent'),
    preferredAreaMode: 'specific_areas' as const,
    preferredAreaIds: [],
    budgetMinimum: '',
    budgetMaximum: '',
  };
  const result = validateStudioForm(wanted);
  assert.ok(result.errors.some(error => error.field === 'preferredAreaIds'));
  assert.ok(result.errors.some(error => error.field === 'budgetMinimum'));

  assert.match(studio, /focusField\('person'\)/);
  assert.match(studio, /first === 'preferredAreaMode' \? 'preferredAreaIds'/);
  assert.match(studio, /first === 'rentalPeriodId' \? 'cadence'/);
  assert.match(studio, /ref=\{setFocusTarget\('preferredAreaIds'\)\}/);
  assert.match(studio, /ref=\{setFocusTarget\('cadence'\)\}/);
  assert.match(studio, /target\?\.measureLayout/);
  assert.match(studio, /target\?\.focus\?\.\(\)/);
});

test('STRUCTURAL: Studio form has no unrelated amenity controls or review rows', async () => {
  const studio = await source;
  assert.doesNotMatch(studio, /STUDIO_AMENITIES|studio-amenity-|reviewItem\(t\('studio\.amenities'/);
});