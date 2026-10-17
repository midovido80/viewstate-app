import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createLiteralText,
  createPrivacyMetadata,
  type Property,
} from '@workspace/property-domain';
import {
  formatPropertyDetailValue,
  getPropertyDetailActionHref,
  getPropertyDetailBackRoute,
  getPropertyDetailCategoryRows,
  getGalleryIndexFromScrollOffset,
  getPropertyDetailLocationDisplay,
  getPropertyDetailVisibleContent,
  getPropertySuccessRoutes,
  prioritizeHighlightedProperty,
} from '../services/propertyDetailPresentation.ts';
import { reorderAttachments, resolveWebAttachmentImageSources, setAttachmentCover } from '../services/attachmentOperations.ts';
import { getPropertyMapsWebHref } from '../services/mapsLink.ts';
import { openStudioWebMapsLocation } from '../services/studioWebActions.ts';
import {
  confirmCommittedPropertyReadback,
  discardPropertyEditDraftAndCleanupOwnedAttachments,
  getPropertyDetailMapsHref,
  getPropertyEditMapsFieldError,
  propertyEditChoicesAreDirty,
  shouldShowPropertyGallery,
} from '../services/propertyDetailEditorUx.ts';
import type { PropertyEditChoices, PropertyEditDraftV1 } from '../services/propertyUpdateRecovery.ts';
import { buildPropertyUpdateCandidate, createEditDraft } from '../services/propertyUpdateRecovery.ts';
import { getPropertyEditFormHref } from '../services/propertyFormRoutes.ts';
import { projectPropertyIntent, projectRecordIntent } from '../services/recordIntentPresentation.ts';

test('Property detail web navigation resolves same-ID action routes and a safe Home fallback', () => {
  assert.equal(getPropertyDetailActionHref('property /exact', 'edit'), '/property/property%20%2Fexact/edit');
  assert.equal(getPropertyDetailActionHref('property /exact', 'share'), '/property/property%20%2Fexact/share');
  assert.equal(getPropertyDetailBackRoute(), '/properties');
});

test('Saved Property Details exposes Home in detail and edit headers while retaining Back actions', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  const homeActionCount = (source.match(/testID="property-home-action"/g) ?? []).length;
  const backActionCount = (source.match(/testID="property-detail-back"/g) ?? []).length;
  assert.equal(homeActionCount, 2, 'one Home action belongs in each saved/detail and edit header');
  assert.equal(backActionCount, 3, 'loading fallback, saved detail, and edit retain their Back actions');
  assert.equal(
    (source.match(/onPress=\{\(\) => router\.replace\('\/' as never\)\}/g) ?? []).length,
    homeActionCount + 1,
    'the third route action is the existing loading/missing-state Back fallback, not a duplicate Home',
  );
  assert.equal((source.match(/accessibilityLabel=\{language === 'ar' \? 'الرئيسية' : 'Home'\}/g) ?? []).length, homeActionCount);
  assert.match(source, /onPress=\{\(\) => router\.replace\(getPropertyDetailBackRoute\(\) as never\)\}/);
  assert.match(source, /onPress=\{leaveEditor\}/);
});

test('Property Details uses the canonical intent label and never promotes an unknown transaction to sale', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  assert.equal(projectRecordIntent('offered', 'sale', 'en').label, 'Offered for Sale');
  assert.equal(projectRecordIntent('offered', 'rent', 'ar').label, 'معروض للإيجار');
  assert.deepEqual(projectRecordIntent('offered', 'buy', 'en'), {
    id: 'conflict',
    label: 'Record intent conflict',
    valid: false,
  });
  assert.equal(projectPropertyIntent({
    activeOffer: { transaction: 'sale' },
  } as unknown as Property, 'ar').label, 'معروض للبيع');
  assert.match(source, /const propertyIntent = projectPropertyIntent\(property, language\)/);
  assert.match(source, /\{propertyIntent\.label\}/);
  assert.match(source, /propertyIntent\.id === 'offered_sale'[\s\S]*property\.activeOffer\.salePrice\.amount/);
  assert.match(source, /propertyIntent\.id === 'offered_rent'[\s\S]*property\.activeOffer\.rentalPrice\.amount/);
  assert.doesNotMatch(source, /t\(`transaction\.\$\{property\.activeOffer\.transaction\}`\)/);
});

test('Enrichment save confirms exact readback before offering same-ID View Property and Home', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  const enrichmentRoute = await readFile('app/property/[propertyCoreId]/enrich.tsx', 'utf8');
  const editorUx = await readFile('services/propertyDetailEditorUx.ts', 'utf8');
  const save = source.slice(
    source.indexOf('const save = async () =>'),
    source.indexOf('const confirmDelete = async () =>'),
  );
  const readbackIndex = save.indexOf('confirmCommittedPropertyReadback(');
  const completionIndex = save.indexOf('setSaveCompletionVisible(true)');

  assert.match(enrichmentRoute, /\/edit\?completion=enrichment/);
  assert.ok(readbackIndex >= 0 && readbackIndex < completionIndex);
  assert.match(editorUx, /readback\?\.core\.id === candidate\.core\.id && exactPropertyEqual\(readback, candidate\)/);
  assert.match(save, /if \(!readback \|\| readback\.core\.id !== id\) \{[\s\S]*setError\(t\('edit\.save_failed'\)\);[\s\S]*setDraft\(null\);[\s\S]*setMode\('detail'\);[\s\S]*router\.replace\(`\/property\/\$\{encodeURIComponent\(id!\)\}` as never\);[\s\S]*return;/);
  assert.match(save, /if \(completionOrigin === 'enrichment'\) \{\s*setSaveCompletionVisible\(true\)/);
  assert.match(save, /if \(!draft \|\| saving \|\| saveFlight\.current\) return/);
  assert.match(source, /visible=\{saveCompletionVisible && completionOrigin === 'enrichment' && property\?\.core\.id === id\}/);
  assert.match(source, /testID="property-enrichment-save-completion"/);
  assert.match(source, /testID="property-enrichment-view-property"/);
  assert.match(source, /router\.replace\(`\/property\/\$\{encodeURIComponent\(property\.core\.id\)\}` as never\)/);
  assert.match(source, /testID="property-enrichment-home"/);
  assert.match(source, /router\.replace\('\/' as never\)/);
  assert.match(source, /summary\.view_property/);
  assert.match(source, /t\('home\.title'\)/);
});

test('A successful enrichment CAS with failed exact readback retries verification only and stays unconfirmed', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  const save = source.slice(
    source.indexOf('const save = async () =>'),
    source.indexOf('const confirmDelete = async () =>'),
  );
  const candidate = {
    core: {
      id: 'committed-readback-failure',
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
    },
    activeOffer: {
      id: 'committed-readback-failure-offer',
      propertyCoreId: 'committed-readback-failure',
      transaction: 'sale',
      salePrice: { amount: 100, currencyCode: 'KWD' },
    },
  } as Property;
  let committed: Property | null = null;
  let compareAndUpdateCalls = 0;
  let readbackCalls = 0;
  const compareAndUpdate = async (replacement: Property) => {
    compareAndUpdateCalls += 1;
    committed = replacement;
    return true;
  };

  assert.equal(await compareAndUpdate(candidate), true);
  const readback = await confirmCommittedPropertyReadback(candidate, async id => {
    readbackCalls += 1;
    assert.equal(id, candidate.core.id);
    throw new Error('transient read failure');
  });

  assert.equal(committed, candidate, 'the write remains committed despite failed verification');
  assert.equal(compareAndUpdateCalls, 1, 'verification failure must not retry the obsolete CAS');
  assert.equal(readbackCalls, 2, 'exact-ID verification gets one retry');
  assert.equal(readback, null, 'no success candidate exists without exact readback');
  assert.match(save, /setMode\('detail'\)[\s\S]*router\.replace\(`\/property\/\$\{encodeURIComponent\(id!\)\}` as never\)/);
});

test('Standard Apartment subtype survives enrichment edit reopen and uses the marked completion flow', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  const save = source.slice(
    source.indexOf('const save = async () =>'),
    source.indexOf('const confirmDelete = async () =>'),
  );
  const baseline = {
    core: { id: 'standard-subtype-enrichment', propertyType: 'apartment', locationArea: { id: 'salmiya' } },
    activeOffer: {
      id: 'standard-subtype-offer',
      propertyCoreId: 'standard-subtype-enrichment',
      transaction: 'sale',
      salePrice: { amount: 100, currencyCode: 'KWD' },
    },
    typeDetails: { propertyType: 'apartment', apartmentSubtype: 'standard_apartment' },
  } as Property;
  assert.equal(
    getPropertyEditFormHref(baseline.core.id, 'apartment', 'standard_apartment'),
    '/property/standard-subtype-enrichment/edit',
  );
  const draft = createEditDraft(baseline);
  const candidate = buildPropertyUpdateCandidate(baseline, {
    ...draft.choices,
    description: 'Saved standard apartment enrichment',
  });
  assert.equal(candidate.core.id, baseline.core.id);
  const reopened = createEditDraft(candidate);
  assert.equal(reopened.propertyCoreId, baseline.core.id);
  assert.equal(reopened.choices.canonicalDetails?.apartmentSubtype, 'standard_apartment');
  assert.match(save, /completionOrigin === 'enrichment'\) \{\s*setSaveCompletionVisible\(true\)/);
  assert.doesNotMatch(
    save.slice(save.indexOf("if (completionOrigin === 'enrichment')")),
    /standardApartment/,
    'completion applies to the marked supported-type editor, including reopened Standard Apartments',
  );
});

test('Property Details gallery resolves web blob refs and reports missing image blobs visibly', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  assert.match(source, /createIndexedDbWebAttachmentBlobStore\(\)/);
  assert.match(source, /resolveWebAttachmentImageSources\(images, webBlobStore\.current!\)/);
  assert.match(source, /source=\{\{ uri: Platform\.OS === 'web' \? galleryImageSources\[img\.id\] : img\.managedUri \}\}/);
  assert.match(source, /testID="property-gallery-resolution-error"/);
  assert.match(source, /setGalleryResolutionError\(message\)/);
  assert.match(source, /revokeSources\(\)/);
});

test('Property detail web Maps href accepts only validated Google links or bounded coordinates', () => {
  const savedLink = 'https://www.google.com/maps/place/Kuwait';
  assert.equal(getPropertyMapsWebHref(savedLink, undefined), savedLink);
  assert.equal(
    getPropertyMapsWebHref(undefined, { latitude: 29.3759, longitude: 47.9774 }),
    'https://www.google.com/maps/search/?api=1&query=29.3759%2C47.9774',
  );
  assert.equal(
    getPropertyMapsWebHref('https://evil.example/maps?redirect=evil', { latitude: 29.3759, longitude: 47.9774 }),
    null,
  );
  assert.equal(
    getPropertyMapsWebHref(undefined, { latitude: 40, longitude: -74 }),
    null,
  );
});

test('Property success presents distinct exact-ID detail and Properties destinations', () => {
  assert.deepEqual(getPropertySuccessRoutes(), {
    detail: null,
    properties: null,
    home: '/',
  });
  assert.deepEqual(getPropertySuccessRoutes('core /saved'), {
    detail: '/property/core%20%2Fsaved',
    properties: '/properties?highlight=core%20%2Fsaved',
    home: '/',
  });
});

test('Highlighted Properties ordering promotes only the exact ID and preserves stored order', () => {
  const properties = ['older', 'saved-exact', 'saved-exact-copy'].map(id => ({
    core: { id },
  }));
  const highlighted = prioritizeHighlightedProperty(properties, 'saved-exact');
  assert.deepEqual(highlighted.map(property => property.core.id), [
    'saved-exact',
    'older',
    'saved-exact-copy',
  ]);
  assert.deepEqual(properties.map(property => property.core.id), [
    'older',
    'saved-exact',
    'saved-exact-copy',
  ]);
  assert.deepEqual(
    prioritizeHighlightedProperty(properties, 'not-found').map(property => property.core.id),
    ['older', 'saved-exact', 'saved-exact-copy'],
  );
});

test('Property detail visible content retains description and excludes private notes', () => {
  const property = {
    core: {
      id: 'detail-privacy',
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
      description: createLiteralText('Public description', createPrivacyMetadata('normal', 'normal')),
      privateNotes: createLiteralText('never show this private note', createPrivacyMetadata('private_notes', 'never')),
    },
    activeOffer: {
      id: 'detail-privacy-offer',
      propertyCoreId: 'detail-privacy',
      transaction: 'sale',
      salePrice: { amount: 1, currencyCode: 'KWD' },
    },
  } as Property;
  const visible = getPropertyDetailVisibleContent(property);
  assert.deepEqual(visible, { description: 'Public description', typeDetails: {} });
  assert.doesNotMatch(JSON.stringify(visible), /never show this private note/);
});

test('Approved apartment subtype detail values use the localized translator', () => {
  const translationKey = 'enrich.apartment_subtype.studio';
  assert.equal(
    formatPropertyDetailValue(
      'apartmentSubtype',
      'studio',
      'ar',
      key => key === translationKey ? 'استوديو' : key,
    ),
    'استوديو',
  );
});

test('Approved Villa category details are localized, canonical-first, and public-only', () => {
  const metadata = {
    categoryId: 'villa',
    numericValues: {
      masterBedroomCount: 1,
      bedroomCount: 2,
      floorCount: 0,
      privateNotes: 99,
      latitude: 29,
    },
    choices: {
      furnishing: 'furnished',
      privateNotes: 'secret',
    },
  } as Property['demoCapture'];
  const canonicalDetails = {
    bedroomCount: { value: 4 },
  };
  const englishRows = getPropertyDetailCategoryRows(metadata, canonicalDetails, 'en', 'villa');
  const arabicRows = getPropertyDetailCategoryRows(metadata, canonicalDetails, 'ar', 'villa');

  assert.deepEqual(englishRows, [
    { field: 'floorCount', label: 'Floors', value: '0' },
    { field: 'masterBedroomCount', label: 'Master bedrooms', value: '1' },
    { field: 'furnishing', label: 'Furnishing', value: 'Furnished' },
  ]);
  assert.deepEqual(arabicRows, [
    { field: 'floorCount', label: 'عدد الأدوار', value: '0' },
    { field: 'masterBedroomCount', label: 'غرف ماستر', value: '1' },
    { field: 'furnishing', label: 'التأثيث', value: 'مفروشة' },
  ]);

  // The saved category value is omitted when a canonical value exists.
  assert.equal(englishRows.some(row => row.field === 'bedroomCount'), false);
  assert.equal(formatPropertyDetailValue('bedroomCount', canonicalDetails.bedroomCount, 'en'), '4');
  // A validated canonical type snapshot prevents deleted mapped values from
  // being resurrected, while Villa-only master-bedroom data stays available.
  assert.deepEqual(
    getPropertyDetailCategoryRows(metadata, { propertyType: 'villa' }, 'en', 'villa'),
    [{ field: 'masterBedroomCount', label: 'Master bedrooms', value: '1' }],
  );
  assert.deepEqual(
    getPropertyDetailCategoryRows(metadata, {}, 'en', 'shop'),
    [],
  );
  // Falsy canonical values are still authoritative; absent fields remain absent.
  assert.equal(
    getPropertyDetailCategoryRows(metadata, { propertyType: 'villa', furnishing: false }, 'en', 'villa')
      .some(row => row.field === 'furnishing'),
    false,
  );
  assert.equal(
    getPropertyDetailCategoryRows({ categoryId: 'villa' }, {}, 'en', 'villa').length,
    0,
  );
  assert.equal(formatPropertyDetailValue('hasPool', false, 'en'), 'No');
  assert.doesNotMatch(JSON.stringify([...englishRows, ...arabicRows]), /privateNotes|secret|latitude|29/);
});

test('Gallery page offsets select the visible image and clamp to valid indices', () => {
  const images = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
  assert.equal(images[getGalleryIndexFromScrollOffset(0, 300, images.length)].id, 'first');
  assert.equal(images[getGalleryIndexFromScrollOffset(300, 300, images.length)].id, 'second');
  assert.equal(images[getGalleryIndexFromScrollOffset(620, 300, images.length)].id, 'third');
  assert.equal(getGalleryIndexFromScrollOffset(-300, 300, images.length), 0);
  assert.equal(getGalleryIndexFromScrollOffset(900, 300, images.length), 2);
  assert.equal(getGalleryIndexFromScrollOffset(300, 0, images.length), 0);
});

test('Property location display projects only saved public location fields in detail order', () => {
  const location = getPropertyDetailLocationDisplay({
    governorate: 'Hawalli',
    area: 'Salmiya',
    block: '4',
    address: 'Street 2, Building 10',
    description: 'Bright apartment near the park',
  });
  assert.deepEqual(location, [
    { field: 'governorate', value: 'Hawalli' },
    { field: 'area', value: 'Salmiya' },
    { field: 'block', value: '4' },
    { field: 'address', value: 'Street 2, Building 10' },
    { field: 'description', value: 'Bright apartment near the park' },
  ]);
  assert.deepEqual(
    getPropertyDetailLocationDisplay({ governorate: 'Hawalli', area: 'Salmiya' }),
    [
      { field: 'governorate', value: 'Hawalli' },
      { field: 'area', value: 'Salmiya' },
    ],
  );
  assert.doesNotMatch(JSON.stringify(location), /private|coordinates|latitude|longitude/);
});

test('Web property gallery resolves persisted IndexedDB refs and revokes transient URLs', async () => {
  const blobs = new Map<string, Blob>([
    ['viewstate-web-attachment:core:image', new Blob(['persisted image'], { type: 'image/png' })],
  ]);
  const requested: string[] = [];
  const created: Blob[] = [];
  const revoked: string[] = [];
  const blobStore = {
    put: async () => {},
    get: async (reference: string) => {
      requested.push(reference);
      return blobs.get(reference) ?? null;
    },
    delete: async () => {},
  };
  const objectUrls = {
    createObjectURL: (blob: Blob) => {
      created.push(blob);
      return `blob:test-${created.length}`;
    },
    revokeObjectURL: (url: string) => { revoked.push(url); },
  };
  const resolved = await resolveWebAttachmentImageSources([
    { id: 'image', kind: 'image', uri: 'viewstate-web-attachment:core:image' },
    { id: 'video', kind: 'video', uri: 'viewstate-web-attachment:core:video' },
    { id: 'legacy-image', kind: 'image', uri: 'data:image/png;base64,legacy' },
  ], blobStore, objectUrls);
  assert.deepEqual(requested, ['viewstate-web-attachment:core:image']);
  assert.equal(created.length, 1);
  assert.deepEqual(resolved.sources, {
    image: 'blob:test-1',
    'legacy-image': 'data:image/png;base64,legacy',
  });
  resolved.revoke();
  resolved.revoke();
  assert.deepEqual(revoked, ['blob:test-1']);

  // A saved reference still resolves on a later detail-screen visit; object
  // URLs are recreated from the persisted blob rather than reusing a dead URL.
  const afterReload = await resolveWebAttachmentImageSources([
    { id: 'image', kind: 'image', uri: 'viewstate-web-attachment:core:image' },
  ], blobStore, objectUrls);
  assert.deepEqual(afterReload.sources, { image: 'blob:test-2' });
  afterReload.revoke();
  assert.deepEqual(revoked, ['blob:test-1', 'blob:test-2']);

  await assert.rejects(
    resolveWebAttachmentImageSources([
      { id: 'missing', kind: 'image', uri: 'viewstate-web-attachment:missing' },
    ], blobStore, objectUrls),
    /ATTACHMENT_FILE_MISSING/,
  );
});

test('Apartment Maps editor validates HTTPS Google links with field-localized errors', () => {
  assert.equal(getPropertyEditMapsFieldError('', 'en'), '');
  assert.equal(getPropertyEditMapsFieldError('https://www.google.com/maps/place/Kuwait', 'en'), '');
  assert.equal(
    getPropertyEditMapsFieldError('http://www.google.com/maps/place/Kuwait', 'en'),
    'Enter a valid, secure Google Maps URL (HTTPS).',
  );
  assert.equal(
    getPropertyEditMapsFieldError('https://evil.example/maps/place/Kuwait', 'ar'),
    'أدخل رابط خرائط Google صالحًا وآمنًا (HTTPS).',
  );
  assert.equal(
    getPropertyEditMapsFieldError(
      'https://www.google.com/maps/search/?api=1&https://www.google.com/maps/search/?api=1&query=Salmiya%2C%20Kuwait',
      'en',
    ),
    'Enter a valid, secure Google Maps URL (HTTPS).',
    'an automation append that concatenates two URLs is rejected as an Apartment field error',
  );
});

test('Apartment Maps links survive candidate save, same-ID reload, and detail link projection', () => {
  const baseline = {
    core: {
      id: 'apartment-maps-roundtrip',
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
    },
    activeOffer: {
      id: 'apartment-maps-offer',
      propertyCoreId: 'apartment-maps-roundtrip',
      transaction: 'rent',
      rentalPrice: { amount: 100, currencyCode: 'KWD' },
      rentalPeriodId: 'monthly',
    },
  } as Property;
  const link = 'https://www.google.com/maps/place/Salmiya';
  const draft = createEditDraft(baseline);
  const saved = buildPropertyUpdateCandidate(baseline, { ...draft.choices, mapsLink: link });
  assert.equal(saved.locationEnrichment?.mapsLink?.value, link);
  const reloadedDraft = createEditDraft(saved);
  assert.equal(reloadedDraft.propertyCoreId, baseline.core.id);
  assert.equal(reloadedDraft.choices.mapsLink, link);
  assert.equal(getPropertyMapsWebHref(reloadedDraft.choices.mapsLink, undefined), link);
});

test('Apartment replacing a populated Maps search preserves the pasted URL through save, reload, and Open', () => {
  const previousSearchUrl = 'https://www.google.com/maps/search/?api=1&query=Salmiya%2C%20Kuwait';
  const pastedMapsUrl = 'https://www.google.com/maps/place/Salmiya/@29.3375,48.0761,15z';
  const baseline = {
    core: {
      id: 'apartment-maps-replacement',
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
    },
    activeOffer: {
      id: 'apartment-maps-replacement-offer',
      propertyCoreId: 'apartment-maps-replacement',
      transaction: 'rent',
      rentalPrice: { amount: 100, currencyCode: 'KWD' },
      rentalPeriodId: 'monthly',
    },
    locationEnrichment: {
      mapsLink: createLiteralText(
        previousSearchUrl,
        createPrivacyMetadata('exact_location', 'explicit_per_share'),
      ),
    },
  } as Property;
  const initialDraft = createEditDraft(baseline);
  assert.equal(initialDraft.choices.mapsLink, previousSearchUrl);

  const replacedDraft = {
    ...initialDraft,
    choices: { ...initialDraft.choices, mapsLink: pastedMapsUrl },
  };
  const saved = buildPropertyUpdateCandidate(baseline, replacedDraft.choices);
  assert.equal(saved.locationEnrichment?.mapsLink?.value, pastedMapsUrl);
  const reloadedDraft = createEditDraft(saved);
  assert.equal(reloadedDraft.choices.mapsLink, pastedMapsUrl);

  let popupUrl = '';
  openStudioWebMapsLocation(
    { link: reloadedDraft.choices.mapsLink ?? '', query: 'Salmiya, Kuwait' },
    url => {
      popupUrl = url;
      return null;
    },
  );
  assert.equal(popupUrl, pastedMapsUrl, 'a supplied valid URL opens exactly, without prepending the area query');
});

test('Apartment clean exit keeps staged-file ownership on CAS conflict and cleans it after restart', async () => {
  const baseline = {
    core: {
      id: 'apartment-clean-exit',
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
    },
    activeOffer: {
      id: 'apartment-clean-exit-offer',
      propertyCoreId: 'apartment-clean-exit',
      transaction: 'rent',
      rentalPrice: { amount: 100, currencyCode: 'KWD' },
      rentalPeriodId: 'monthly',
    },
  } as Property;
  const baseDraft = createEditDraft(baseline);
  const draft: PropertyEditDraftV1 = {
    ...baseDraft,
    choices: {
      ...baseDraft.choices,
      newlyCopiedAttachmentUris: ['managed://restart-owned-image'],
    },
  };
  const deleted = new Set<string>();
  const conflict = await discardPropertyEditDraftAndCleanupOwnedAttachments({
    draft,
    transientOwnedUris: [],
    discardDraft: async () => false,
    deleteAttachment: async uri => { deleted.add(uri); },
  });
  assert.equal(conflict.status, 'conflict');
  assert.deepEqual(conflict.ownedUris, []);
  assert.deepEqual([...deleted], [], 'a failed draft CAS must never delete attachments still referenced by stored recovery');

  const discarded = await discardPropertyEditDraftAndCleanupOwnedAttachments({
    draft,
    transientOwnedUris: [],
    discardDraft: async () => true,
    deleteAttachment: async uri => { deleted.add(uri); },
  });
  assert.equal(discarded.status, 'discarded');
  assert.deepEqual(discarded.ownedUris, ['managed://restart-owned-image']);
  assert.deepEqual([...deleted], ['managed://restart-owned-image'], 'reloaded edit state cleans from durable choices ownership');
});

test('Apartment Property Details opens an area search only when exact map data is absent', () => {
  assert.equal(
    getPropertyDetailMapsHref({ allowAreaSearch: true, areaQuery: 'Salmiya' }),
    'https://www.google.com/maps/search/?api=1&query=Salmiya',
  );
  assert.equal(
    getPropertyDetailMapsHref({
      allowAreaSearch: true,
      areaQuery: 'Salmiya',
      link: 'https://evil.example/maps/place',
    }),
    null,
    'invalid saved links fail closed instead of falling back to an area search',
  );
  assert.equal(
    getPropertyDetailMapsHref({ allowAreaSearch: false, areaQuery: 'Salmiya' }),
    null,
  );
});

test('Apartment edit dirty state ignores hydration and normalization, but tracks semantic values', () => {
  const clean: PropertyEditChoices = {
    propertyType: 'apartment',
    transaction: 'sale',
    locationAreaId: 'salmiya',
    mapsLink: '',
    canonicalDetails: { bedroomCount: '2', bathroomCount: '1' },
    attachments: [],
  };
  assert.equal(propertyEditChoicesAreDirty(clean, { ...clean }), false);
  assert.equal(propertyEditChoicesAreDirty(clean, { ...clean, mapsLink: '  ' }), false);
  assert.equal(propertyEditChoicesAreDirty({ ...clean, attachments: undefined }, { ...clean, attachments: [] }), false);
  assert.equal(propertyEditChoicesAreDirty(clean, {
    ...clean,
    canonicalDetails: { bathroomCount: '1', bedroomCount: '2' },
  }), false);
  assert.equal(propertyEditChoicesAreDirty(clean, {
    ...clean,
    canonicalDetails: { ...clean.canonicalDetails, bedroomCount: '3' },
  }), true);
  assert.equal(propertyEditChoicesAreDirty(clean, {
    ...clean,
    attachments: [{
      id: 'new-file',
      kind: 'pdf',
      originalName: 'floor-plan.pdf',
      mimeType: 'application/pdf',
      managedUri: 'viewstate-web-attachment:property:new-file',
      order: 0,
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    }],
  }), true);
});

test('Apartment attachment ordering and cover selection preserve managed identity and URIs', () => {
  const attachments = [
    { id: 'apartment-image', kind: 'image' as const, originalName: 'front.jpg', mimeType: 'image/jpeg', uri: 'managed://front', order: 0 },
    { id: 'apartment-plan', kind: 'pdf' as const, originalName: 'plan.pdf', mimeType: 'application/pdf', uri: 'managed://plan', order: 1 },
  ];
  const reordered = reorderAttachments(attachments, ['apartment-plan', 'apartment-image']);
  assert.deepEqual(reordered.map(item => [item.id, item.uri, item.order]), [
    ['apartment-plan', 'managed://plan', 0],
    ['apartment-image', 'managed://front', 1],
  ]);
  assert.equal(setAttachmentCover(reordered, 'apartment-image').find(item => item.id === 'apartment-image')?.isCover, true);
});

test('Apartment gallery is omitted without images, including PDF-only attachment lists', () => {
  assert.equal(shouldShowPropertyGallery(0), false);
  assert.equal(shouldShowPropertyGallery(1), true);
});

test('Property detail gallery is image-only for every type and omits empty/PDF-only media placeholders', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  assert.match(source, /const galleryImages = \(property\?\.attachments \?\? \[\]\)\.filter\(a => a\.kind === 'image'\)/);
  assert.match(source, /\{shouldShowPropertyGallery\(galleryImages\.length\) \?/);
  assert.doesNotMatch(source, /shouldShowPropertyGallery\(galleryImages\.length\)\s*\|\|\s*!standardApartment/);
  assert.doesNotMatch(source, /height: 260, borderRadius: 20, backgroundColor: colors\.card, alignItems: 'center', justifyContent: 'center'/);
  assert.match(source, /const otherFiles = \(property\?\.attachments \?\? \[\]\)\.filter\(a => a\.kind !== 'image'\)/);
});

test('All property editors wire verified Maps opening, platform-specific attachment pickers, previews, and apartment clean Back', async () => {
  const source = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  assert.match(source, /getPropertyDetailMapsHref/);
  assert.match(source, /discardPropertyEditDraftAndCleanupOwnedAttachments/);
  assert.match(source, /openStudioWebMapsLocation\(\{ link, query \}\)/);
  assert.match(source, /openGoogleMapsQuery\(query\)/);
  assert.match(source, /openStudioWebFilePicker\([\s\S]*accept: mediaTypes\[0\] === 'images' \? 'image\/\*' : 'video\/\*'/);
  assert.match(source, /openStudioWebFilePicker\([\s\S]*accept: 'application\/pdf'/);
  assert.match(source, /Platform\.OS !== 'web' \|\| galleryImageSources\[attachment\.id\]/);
  assert.match(source, /propertyEditChoicesAreDirty\(cleanChoicesRef\.current, next\.choices\)/);
  assert.match(source, /if \(!standardApartment \|\| editDirty\) \{\s*setLeaveVisible\(true\)/);
  assert.match(source, /testID=\"property-edit-maps-link-error\"/);
  assert.match(source, /persistAttachmentsThenDeleteRemoved/);
  assert.doesNotMatch(source, /if \(standardApartment && Platform\.OS === 'web'\)/);
  assert.doesNotMatch(source, /standardApartment && mapsFieldError/);
  assert.doesNotMatch(source, /standardApartment && attachment\.kind === 'image'/);
  assert.match(source, /allowAreaSearch: true/);
  const capture = await readFile('app/capture/index.tsx', 'utf8');
  assert.match(capture, /openStudioWebMapsLocation\(\{ link, query \}\)/);
  assert.match(capture, /openGoogleMapsQuery\(query\)/);
  assert.match(capture, /resolveWebAttachmentImageSources/);
  assert.match(capture, /persistCaptureDetails/);
});

test('Property Details displays the persisted source role, not the role-picker default', async () => {
  const screen = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  const sourceCard = screen.slice(
    screen.indexOf('testID="property-source-person"'),
    screen.indexOf('testID="property-source-unlink"'),
  );
  assert.match(sourceCard, /source\.role\.\$\{source\?\.role\}/);
  assert.doesNotMatch(sourceCard, /source\.role\.\$\{sourceRole\}/);
  assert.match(screen, /store\.getPropertySource\(id\)/);
});
