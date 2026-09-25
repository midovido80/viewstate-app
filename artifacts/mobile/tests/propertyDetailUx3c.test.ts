import test from 'node:test';
import assert from 'node:assert/strict';
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
import { resolveWebAttachmentImageSources } from '../services/attachmentOperations.ts';
import { getPropertyMapsWebHref } from '../services/mapsLink.ts';

test('Property detail web navigation resolves same-ID action routes and a safe Home fallback', () => {
  assert.equal(getPropertyDetailActionHref('property /exact', 'edit'), '/property/property%20%2Fexact/edit');
  assert.equal(getPropertyDetailActionHref('property /exact', 'share'), '/property/property%20%2Fexact/share');
  assert.equal(getPropertyDetailBackRoute(), '/properties');
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

  await assert.rejects(
    resolveWebAttachmentImageSources([
      { id: 'missing', kind: 'image', uri: 'viewstate-web-attachment:missing' },
    ], blobStore, objectUrls),
    /ATTACHMENT_FILE_MISSING/,
  );
});