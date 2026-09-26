import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolveSourcePath } from './sourcePath.ts';

const source = readFile(
  resolveSourcePath('../app/capture/studio.tsx', import.meta.url),
  'utf8',
);

test('STRUCTURAL: Wanted identity gate precedes criteria and pinned routing checks the exact eligible Person', async () => {
  const studio = await source;
  const form = studio.slice(studio.indexOf('const renderForm ='), studio.indexOf('const reviewItem ='));

  assert.match(studio, /store\.getPerson\(seekerParam\)/);
  assert.match(studio, /setSelectedPersonId\(seekerParam \?\? ''\)/);
  assert.match(studio, /selectedPerson\.id === seekerParam/);
  assert.match(studio, /person\.classifications\.includes\('seeker'\)/);
  assert.match(studio, /result\.filter\(person => person\.classifications\.includes\('seeker'\)\)/);
  assert.match(form, /\{mode === 'wanted' \? renderPersonSelector\(\) : null\}/);
  assert.match(form, /mode === 'wanted' && !wantedIdentityReady \? null :/);
  assert.match(form, /STUDIO_FORM_FIELD_ORDER\[mode\]\.map\(fieldId => renderCatalogField\(fieldId\)\)/);
  assert.ok(
    form.indexOf('renderPersonSelector()') < form.indexOf('STUDIO_FORM_FIELD_ORDER'),
    'the eligible identity selector must precede every Wanted criterion',
  );
  assert.match(studio, /onPress=\{\(\) => choosePerson\(person\.id\)\}/);
  assert.match(studio, /selectedPerson\.classifications\.includes\('seeker'\)/);
  assert.doesNotMatch(studio, /createPerson|addPerson|newPerson/i);
});

test('STRUCTURAL: empty eligible-Person list offers the existing add flow and load failures remain visible', async () => {
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
    selector.indexOf("peopleError && (!selectedPerson || !selectedPerson.classifications.includes('seeker')) ?") < emptyStateStart,
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

test('STRUCTURAL: Studio fields render in shared order with catalog-controlled binary choices', async () => {
  const studio = await source;
  const form = studio.slice(studio.indexOf('const renderCatalogField ='), studio.indexOf('const renderForm ='));
  const binary = studio.slice(studio.indexOf('const binaryPreference ='), studio.indexOf('const renderBathroomField ='));

  assert.match(studio, /STUDIO_FORM_FIELD_ORDER/);
  assert.match(studio, /getStudioCatalogFieldLabel\(id, mode\)/);
  assert.match(binary, /catalogField\.quickPicks/);
  assert.match(binary, /choice\.modeValues\[mode\]/);
  assert.match(binary, /getStudioCatalogChoiceLabel\(choice, mode\)/);
  assert.doesNotMatch(binary, /unknown|not_important|must_not_have/);
  assert.match(form, /case 'studioRoomCount'/);
  assert.match(form, /case 'bathrooms'/);
  assert.match(studio, /getStudioCatalogField\(fieldId\)\.fixedValue/);
  assert.match(studio, /getStudioCatalogField\('bathrooms'\)\.fixedValue/);
  assert.doesNotMatch(studio, /NumericQuickPick|studio-bathrooms"/);
  assert.match(studio, /getStudioBathroomConfirmationCase\(values\)/);
  assert.match(studio, /testID="studio-confirm-bathroom-replacement"/);
  assert.doesNotMatch(studio, /STUDIO_AMENITIES|studio-amenity-|reviewItem\(t\('studio\.amenities'/);
});

test('STRUCTURAL: field validation localizes and focuses the actual failing control before Review', async () => {
  const studio = await source;

  assert.match(studio, /setError\(firstIssue\s*/);
  assert.match(studio, /t\(`studio\.error\.\$\{firstIssue\.code\}`\)/);
  assert.match(studio, /first === 'preferredAreaMode' \? 'preferredAreaIds'/);
  assert.match(studio, /first === 'rentalPeriodId' \? 'cadence'/);
  assert.match(studio, /ref=\{setFocusTarget\('preferredAreaIds'\)\}/);
  assert.match(studio, /ref=\{setFocusTarget\('cadence'\)\}/);
  assert.match(studio, /target\?\.measureLayout/);
  assert.match(studio, /target\?\.focus\?\.\(\)/);
  assert.match(studio, /return result\.ok && wantedIdentityReady/);
});