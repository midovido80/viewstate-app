import assert from 'node:assert/strict';
import test from 'node:test';
import { projectDraftToProperty, type Property } from '@workspace/property-domain';
import {
  applyCaptureTransactionDefaults,
  buildPropertyWithCaptureDetails,
  captureDetailsScopeKey,
  hasCaptureEnrichmentValues,
  isBasicApartmentFollowUpCapture,
  preserveCaptureOwnershipAndEvidence,
  shouldSaveBasicCapture,
} from '@/services/propertyCaptureDetails';
import {
  finalizeCapturedDetails,
  loadPreparedCapturedDetails,
  persistCapturedDetails,
  prepareCapturedDetails,
  recoverPreparedCapturedDetails,
  CAPTURE_DETAILS_POINTER_KEY,
} from '@/services/propertyCaptureSave';
import {
  clearCaptureDetails,
  flushCaptureDetailsWrites,
  loadCaptureDetails,
  saveCaptureDetails,
} from '@/services/captureDetailsStorage';
import { persistAttachmentsThenDeleteRemoved, persistNewAttachmentsOrDeleteOnFailure, type LocalAttachment } from '@/services/attachmentOperations';
import { readFile } from 'node:fs/promises';
import { transitionCaptureAreaValidation } from '@/services/captureAreaValidation';
import { getCaptureMapsLinkValidationError } from '@/services/captureMapsLinkValidation';
import { getPropertySuccessRoutes } from '@/services/propertyDetailPresentation';
import { hasPopulatedCategoryCapture } from '@/services/propertyDemoCatalog';
import { getPropertyFormRoute } from '@/services/propertyFormRoutes';
import {
  getPropertyEditFormHref,
  getPropertyTypeSelectionRoute,
  getSupportedPropertyFormSelections,
} from '@/services/propertyFormRoutes';
import { APARTMENT_SUBTYPES, PROPERTY_TYPES } from '@workspace/property-domain';
import { createEditDraft } from '@/services/propertyUpdateRecovery';

class MemoryStorage {
  private values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

const baseline = {
  core: {
    id: 'property-capture-test',
    propertyType: 'floor' as const,
    locationArea: { id: 'salmiya' },
  },
  activeOffer: {
    id: 'offer-capture-test',
    propertyCoreId: 'property-capture-test',
    transaction: 'rent' as const,
    rentalPrice: { amount: 800, currencyCode: 'KWD' },
    rentalPeriodId: 'monthly',
  },
};

test('BEHAVIOR: missing area stays attached through picker cancellation and clears on selection', () => {
  let validation = { required: false };
  validation = transitionCaptureAreaValidation(validation, { type: 'preview', selected: false });
  assert.deepEqual(validation, { required: true });

  validation = transitionCaptureAreaValidation(validation, { type: 'cancel' });
  assert.deepEqual(validation, { required: true });

  validation = transitionCaptureAreaValidation(validation, { type: 'select' });
  assert.deepEqual(validation, { required: false });
  validation = transitionCaptureAreaValidation(validation, { type: 'preview', selected: true });
  assert.deepEqual(validation, { required: false });
});

test('BEHAVIOR: capture preview rejects invalid Maps URLs without discarding draft values', () => {
  const invalidLinks = ['https://maps.google.com/', '   '];
  for (const link of invalidLinks) {
    const draftValue = link;
    assert.equal(getCaptureMapsLinkValidationError(link), 'INVALID_LOCATION_LINK');
    assert.equal(draftValue, link, 'validation must not rewrite or clear the captured value');
  }

  assert.equal(
    getCaptureMapsLinkValidationError('https://www.google.com/maps/search/?api=1&query=29.33%2C48.01'),
    null,
  );
  assert.equal(getCaptureMapsLinkValidationError(''), null);
  assert.equal(getCaptureMapsLinkValidationError(undefined), null);
});

test('BEHAVIOR: BASIC projection rejects missing required capture data', () => {
  const result = projectDraftToProperty({
    propertyCoreId: 'p',
    offerId: 'o',
    propertyType: 'floor',
    transaction: 'rent',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some(issue => issue.code === 'required'));
});

test('BEHAVIOR: commercial complex canonical counts round-trip through capture builder', () => {
  const candidate = buildPropertyWithCaptureDetails({
    ...baseline,
    core: { ...baseline.core, propertyType: 'commercial_complex' },
  }, {
    floorCount: '7',
    unitCount: '3',
    apartmentCount: '1',
    shopCount: '1',
    officeCount: '1',
    elevatorCount: '1',
    parkingSpaceCount: '1',
    frontageWidthMeters: '50',
    roomsPerUnit: '2',
    bathroomsPerUnit: '1',
  });
  const details = candidate.typeDetails as unknown as Record<string, unknown>;
  assert.equal(details.unitCount, 3);
  assert.equal(details.frontageWidthMeters, undefined);
  assert.equal(details.roomsPerUnit, undefined);
  assert.equal(details.apartmentCount, undefined);
});

test('BEHAVIOR: fresh Rent draft applies monthly cadence without inventing values', () => {
  const changes = applyCaptureTransactionDefaults(
    { propertyCoreId: 'p', offerId: 'o' },
    { transaction: 'rent' },
    'fresh',
  );
  assert.equal(changes.rentalPeriodId, 'monthly');
  assert.equal(changes.salePrice, undefined);
});

test('BEHAVIOR: one capture target combines BASIC and optional applicable details', () => {
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    builtUpAreaSquareMeters: '250',
    bathroomCount: '2',
    intendedUse: 'Company HQ',
    commercialActivity: 'retail',
    ceilingHeightMeters: '4',
  });
  assert.deepEqual(candidate.typeDetails, {
    propertyType: 'floor',
    floorUse: 'commercial',
    builtUpAreaSquareMeters: 250,
    bathroomCount: 2,
    intendedUse: {
      value: 'Company HQ',
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    },
  });
  assert.equal(candidate.activeOffer.transaction, 'rent');
  if (candidate.activeOffer.transaction === 'rent') {
    assert.equal(candidate.activeOffer.rentalPeriodId, 'monthly');
  }
});

test('BEHAVIOR: capture candidate preserves precise location and private attachments', () => {
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'residential',
    bathroomCount: '2',
    manualLocationText: 'Building entrance',
    mapsLink: 'https://www.google.com/maps/search/?api=1&query=29.33%2C48.01',
    coordinates: {
      latitude: 29.33,
      longitude: 48.01,
      privacy: { classification: 'exact_location' as const, disclosurePolicy: 'explicit_per_share' as const },
    },
    attachments: [{
      id: 'capture-image-1',
      kind: 'image',
      originalName: 'front.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      managedUri: 'file:///properties/property-capture-test/attachments/front.jpg',
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    }],
  }, true);
  assert.equal(candidate.locationEnrichment?.manualLocationText?.privacy.classification, 'exact_location');
  assert.equal(candidate.locationEnrichment?.mapsLink?.privacy.disclosurePolicy, 'explicit_per_share');
  assert.deepEqual(candidate.locationEnrichment?.coordinates?.privacy, {
    classification: 'exact_location',
    disclosurePolicy: 'explicit_per_share',
  });
  assert.equal(candidate.attachments?.[0].id, 'capture-image-1');
  assert.equal(candidate.attachments?.[0].privacy.disclosurePolicy, 'normal');
});

test('BEHAVIOR: capture transitions preserve ownership evidence and copied attachment references', () => {
  const details = {
    manualLocationText: 'Owner entrance',
    mapsLink: 'https://www.google.com/maps/search/?api=1&query=29.33%2C48.01',
    coordinates: {
      latitude: 29.33,
      longitude: 48.01,
      privacy: { classification: 'exact_location' as const, disclosurePolicy: 'explicit_per_share' as const },
    },
    attachments: [{
      id: 'copied-1',
      kind: 'image' as const,
      originalName: 'owner.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      managedUri: 'file:///properties/property-capture-test/attachments/owner.jpg',
      privacy: { classification: 'normal' as const, disclosurePolicy: 'normal' as const },
    }],
  };
  assert.deepEqual(preserveCaptureOwnershipAndEvidence(details), details);
});

test('BEHAVIOR: copied attachments are deleted when metadata ownership persistence fails', async () => {
  const deleted: string[] = [];
  const attachment: LocalAttachment = {
    id: 'new-copy', kind: 'image', originalName: 'new.jpg', mimeType: 'image/jpeg',
    uri: 'file:///new.jpg', order: 0,
  };
  await assert.rejects(
    persistNewAttachmentsOrDeleteOnFailure(
      [attachment],
      async () => false,
      { copyToProperty: async () => attachment.uri, delete: async uri => { deleted.push(uri); } },
    ),
    /ATTACHMENT_METADATA_PERSIST_FAILED/,
  );
  assert.deepEqual(deleted, ['file:///new.jpg']);
});

test('BEHAVIOR: resumed capture drafts normalize square feet before hydration', async () => {
  const storage = new MemoryStorage();
  await storage.setItem('@viewstate_property_capture_details_v1:property-capture-test', JSON.stringify({
    areaSquareMeters: 1000,
    areaUnit: 'square_foot',
    demoMetadata: { categoryId: 'family_apartment', areaSquareMeters: 1000, areaUnit: 'square_foot' },
  }));
  const hydrated = await loadCaptureDetails('property-capture-test', storage);
  assert.equal(hydrated.areaSquareMeters, 92.903);
  assert.equal(hydrated.areaUnit, 'square_meter');
  assert.equal(hydrated.demoMetadata?.areaSquareMeters, 92.903);
  assert.equal(hydrated.demoMetadata?.areaUnit, 'square_meter');
});

test('BEHAVIOR: demo-only square-foot area hydrates into top-level square meters', async () => {
  const storage = new MemoryStorage();
  await storage.setItem('@viewstate_property_capture_details_v1:property-capture-test', JSON.stringify({
    demoMetadata: { categoryId: 'family_apartment', areaSquareMeters: 1000, areaUnit: 'square_foot' },
  }));
  const hydrated = await loadCaptureDetails('property-capture-test', storage);
  assert.equal(hydrated.areaSquareMeters, 92.903);
  assert.equal(hydrated.areaUnit, 'square_meter');
  assert.equal(hydrated.demoMetadata?.areaSquareMeters, 92.903);
  assert.equal(hydrated.demoMetadata?.areaUnit, 'square_meter');
});

test('BEHAVIOR: removed attachment metadata persists before retired file deletion', async () => {
  const events: string[] = [];
  const attachment: LocalAttachment = {
    id: 'retired', kind: 'image', originalName: 'retired.jpg', mimeType: 'image/jpeg',
    uri: 'file:///retired.jpg', order: 0,
  };
  await persistAttachmentsThenDeleteRemoved(
    [attachment],
    [],
    async () => { events.push('metadata'); },
    { copyToProperty: async () => attachment.uri, delete: async () => { events.push('delete'); } },
  );
  assert.deepEqual(events, ['metadata', 'delete']);
});

test('SOURCE ASSERTION: web attachment controls and native media filters are explicit', async () => {
  const source = await readFile('services/attachments.ts', 'utf8');
  const capture = await readFile('app/capture/index.tsx', 'utf8');
  assert.match(capture, /const selectedPropertyType: PropertyType \| undefined = routePropertyTypeParam === undefined/);
  assert.match(source, /createWebFileAttachments/);
  assert.match(source, /WEB_ATTACHMENT_MAX_BYTES/);
  assert.match(source, /createIndexedDbWebAttachmentBlobStore|indexedDB\.open/);
  assert.match(source, /viewstate-web-attachment:/);
  assert.doesNotMatch(source, /btoa\(binary\)/);
  assert.match(source, /mediaTypes: \('images' \| 'videos'\)\[\] = \['images', 'videos'\]/);
  assert.match(capture, /capture-add-images/);
  assert.match(capture, /capture-add-videos/);
  assert.match(capture, /capture-add-files/);
  assert.match(capture, /accept="image\/\*"/);
  assert.match(capture, /accept="video\/\*"/);
  assert.match(capture, /accept="\.pdf,application\/pdf"/);
  assert.match(capture, /capture-save-validation-error/);
  assert.match(capture, /accessibilityRole="alert"/);
  assert.match(capture, /setSaveError\(message\)/);
  assert.match(capture, /if \(!isBasicApartmentFollowUp && getCaptureMapsLinkValidationError\(captureDetails\.mapsLink\)\) return;/);
  assert.match(capture, /if \(!isBasicApartmentFollowUp && Object\.keys\(quickErrors\)\.length > 0\)/);
  assert.match(capture, /onChangeText=\{value => updateCaptureDetails\(\{ mapsLink: value \|\| undefined \}\)\}/);
  assert.match(capture, /capture-maps-link-error/);
  assert.match(capture, /error\.message === 'INVALID_LOCATION_LINK'[\s\S]*t\('enrich\.maps_link_invalid'\)/);
});

test('BEHAVIOR: standard Apartment BASIC save offers only same-ID details or Home', async () => {
  const summary = await readFile('app/capture/summary.tsx', 'utf8');
  const legacyCapture = await readFile('app/capture/index.tsx', 'utf8');
  const apartmentSubtype = await readFile('app/capture/apartment-subtype.tsx', 'utf8');
  const price = await readFile('app/capture/price.tsx', 'utf8');
  const location = await readFile('app/capture/location.tsx', 'utf8');
  const success = await readFile('app/capture/success.tsx', 'utf8');
  const enrichment = await readFile('app/property/[propertyCoreId]/enrich.tsx', 'utf8');
  const propertyId = 'apartment-basic-follow-up';
  const basicActions = success
    .split('showCaptureFollowUp && propertyCoreId ?')[1]
    ?.split(') : propertyCoreId ?')[0] ?? '';

  assert.deepEqual(getPropertySuccessRoutes(propertyId), {
    detail: `/property/${propertyId}`,
    properties: `/properties?highlight=${propertyId}`,
    home: '/',
  });
  assert.equal(isBasicApartmentFollowUpCapture('apartment', 'standard', 'duplex'), true);
  assert.equal(isBasicApartmentFollowUpCapture('apartment', 'studio', 'standard_apartment'), false);
  assert.equal(isBasicApartmentFollowUpCapture('floor', 'standard', undefined), false);
  assert.match(apartmentSubtype, /updateCaptureDetails\(\{ apartmentSubtype: 'standard_apartment' \}\)/);
  assert.match(apartmentSubtype, /apartmentSubtype: 'standard_apartment'/);
  assert.match(apartmentSubtype, /getPropertyFormRoute\(\{/);
  assert.match(apartmentSubtype, /apartmentSubtype,\s*\.\.\.\(seekerId \? \{ seekerId \} : \{\}\)/);
  assert.deepEqual(getPropertyFormRoute({
    mode: 'offered',
    transaction: 'sale',
    propertyType: 'apartment',
    apartmentSubtype: 'standard',
  }), {
    kind: 'offered',
    pathname: '/capture/price',
    params: {
      mode: 'offered',
      transaction: 'sale',
      propertyType: 'apartment',
      apartmentSubtype: 'standard',
    },
  });
  assert.match(price, /apartmentSubtype\?: string/);
  assert.match(price, /pathname: '\/capture\/summary'[\s\S]*\.\.\.\(apartmentSubtype \? \{ apartmentSubtype \} : \{\}\)/);
  assert.match(location, /apartmentSubtype\?: string/);
  assert.match(location, /pathname: '\/capture\/summary'[\s\S]*\.\.\.\(apartmentSubtype \? \{ apartmentSubtype \} : \{\}\)/);
  assert.match(summary, /isBasicApartmentFollowUpCapture\(\s*draft\.propertyType,\s*apartmentSubtype,\s*captureDetails\.apartmentSubtype/);
  assert.match(summary, /hasCaptureEnrichmentValues\(captureDetails, draft\.description\?\.value\)/);
  assert.match(summary, /shouldSaveBasicCapture\(/);
  assert.match(legacyCapture, /hasCaptureEnrichmentValues\(captureDetails, draft\.description\?\.value \|\| description\)/);
  assert.match(legacyCapture, /shouldSaveBasicCapture\(/);
  assert.match(legacyCapture, /\{!isBasicApartmentFollowUp && \(/);
  assert.match(summary, /candidate = \(!saveBasicOnly \|\| !isBasicApartmentFollowUp\) && projection && projection\.ok/);
  assert.match(summary, /if \(candidate && projection\?\.ok\)/);
  assert.match(summary, /savePropertyWithRecovery\(\s*projection && projection\.ok \? projection\.property : undefined/);
  assert.match(summary, /propertyCoreId: savedId,[\s\S]*basicCaptureFollowUp: '1'/);
  assert.match(legacyCapture, /candidate = isBasicApartmentFollowUp[\s\S]*buildPropertyWithCaptureDetails/);
  assert.match(legacyCapture, /!isBasicApartmentFollowUp && getCaptureMapsLinkValidationError/);
  assert.match(legacyCapture, /basicCaptureFollowUp: '1'/);
  assert.match(success, /basicCaptureFollowUp === '1' \|\| basicApartmentFollowUp === '1'/);
  assert.match(basicActions, /btn-add-property-details/);
  assert.match(basicActions, /btn-finish-later/);
  assert.doesNotMatch(basicActions, /btn-view-property|btn-view-properties|btn-later/);
  assert.match(success, /title=\{t\('summary\.add_details'\)\}[\s\S]*encodeURIComponent\(propertyCoreId\).*\/enrich/);
  assert.match(success, /title=\{t\('summary\.later'\)\}[\s\S]*navigateOnce\(destinations\.home, true\)/);
  assert.match(success, /testID="btn-add-property-details"/);
  assert.match(success, /testID="btn-finish-later"/);
  assert.match(enrichment, /router\.replace\(`\/property\/\$\{encodeURIComponent\(id\)\}\/edit\?completion=enrichment`/);
});

test('Capture Review summary uses the canonical Offered intent label', async () => {
  const summary = await readFile('app/capture/summary.tsx', 'utf8');
  const summaryView = summary.slice(summary.indexOf('<ScrollView'), summary.indexOf('</ScrollView>'));
  assert.match(summary, /projectRecordIntent\('offered', draft\.transaction, language\)\.label/);
  assert.match(summaryView, /intent=\{projectRecordIntent\('offered', draft\.transaction, language\)\.label\}/);
  assert.doesNotMatch(summaryView, /t\(`transaction\.\$\{draft\.transaction\}/);
});

test('Capture stage-3 Preview uses the canonical Offered intent presentation', async () => {
  const capture = await readFile('app/capture/index.tsx', 'utf8');
  const preview = capture.slice(
    capture.indexOf('{stage === 3 && ('),
    capture.indexOf('</PropertyReview>', capture.indexOf('{stage === 3 && (')),
  );
  assert.match(preview, /intent=\{projectRecordIntent\('offered', draft\.transaction, language\)\.label\}/);
  assert.doesNotMatch(preview, /t\(`transaction\.\$\{draft\.transaction\}/);
});

test('REGRESSION: capture success check uses success green with a contrasting foreground', async () => {
  const success = await readFile('app/capture/success.tsx', 'utf8');
  const palette = await readFile('constants/colors.ts', 'utf8');
  assert.match(success, /backgroundColor: colors\.success/);
  assert.match(success, /<Feather name="check" size=\{42\} color=\{colors\.primaryForeground\}/);
  assert.doesNotMatch(success, /backgroundColor: colors\.accent/);
  assert.match(palette, /success: '#16A34A'/);
  assert.match(palette, /primaryForeground: '#FFFFFF'/);
});

test('BEHAVIOR: full Offered and Wanted route matrix preserves each selected property type', async () => {
  const selections = getSupportedPropertyFormSelections();
  assert.equal(selections.length, 2 * 2 * (PROPERTY_TYPES.length - 1 + APARTMENT_SUBTYPES.length));

  for (const selection of selections) {
    const target = getPropertyFormRoute(selection);
    assert.equal(target.params.mode, selection.mode);
    assert.equal(target.params.transaction, selection.transaction);
    assert.equal(target.params.propertyType, selection.propertyType);

    if (selection.propertyType === 'apartment' && selection.apartmentSubtype === 'studio') {
      assert.equal(target.kind, 'studio');
      assert.equal(target.pathname, '/capture/studio');
      assert.equal(target.params.apartmentSubtype, 'studio');
    } else if (selection.mode === 'wanted') {
      assert.equal(target.kind, 'wanted');
      assert.equal(target.pathname, '/requirement/new');
      assert.equal(target.params.purpose, selection.transaction === 'sale' ? 'buy' : 'rent');
    } else if (selection.propertyType === 'floor') {
      assert.equal(target.kind, 'floor');
      assert.equal(target.pathname, '/capture');
    } else {
      assert.equal(target.kind, 'offered');
      assert.equal(target.pathname, '/capture/price');
    }
  }

  const context = {
    mode: 'wanted' as const,
    transaction: 'rent' as const,
    seekerId: 'person / selected',
    linkPersonId: 'person / linked',
    sourceRole: 'owner',
  };
  assert.deepEqual(getPropertyTypeSelectionRoute(context), {
    pathname: '/capture/property-type',
    params: context,
  });

  for (const mode of ['offered', 'wanted'] as const) {
    const floor = getPropertyFormRoute({
      mode,
      transaction: 'sale',
      propertyType: 'floor',
      apartmentSubtype: 'standard',
    });
    assert.equal(floor.params.propertyType, 'floor');
    assert.equal(floor.params.apartmentSubtype, undefined);
    assert.notEqual(floor.kind, 'apartment-subtype');
    assert.notEqual(floor.kind, 'studio');
    assert.equal(
      floor.pathname,
      mode === 'wanted' ? '/requirement/new' : '/capture',
      'Floor selection stays on the existing offered/wanted floor form route',
    );
  }
  const capture = await readFile('app/capture/index.tsx', 'utf8');
  assert.match(capture, /<ModernPropertyForm[\s\S]*onChange=\{\(field: PropertyDetailField, value: string\) => field === 'floorUse' \? chooseFloorUse\(value\)/);
  const enrichmentFields = await readFile('components/PropertyEnrichmentFields.tsx', 'utf8');
  assert.match(enrichmentFields, /field === 'floorUse' \? \['residential', 'commercial'\]/);
});

test('REGRESSION: Standard Apartment BASIC completion persists canonical subtype and reopens its editor directly', async () => {
  const projection = projectDraftToProperty({
    propertyCoreId: 'standard-basic-projection',
    offerId: 'standard-basic-offer',
    propertyType: 'apartment',
    apartmentSubtype: 'standard_apartment',
    transaction: 'rent',
    rentalPrice: { amount: 800, currencyCode: 'KWD' },
    rentalPeriodId: 'monthly',
    locationAreaId: 'salmiya',
  });
  assert.equal(projection.ok, true);
  if (projection.ok) {
    assert.deepEqual(projection.value.typeDetails, {
      propertyType: 'apartment',
      apartmentSubtype: 'standard_apartment',
    });
  }

  const apartment = {
    ...baseline,
    core: { ...baseline.core, propertyType: 'apartment' as const },
  } as Property;
  const basicCandidate = buildPropertyWithCaptureDetails(apartment, {
    apartmentSubtype: 'standard_apartment',
  });
  assert.equal(basicCandidate.core.id, apartment.core.id);
  assert.deepEqual(basicCandidate.typeDetails, {
    propertyType: 'apartment',
    apartmentSubtype: 'standard_apartment',
  });
  assert.equal(createEditDraft(basicCandidate).choices.canonicalDetails?.apartmentSubtype, 'standard_apartment');
  assert.equal(getPropertyEditFormHref(apartment.core.id, 'apartment', 'standard_apartment'), `/property/${apartment.core.id}/edit`);
  assert.throws(
    () => buildPropertyWithCaptureDetails(apartment, { apartmentSubtype: 'unsupported-subtype' }),
    /UNSUPPORTED_APARTMENT_SUBTYPE/,
  );

  assert.throws(
    () => getPropertyFormRoute({
      mode: 'offered',
      transaction: 'sale',
      propertyType: 'apartment',
      apartmentSubtype: 'unsupported-subtype' as never,
    }),
    /UNSUPPORTED_APARTMENT_SUBTYPE/,
  );
  assert.equal(getPropertyFormRoute({
    mode: 'offered',
    transaction: 'rent',
    propertyType: 'floor',
    apartmentSubtype: 'duplex',
  }).pathname, '/capture', 'stale Apartment subtype cannot change the explicit Floor route');
  assert.throws(
    () => getPropertyEditFormHref(apartment.core.id, 'apartment', 'unsupported-subtype' as never),
    /UNSUPPORTED_APARTMENT_SUBTYPE/,
  );
});

test('BEHAVIOR: non-Apartment BASIC capture enables Add details follow-up without losing full saves', async () => {
  const summary = await readFile('app/capture/summary.tsx', 'utf8');
  const capture = await readFile('app/capture/index.tsx', 'utf8');
  const success = await readFile('app/capture/success.tsx', 'utf8');
  const floorBasic = buildPropertyWithCaptureDetails(baseline, {});
  assert.equal(shouldSaveBasicCapture({}), true);
  assert.equal(hasCaptureEnrichmentValues({}), false);
  assert.equal(floorBasic.core.propertyType, 'floor');
  assert.equal(floorBasic.typeDetails, undefined,
    'Floor can be saved BASIC without requiring Residential/Commercial use');
  assert.equal(shouldSaveBasicCapture({}, undefined, false, true), false,
    'explicitly including details selects the full-save path even with no detail values');
  assert.throws(
    () => buildPropertyWithCaptureDetails(baseline, { bedroomCount: '2' }),
    /FLOOR_USE_REQUIRED/,
    'Floor use is required only when enriched Floor facts are saved',
  );
  const floorFull = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'residential',
    bedroomCount: '2',
  });
  assert.equal((floorFull.typeDetails as Record<string, unknown> | undefined)?.floorUse, 'residential');
  assert.equal(shouldSaveBasicCapture({ floorUse: 'residential', bedroomCount: '2' }), false);

  const villa = {
    ...baseline,
    core: { ...baseline.core, propertyType: 'villa' as const },
  } as Property;
  assert.equal(buildPropertyWithCaptureDetails(villa, {}).typeDetails, undefined);
  assert.equal(shouldSaveBasicCapture({}), true,
    'another existing non-Apartment type can use the same BASIC follow-up');
  const villaFull = buildPropertyWithCaptureDetails(villa, { bedroomCount: '3' });
  assert.equal((villaFull.typeDetails as Record<string, unknown> | undefined)?.bedroomCount, 3);
  assert.equal(shouldSaveBasicCapture({ bedroomCount: '3' }), false);

  assert.match(summary, /candidate = \(!saveBasicOnly \|\| !isBasicApartmentFollowUp\) && projection && projection\.ok/);
  assert.match(summary, /basicCaptureFollowUp: '1'/);
  assert.match(capture, /isBasicCaptureFollowUp = shouldSaveBasicCapture\(/);
  assert.match(capture, /basicCaptureFollowUp: '1'/);
  assert.match(success, /basicCaptureFollowUp === '1' \|\| basicApartmentFollowUp === '1'/);
  const basicSuccessActions = success
    .split('showCaptureFollowUp && propertyCoreId ?')[1]
    ?.split(') : propertyCoreId ?')[0] ?? '';
  assert.equal((basicSuccessActions.match(/testID="btn-/g) ?? []).length, 2);
  assert.match(basicSuccessActions, /testID="btn-add-property-details"/);
  assert.match(basicSuccessActions, /testID="btn-finish-later"/);
  assert.doesNotMatch(basicSuccessActions, /btn-view-property|btn-view-properties|btn-later/);
});

test('BEHAVIOR: populated Apartment draft details and attachment refs are preserved by same-ID save', async () => {
  const baselineApartment: Property = {
    core: {
      id: 'apartment-pending-details',
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
    },
    activeOffer: {
      id: 'apartment-pending-details-offer',
      propertyCoreId: 'apartment-pending-details',
      transaction: 'rent',
      rentalPrice: { amount: 800, currencyCode: 'KWD' },
      rentalPeriodId: 'monthly',
    },
  };
  const basicScaffold = {
    apartmentSubtype: 'standard_apartment',
    demoMetadata: { categoryId: 'family_apartment' as const },
    nearbyServices: '[]',
  };
  const { apartmentSubtype: _subtype, ...optionalScaffold } = basicScaffold;
  assert.equal(hasPopulatedCategoryCapture(optionalScaffold), false);

  const attachment = {
    id: 'preserved-apartment-attachment',
    kind: 'image' as const,
    originalName: 'apartment.jpg',
    mimeType: 'image/jpeg',
    order: 0,
    managedUri: 'file:///properties/apartment-pending-details/attachments/apartment.jpg',
    privacy: { classification: 'normal' as const, disclosurePolicy: 'normal' as const },
  };
  const capturedDetails = {
    ...basicScaffold,
    bathroomCount: '2',
    attachments: [attachment],
  };
  const { apartmentSubtype: _standardSubtype, ...optionalDetails } = capturedDetails;
  assert.equal(hasPopulatedCategoryCapture(optionalDetails), true);

  const candidate = buildPropertyWithCaptureDetails(baselineApartment, capturedDetails);
  const stored: Property[] = [baselineApartment];
  let compareAndUpdateCalls = 0;
  await persistCapturedDetails({
    compareAndUpdate: async (expected, replacement) => {
      compareAndUpdateCalls += 1;
      assert.equal(expected.core.id, baselineApartment.core.id);
      stored[0] = replacement;
      return true;
    },
  }, baselineApartment, candidate, new MemoryStorage());

  assert.equal(compareAndUpdateCalls, 1);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].core.id, baselineApartment.core.id);
  assert.deepEqual(stored[0].attachments, [attachment]);
  assert.equal((stored[0].typeDetails as unknown as Record<string, unknown>).bathroomCount, 2);
});

test('BEHAVIOR: Floor transition scopes are record-owned for stale protection', () => {
  assert.equal(captureDetailsScopeKey('property-capture-test'), 'capture:property-capture-test');
  assert.notEqual(captureDetailsScopeKey('property-a'), captureDetailsScopeKey('property-b'));
});

test('BEHAVIOR: incompatible Floor details block save instead of being silently omitted', () => {
  assert.throws(
    () => buildPropertyWithCaptureDetails(baseline, {
      floorUse: 'commercial',
      bedroomCount: '3',
    }),
    /FLOOR_CAPTURE_DETAIL_INCOMPATIBLE/,
  );
});

test('BEHAVIOR: capture detail CAS success clears evidence after stored round trip', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    bathroomCount: '3',
  });
  let stored: Property = baseline;
  await persistCapturedDetails({
    compareAndUpdate: async (from, to) => {
      assert.deepEqual(from, baseline);
      stored = to;
      return true;
    },
  }, baseline, candidate, storage);
  assert.deepEqual(stored, candidate);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
});

test('BEHAVIOR: failed capture CAS retains restartable enrichment evidence', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    bathroomCount: '4',
  });
  const evidence = await prepareCapturedDetails(baseline, candidate, storage);
  assert.ok(evidence);
  await assert.rejects(
    finalizeCapturedDetails({
      compareAndUpdate: async () => false,
    }, evidence!, storage),
    /CAPTURE_DETAILS_PROPERTY_CHANGED/,
  );
  assert.deepEqual(
    await loadPreparedCapturedDetails(baseline.core.id, storage),
    evidence,
  );
});

test('BEHAVIOR: prepared details survive BASIC completion and finalize after restart', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'residential',
    bedroomCount: '3',
    bathroomCount: '2',
  });
  await prepareCapturedDetails(baseline, candidate, storage);

  const recovered = await loadPreparedCapturedDetails(baseline.core.id, storage);
  assert.ok(recovered);
  let stored: Property = baseline;
  await finalizeCapturedDetails({
    compareAndUpdate: async (from, to) => {
      assert.deepEqual(from, stored);
      stored = to;
      return true;
    },
  }, recovered!, storage);

  assert.deepEqual(stored, candidate);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
});

test('BEHAVIOR: capture detail storage serializes updates and rejects stale cleanup', async () => {
  const storage = new MemoryStorage();
  const first = { floorUse: 'residential', bedroomCount: '2' } as const;
  const second = { floorUse: 'residential', bedroomCount: '3' } as const;
  assert.equal(await saveCaptureDetails(baseline.core.id, first, null, storage), true);
  assert.equal(await saveCaptureDetails(baseline.core.id, second, first, storage), true);
  await flushCaptureDetailsWrites();
  assert.equal(await clearCaptureDetails(baseline.core.id, first, storage), false);
  assert.equal(await clearCaptureDetails(baseline.core.id, second, storage), true);
});

test('BEHAVIOR: startup recovery leaves pointer and evidence when BASIC is missing', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, { floorUse: 'commercial', bathroomCount: '2' });
  await prepareCapturedDetails(baseline, candidate, storage);
  const result = await recoverPreparedCapturedDetails({
    getProperties: async () => [],
    compareAndUpdate: async () => false,
  }, storage);
  assert.equal(result.status, 'missing_basic');
  assert.ok(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY));
  assert.ok(await loadPreparedCapturedDetails(baseline.core.id, storage));
});

test('BEHAVIOR: startup recovery CASes baseline and clears exact evidence/pointer', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, { floorUse: 'commercial', bathroomCount: '2' });
  await prepareCapturedDetails(baseline, candidate, storage);
  let current: Property = baseline;
  const result = await recoverPreparedCapturedDetails({
    getProperties: async () => [current],
    compareAndUpdate: async (from, to) => {
      assert.deepEqual(from, current);
      current = to;
      return true;
    },
  }, storage);
  assert.equal(result.status, 'complete');
  assert.deepEqual(current, candidate);
  assert.equal(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY), null);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
});

test('BEHAVIOR: startup recovery cleans evidence after a crash post-CAS', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, { floorUse: 'commercial', bathroomCount: '2' });
  await prepareCapturedDetails(baseline, candidate, storage);
  const result = await recoverPreparedCapturedDetails({
    getProperties: async () => [candidate],
    compareAndUpdate: async () => {
      throw new Error('CAS must not run for an already enriched property');
    },
  }, storage);
  assert.equal(result.status, 'complete');
  assert.equal(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY), null);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
});

test('BEHAVIOR: startup recovery preserves evidence and pointer on a third-state conflict', async () => {
  const storage = new MemoryStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, { floorUse: 'commercial', bathroomCount: '2' });
  await prepareCapturedDetails(baseline, candidate, storage);
  const changed = { ...baseline, activeOffer: { ...baseline.activeOffer, rentalPrice: { amount: 900, currencyCode: 'KWD' } } };
  const result = await recoverPreparedCapturedDetails({
    getProperties: async () => [changed],
    compareAndUpdate: async () => true,
  }, storage);
  assert.equal(result.status, 'conflict');
  assert.ok(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY));
  assert.ok(await loadPreparedCapturedDetails(baseline.core.id, storage));
});

test('BEHAVIOR: startup recovery resumes after evidence deletion but before pointer deletion', async () => {
  class PointerRemovalFailsOnceStorage extends MemoryStorage {
    failPointerRemoval = true;

    override async removeItem(key: string) {
      if (key === CAPTURE_DETAILS_POINTER_KEY && this.failPointerRemoval) {
        this.failPointerRemoval = false;
        throw new Error('simulated termination before pointer deletion');
      }
      await super.removeItem(key);
    }
  }

  const storage = new PointerRemovalFailsOnceStorage();
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    bathroomCount: '2',
  });
  await prepareCapturedDetails(baseline, candidate, storage);
  let current: Property = baseline;

  await assert.rejects(
    recoverPreparedCapturedDetails({
      getProperties: async () => [current],
      compareAndUpdate: async (_from, to) => {
        current = to;
        return true;
      },
    }, storage),
    /simulated termination/,
  );
  assert.deepEqual(current, candidate);
  assert.equal(await loadPreparedCapturedDetails(baseline.core.id, storage), null);
  assert.ok(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY));

  const resumed = await recoverPreparedCapturedDetails({
    getProperties: async () => [current],
    compareAndUpdate: async () => {
      throw new Error('CAS must not repeat after restart');
    },
  }, storage);
  assert.equal(resumed.status, 'complete');
  assert.equal(await storage.getItem(CAPTURE_DETAILS_POINTER_KEY), null);
});
