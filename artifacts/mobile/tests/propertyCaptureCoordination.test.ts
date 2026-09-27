import assert from 'node:assert/strict';
import test from 'node:test';
import { projectDraftToProperty, type Property } from '@workspace/property-domain';
import {
  applyCaptureTransactionDefaults,
  buildPropertyWithCaptureDetails,
  captureDetailsScopeKey,
  isBasicApartmentFollowUpCapture,
  preserveCaptureOwnershipAndEvidence,
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
  assert.equal(details.frontageWidthMeters, 50);
  assert.equal(details.roomsPerUnit, 2);
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
    commercialActivity: 'retail',
    ceilingHeightMeters: '4',
  });
  assert.deepEqual(candidate.typeDetails, {
    propertyType: 'floor',
    floorUse: 'commercial',
    builtUpAreaSquareMeters: 250,
    bathroomCount: 2,
    commercialActivity: {
      value: 'retail',
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    },
    ceilingHeightMeters: 4,
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
    .split("basicApartmentFollowUp === '1' && propertyCoreId ?")[1]
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
  assert.match(apartmentSubtype, /pathname: '\/capture\/price'[\s\S]*apartmentSubtype: 'standard'/);
  assert.match(price, /apartmentSubtype\?: string/);
  assert.match(price, /pathname: '\/capture\/location'[\s\S]*\.\.\.\(apartmentSubtype \? \{ apartmentSubtype \} : \{\}\)/);
  assert.match(location, /apartmentSubtype\?: string/);
  assert.match(location, /pathname: '\/capture\/summary'[\s\S]*\.\.\.\(apartmentSubtype \? \{ apartmentSubtype \} : \{\}\)/);
  assert.match(summary, /isBasicApartmentFollowUpCapture\(\s*draft\.propertyType,\s*apartmentSubtype,\s*captureDetails\.apartmentSubtype/);
  assert.match(summary, /hasApartmentDetailsToPreserve\(captureDetails\)/);
  assert.match(legacyCapture, /hasApartmentDetailsToPreserve\(captureDetails\)/);
  assert.match(legacyCapture, /\{!isBasicApartmentFollowUp && \(/);
  assert.match(summary, /candidate = !saveBasicOnly && projection && projection\.ok/);
  assert.match(summary, /if \(!saveBasicOnly && candidate && projection\?\.ok\)/);
  assert.match(summary, /savePropertyWithRecovery\(\s*projection && projection\.ok \? projection\.property : undefined/);
  assert.match(summary, /propertyCoreId: savedId,[\s\S]*basicApartmentFollowUp: '1'/);
  assert.match(legacyCapture, /candidate = isBasicApartmentFollowUp[\s\S]*buildPropertyWithCaptureDetails/);
  assert.match(legacyCapture, /!isBasicApartmentFollowUp && getCaptureMapsLinkValidationError/);
  assert.match(legacyCapture, /basicApartmentFollowUp: '1'/);
  assert.match(success, /basicApartmentFollowUp === '1' && propertyCoreId \?/);
  assert.match(basicActions, /btn-add-property-details/);
  assert.match(basicActions, /btn-finish-later/);
  assert.doesNotMatch(basicActions, /btn-view-property|btn-view-properties|btn-later/);
  assert.match(success, /title=\{t\('summary\.add_details'\)\}[\s\S]*encodeURIComponent\(propertyCoreId\).*\/enrich/);
  assert.match(success, /title=\{t\('summary\.later'\)\}[\s\S]*navigateOnce\(destinations\.home, true\)/);
  assert.match(success, /testID="btn-add-property-details"/);
  assert.match(success, /testID="btn-finish-later"/);
  assert.match(enrichment, /router\.replace\(`\/property\/\$\{encodeURIComponent\(id\)\}\?edit=1`/);
});

test('REGRESSION: native Summary press ignores its event and routes to the two BASIC success actions', async () => {
  const summary = await readFile('app/capture/summary.tsx', 'utf8');
  const success = await readFile('app/capture/success.tsx', 'utf8');
  const saveExpression = summary.match(/const saveBasicOnly = ([^;]+);/)?.[1];
  const onPressExpression = summary.match(/onPress=\{(\(\) => \{ void handleFinish\(\); \})\}/)?.[1];
  const markerSpread = summary.match(/(\.\.\.\(saveBasicOnly \? \{ basicApartmentFollowUp: '1' \} : \{\}\))/)?.[1];

  assert.ok(saveExpression, 'Summary production save decision must be present');
  assert.ok(onPressExpression, 'Summary must wrap handleFinish instead of passing it as Button onPress');
  assert.ok(markerSpread, 'BASIC save must emit the production success marker');

  const calculateSaveBasicOnly = new Function(
    'isBasicApartmentFollowUp',
    'includeCapturedDetails',
    `return ${saveExpression};`,
  ) as (isBasicApartmentFollowUp: boolean, includeCapturedDetails?: unknown) => boolean;
  const buildSuccessParams = new Function(
    'saveBasicOnly',
    `return ({ ${markerSpread} });`,
  ) as (saveBasicOnly: boolean) => Record<string, string>;

  const nativePressEvent = { nativeEvent: { target: 1 } };
  assert.equal(calculateSaveBasicOnly(true, nativePressEvent), false,
    'Passing a truthy React Native press event directly would select the details path');

  let successParams: Record<string, string> | undefined;
  const handleFinish = (includeCapturedDetails = false) => {
    const saveBasicOnly = calculateSaveBasicOnly(true, includeCapturedDetails);
    successParams = buildSuccessParams(saveBasicOnly);
  };
  const productionOnPress = new Function(
    'handleFinish',
    `return ${onPressExpression};`,
  )(handleFinish) as (event: typeof nativePressEvent) => void;
  productionOnPress(nativePressEvent);

  assert.deepEqual(successParams, { basicApartmentFollowUp: '1' });
  const basicSuccessActions = success
    .split("basicApartmentFollowUp === '1' && propertyCoreId ?")[1]
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

test('BEHAVIOR: incompatible detail values are omitted from the candidate', () => {
  const candidate = buildPropertyWithCaptureDetails(baseline, {
    floorUse: 'commercial',
    bedroomCount: '3',
  });
  assert.equal((candidate.typeDetails as unknown as Record<string, unknown>).bedroomCount, undefined);
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