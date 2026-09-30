import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolveSourcePath } from './sourcePath.ts';
import {
  buildStudioProperty,
  buildStudioRequirement,
  createStudioFormValues,
  getStudioBathroomConfirmationCase,
  readStudioProperty,
  validateStudioForm,
} from '@/services/studioFormModel';
import {
  getStudioCatalogChoiceLabel,
  getStudioCatalogField,
  getStudioCatalogFieldLabel,
  isStudioCatalogFieldApplicable,
  STUDIO_FORM_CATALOG,
  STUDIO_FORM_FIELD_ORDER,
} from '@/services/studioCatalog';

test('BEHAVIOR: shared Studio catalog supplies both mode-specific sequences and bilingual labels', () => {
  assert.deepEqual(STUDIO_FORM_FIELD_ORDER.offered, [
    'transaction', 'locationAreaId', 'price', 'rentalPeriodId',
    'areaSquareMeters', 'studioRoomCount', 'bathrooms', 'kitchen', 'hall',
    'parking', 'floorNumber', 'description',
  ]);
  assert.deepEqual(STUDIO_FORM_FIELD_ORDER.wanted, [
    'locationAreaId', 'budgetMinimum', 'budgetMaximum',
    'rentalPeriodId', 'areaSquareMeters', 'studioRoomCount', 'bathrooms',
    'kitchen', 'hall', 'parking', 'floorNumber', 'description',
  ]);
  assert.equal(getStudioCatalogFieldLabel('locationAreaId', 'wanted')[0], 'Preferred area');
  assert.equal(getStudioCatalogFieldLabel('locationAreaId', 'wanted')[1], 'المنطقة المفضلة');
  assert.deepEqual(getStudioCatalogFieldLabel('areaSquareMeters', 'offered'), [
    'Actual Studio area (m²)', 'مساحة الاستوديو الفعلية (م²)',
  ]);
  assert.deepEqual(getStudioCatalogFieldLabel('areaSquareMeters', 'wanted'), [
    'Minimum Studio area (m²)', 'الحد الأدنى لمساحة الاستوديو (م²)',
  ]);
  assert.equal(STUDIO_FORM_FIELD_ORDER.wanted.includes('transaction'), false);
  assert.equal(getStudioCatalogField('studioRoomCount').fixedValue, '1');
  assert.equal(getStudioCatalogField('bathrooms').fixedValue, '1');
  assert.equal(isStudioCatalogFieldApplicable('rentalPeriodId', 'offered', 'sale'), false);
  assert.equal(isStudioCatalogFieldApplicable('rentalPeriodId', 'wanted', 'rent'), true);
  assert.ok(STUDIO_FORM_CATALOG.every(field =>
    field.label.length === 2 && field.modes.length > 0));
  assert.equal(STUDIO_FORM_FIELD_ORDER.offered.includes('mapsLink'), false);

  const transactionChoices = getStudioCatalogField('transaction').quickPicks!;
  assert.deepEqual(getStudioCatalogChoiceLabel(transactionChoices[1], 'offered'), ['Sale', 'للبيع']);
  assert.deepEqual(getStudioCatalogChoiceLabel(transactionChoices[1], 'wanted'), ['Buy', 'للشراء']);
});

test('STRUCTURAL: Wanted Studio shows its prior transaction read-only and returns changes to the shared chooser', async () => {
  const studio = await readFile(resolveSourcePath('../app/capture/studio.tsx', import.meta.url), 'utf8');
  const form = studio.slice(studio.indexOf('const renderForm ='), studio.indexOf('const reviewItem ='));
  assert.match(form, /studio-transaction-summary/);
  assert.match(form, /transactionLabel\(\)/);
  assert.match(form, /testID="studio-transaction-change"/);
  assert.match(studio, /const personId = selectedPersonId \|\| seekerParam/);
  assert.match(studio, /params: \{ mode: 'wanted', \.\.\.\(personId \? \{ seekerId: personId \} : \{\}\) \}/);
  assert.match(studio, /if \(mode === 'wanted'\) return null/);
  assert.match(studio, /\{!editing \? \([\s\S]*testID="studio-transaction-change"[\s\S]*\) : null\}/);
  const review = studio.slice(studio.indexOf('const renderReview ='));
  assert.match(review, /mode === 'wanted' \? reviewItem\(catalogLabel\('transaction'\), studioReviewIntent\(\)\.label\)/);
});

test('REGRESSION: failed Offered Studio source linking blocks property and Home navigation until verified retry', async () => {
  const studio = await readFile(resolveSourcePath('../app/capture/studio.tsx', import.meta.url), 'utf8');
  assert.match(studio, /const \[propertySourceConfirmed, setPropertySourceConfirmed\] = useState\(false\)/);
  const linkFlow = studio.slice(
    studio.indexOf('const linkPropertySourceIfNeeded ='),
    studio.indexOf('const finishPropertySave ='),
  );
  assert.match(linkFlow, /await resolveStudioPersonSourceContext\(linkPersonId, sourceRole, store\)/);
  assert.match(linkFlow, /await ensureStudioPropertySourceLink\(property\.core\.id, context\.personId, context\.role, store\);[\s\S]*setPropertySourceConfirmed\(true\)/);
  assert.match(studio, /savedProperty && propertySourceConfirmed \? \(/);
  const successActions = studio.slice(
    studio.indexOf('{savedProperty && propertySourceConfirmed ? ('),
    studio.indexOf('{savedRequirement ? ('),
  );
  assert.match(successActions, /testID="studio-view-saved-property"/);
  assert.match(successActions, /testID="studio-home"/);
  const retry = studio.slice(
    studio.indexOf("{savedProperty && error === t('"),
    studio.indexOf('{committedRequirement.current'),
  );
  assert.match(retry, /navigateAfterPropertySave\(savedProperty\)/);
  assert.match(studio, /await linkPropertySourceIfNeeded\(property\);[\s\S]*router\.replace/);
});

test('STRUCTURAL: Offered Studio keeps its exact-location and media controls; Wanted omits them', async () => {
  const studio = await readFile(resolveSourcePath('../app/capture/studio.tsx', import.meta.url), 'utf8');
  const form = studio.slice(studio.indexOf('const renderForm ='), studio.indexOf('const reviewItem ='));
  assert.match(form, /textInput\('privateNotes'/);
  assert.match(form, /mode === 'offered' \? renderExactLocationSection\(\) : null/);
  assert.match(form, /mode === 'offered' \? renderStudioAttachments\(\) : null/);
  assert.match(studio, /testID="studio-open-google-maps"/);
  assert.match(studio, /testID="studio-add-media"/);
  assert.match(studio, /testID="studio-add-file"/);
  assert.match(studio, /setAttachmentCover/);
  assert.match(studio, /reorderAttachments/);
  assert.doesNotMatch(studio, /attachmentPersistence:/);
  assert.match(studio, /candidate,\s*baseline: baselineRequirement,\s*store,\s*navigate:/);
  assert.match(studio, /setSavedRequirement\(result\.requirement\)/);
});

test('BEHAVIOR: only two visible binary choices preserve untouched Offered and Wanted semantics', () => {
  for (const field of ['kitchen', 'hall', 'parking'] as const) {
    const definition = getStudioCatalogField(field);
    assert.equal(definition.quickPicks?.length, 2);
    assert.deepEqual(definition.quickPicks?.map(choice => choice.modeValues.offered), ['yes', 'no']);
    assert.deepEqual(
      definition.quickPicks?.map(choice => choice.modeValues.wanted),
      ['required', 'must_not_have'],
    );
    assert.equal(definition.untouchedValues?.offered, 'unknown');
    assert.equal(definition.untouchedValues?.wanted, 'not_important');
  }

  const offered = {
    ...createStudioFormValues('offered', 'sale'),
    locationAreaId: 'salmiya',
    price: '100',
  };
  const property = buildStudioProperty(offered, 'studio-ui-offer', 'studio-ui-active-offer');
  assert.equal(property.typeDetails?.propertyType === 'apartment' ? property.typeDetails.hasKitchen : true, undefined);
  assert.equal(readStudioProperty(property).kitchen, 'unknown');

  const wanted = {
    ...createStudioFormValues('wanted', 'sale'),
    preferredAreaMode: 'all_kuwait' as const,
    budgetMinimum: '0',
    budgetMaximum: '500',
  };
  assert.equal(validateStudioForm(wanted).ok, true);
  const requirement = buildStudioRequirement(
    wanted,
    '44444444-4444-4444-8444-444444444444',
    'eligible-seeker',
  );
  assert.equal(requirement.catalogPreferences?.some(preference =>
    preference.field === 'hasKitchen' || preference.field === 'hasHall' || preference.field === 'hasParking'), false);
});

test('BEHAVIOR: legacy bathroom values require explicit confirmation only when replacing them', () => {
  const missingBathroomProperty = {
    core: { id: 'legacy-studio-ui', propertyType: 'apartment' as const, locationArea: { id: 'salmiya' } },
    activeOffer: {
      id: 'legacy-studio-ui-offer',
      propertyCoreId: 'legacy-studio-ui',
      transaction: 'sale' as const,
      salePrice: { amount: 100, currencyCode: 'KWD' },
    },
    typeDetails: { propertyType: 'apartment' as const, apartmentSubtype: 'studio' as const },
  };
  const legacyValues = readStudioProperty(missingBathroomProperty);
  assert.equal(getStudioBathroomConfirmationCase(legacyValues), 'missing');
  const unchanged = buildStudioProperty(
    { ...legacyValues, description: 'Keep legacy bathroom unset' },
    missingBathroomProperty.core.id,
    missingBathroomProperty.activeOffer.id,
  );
  assert.equal(unchanged.typeDetails?.propertyType === 'apartment' ? unchanged.typeDetails.bathroomCount : 1, undefined);

  const replacement = { ...legacyValues, bathrooms: '1' };
  assert.ok(validateStudioForm(replacement).errors.some(error => error.field === 'bathrooms'));
  const confirmed = { ...replacement, legacyBathroomConfirmed: true };
  assert.equal(validateStudioForm(confirmed).ok, true);
  const replaced = buildStudioProperty(
    confirmed,
    missingBathroomProperty.core.id,
    missingBathroomProperty.activeOffer.id,
  );
  assert.equal(replaced.typeDetails?.propertyType === 'apartment' ? replaced.typeDetails.bathroomCount : undefined, 1);
});

test('BEHAVIOR: actual Studio field errors resolve to distinct English and Arabic messages', async () => {
  const source = await readFile(resolveSourcePath('../contexts/I18nContext.tsx', import.meta.url), 'utf8');
  const english = source.slice(source.indexOf('const en: Translations'), source.indexOf('const ar: Translations'));
  const arabic = source.slice(source.indexOf('const ar: Translations'));
  const message = (dictionary: string, code: string) =>
    dictionary.match(new RegExp(`'studio\\.error\\.${code}': '([^']+)'`))?.[1];

  const invalidArea = validateStudioForm({
    ...createStudioFormValues('offered', 'rent'),
    locationAreaId: 'not-a-kuwait-area',
  }).errors.find(issue => issue.field === 'locationAreaId');
  const invalidBudget = validateStudioForm({
    ...createStudioFormValues('wanted', 'rent'),
    preferredAreaMode: 'all_kuwait',
    budgetMinimum: '200',
    budgetMaximum: '100',
  }).errors.find(issue => issue.field === 'budgetMinimum');

  for (const issue of [invalidArea, invalidBudget]) {
    assert.ok(issue, 'production Studio validation returns the field-specific error');
    const englishMessage = message(english, issue.code);
    const arabicMessage = message(arabic, issue.code);
    assert.ok(englishMessage?.length);
    assert.ok(arabicMessage?.length);
    assert.notEqual(englishMessage, arabicMessage);
    assert.match(arabicMessage, /[\u0600-\u06ff]/);
  }
});

test('Studio Offered and Wanted Review summaries share the canonical record-intent label', async () => {
  const studio = await readFile(resolveSourcePath('../app/capture/studio.tsx', import.meta.url), 'utf8');
  const review = studio.slice(studio.indexOf('const renderReviewCatalogField ='));
  assert.match(studio, /projectRecordIntent\(\s*mode,\s*mode === 'wanted' && values\.transaction === 'sale' \? 'buy' : values\.transaction,\s*language,\s*\)/);
  assert.match(review, /case 'transaction': \{[\s\S]*?studioReviewIntent\(\)\.label/);
  assert.match(review, /mode === 'wanted' \? reviewItem\(catalogLabel\('transaction'\), studioReviewIntent\(\)\.label\)/);
  assert.doesNotMatch(review, /transactionLabel\(\)/);
});