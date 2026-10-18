import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolveSourcePath } from './sourcePath.ts';

const source = readFile(
  resolveSourcePath('../app/capture/studio.tsx', import.meta.url),
  'utf8',
);

test('STRUCTURAL: optional Wanted identity precedes criteria and pinned routing checks the exact eligible Person', async () => {
  const studio = await source;
  const form = studio.slice(studio.indexOf('const renderForm ='), studio.indexOf('const reviewItem ='));

  assert.match(studio, /store\.getPerson\(seekerParam\)/);
  assert.match(studio, /setSelectedPersonId\(seekerParam \?\? ''\)/);
  assert.match(studio, /selectedPerson\.id === seekerParam/);
  assert.match(studio, /person\.classifications\.includes\('seeker'\)/);
  assert.match(studio, /result\.filter\(person => person\.classifications\.includes\('seeker'\)\)/);
  assert.match(form, /\{mode === 'wanted' && \(seekerParam \|\| editing\) \? renderPersonSelector\(\) : null\}/);
  assert.doesNotMatch(form, /mode === 'wanted' && !wantedIdentityReady \? null :/);
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
  assert.match(studio, /STUDIO_FEATURES\.map/);
  assert.match(studio, /studio-amenity-/);
  assert.match(form, /case 'nearbyServices'/);
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

test('REGRESSION: header and Android Back return from Review without resetting the Studio draft', async () => {
  const studio = await source;
  const returnToFormStart = studio.indexOf('const returnToForm =');
  const returnToFormEnd = studio.indexOf('\n\n  useEffect(', returnToFormStart);
  const returnToForm = studio.slice(returnToFormStart, returnToFormEnd);
  const headerStart = studio.indexOf('testID="studio-close"');
  const headerEnd = studio.indexOf('<Text style={[styles.title', headerStart);
  const header = studio.slice(headerStart, headerEnd);
  const hardwareBackStart = studio.indexOf("BackHandler.addEventListener('hardwareBackPress'");
  const hardwareBackEnd = studio.indexOf('return () => subscription.remove();', hardwareBackStart);
  const hardwareBack = studio.slice(hardwareBackStart, hardwareBackEnd);

  assert.match(returnToForm, /setError\(''\);\s*setStep\('form'\)/);
  assert.doesNotMatch(returnToForm, /setValues|setAttachments|stagedFiles\.current\.clear/);
  assert.match(header, /onPress=\{handleHeaderBack\}/);
  assert.match(studio, /const handleHeaderBack = \(\) => \{\s*if \(showingReview\) returnToForm\(\);\s*else leaveStudio\(\);/);
  assert.match(studio, /if \(router\.canGoBack\(\)\) \{\s*router\.back\(\);\s*return;\s*\}/);
  assert.match(studio, /const target = getEditBackTarget\(\);\s*if \(target\) router\.replace\(target as never\);/);
  assert.match(hardwareBack, /if \(step === 'review'\) \{\s*returnToForm\(\);\s*return true;\s*\}\s*leaveStudio\(\)/);
  assert.match(studio, /title=\{t\('studio\.back'\)\} onPress=\{returnToForm\}/);
  assert.match(studio, /title=\{t\('studio\.next'\)\}[\s\S]*validate\(\)\) setStep\('review'\)/);
  assert.match(studio, /const \[values, setValues\] = useState/);
  assert.match(studio, /const \[attachments, setAttachments\] = useState/);
});

test('STRUCTURAL: only Offered Studio exposes durable media and exact Maps controls', async () => {
  const studio = await source;
  assert.match(studio, /mode === 'offered' \? renderExactLocationSection\(\) : null/);
  assert.match(studio, /mode === 'offered' \? renderStudioAttachments\(\) : null/);
  assert.doesNotMatch(studio, /pickAndStoreRequirementMedia|pickAndStoreRequirementPdfs|createWebRequirementAttachments/);
  assert.doesNotMatch(studio, /attachmentPersistence:/);
  assert.match(studio, /openPastedLocationLink/);
  assert.match(studio, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(studio, /testID="studio-view-saved-property"/);
  assert.match(studio, /testID="studio-link-later"/);
  assert.match(studio, /pathname: '\/requirement\/\[requirementId\]'/);
  assert.match(studio, /testID="studio-home"/);
});

test('REGRESSION: Studio web Maps preserves the route and file actions invoke separate browser pickers', async () => {
  const studio = await source;
  const exactLocation = studio.slice(
    studio.indexOf('const renderExactLocationSection ='),
    studio.indexOf('const renderStudioAttachments ='),
  );
  const attachments = studio.slice(
    studio.indexOf('const renderStudioAttachments ='),
    studio.indexOf('const reviewItem ='),
  );
  const errorSummary = studio.slice(
    studio.indexOf('testID="studio-form-error-summary"'),
    studio.indexOf("!showingReview ? renderForm()"),
  );

  assert.match(exactLocation, /Platform\.OS === 'web'[\s\S]*openStudioWebMapsLocation\(\{ link, query \}\)/);
  assert.match(exactLocation, /openPastedLocationLink\(\{ source: 'pasted_link', link \}, Linking\)/);
  assert.match(studio, /openStudioWebFilePicker\(\{[\s\S]*accept: kind === 'images' \? 'image\/\*' : kind === 'videos' \? 'video\/\*' : '\.pdf,application\/pdf'/);
  assert.match(attachments, /addStudioWebFiles\('images'\)/);
  assert.match(attachments, /addStudioWebFiles\('videos'\)/);
  assert.match(attachments, /addStudioWebFiles\('pdf'\)/);
  assert.match(errorSummary, /accessibilityRole="alert"/);
  assert.match(studio, /catch \{\s*\/\/ Keep the field-specific error visible even if a host cannot measure\./);
});
