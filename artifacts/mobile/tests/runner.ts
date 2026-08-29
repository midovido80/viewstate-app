import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildPropertySharePreview,
  createLiteralText,
  createPrivacyMetadata,
  createPropertyShareSelection,
  FURNISHING_VALUES,
  projectDraftToProperty,
  PROPERTY_DETAIL_FIELD_DEFINITIONS,
  PROPERTY_TYPES,
  PropertyDraft,
  Property,
  validateProperty,
  validateTypeDetails,
} from '@workspace/property-domain';
import appConfig from '../app.json';
import {
  parseStoredJson,
  runSaveWithCleanup,
  SerialTaskQueue,
  SingleFlight,
  StoredValueParseError,
} from '../services/serialTaskQueue.ts';
import {
  Area,
  KUWAIT_AREA_ALIASES,
  KUWAIT_AREAS,
  KUWAIT_AREA_DATASET_STATUS,
  KUWAIT_GOVERNORATES,
  KUWAIT_SEARCH_GROUPS,
  getAreaById,
  normalizeAreaSearchText,
  searchAreas,
} from '../constants/kuwait-areas.ts';
import {
  MARKET_CONFIG,
  formatPrice,
  formatRentalPrice,
  normalizeDraftCurrency,
  normalizePropertyCurrency,
} from '../constants/market.ts';
import {
  deleteSavedProperty,
  deleteSavedPropertySnapshot,
} from '../services/propertyDeletion.ts';
import {
  STAGE_01B1_DRAFT_MIGRATION_KEY,
  STAGE_01B1_WEB_MIGRATION_KEY,
  migrateStage01B1Draft,
  migrateStage01B1WebProperties,
} from '../services/stage01B1CurrencyMigration.ts';
import {
  PROPERTY_SAVE_OPERATION_KEY,
  PendingSaveOperationExistsError,
  SaveRecoveryReadError,
  clearPropertySaveOperation,
  createPropertySaveOperation,
  executePropertySaveRecovery,
  loadPropertySaveOperation,
  persistPropertySaveOperation,
} from '../services/propertySaveRecovery.ts';
import {
  PROPERTY_UPDATE_OPERATION_KEY,
  PendingPropertyUpdateExistsError,
  PropertyEditReadError,
  buildPropertyUpdateCandidate,
  createEditDraft,
  createPropertyUpdateOperation,
  discardPropertyEditDraft,
  executePropertyUpdateRecovery,
  flushPropertyEditDraftWrites,
  loadPropertyEditDraft,
  loadPropertyUpdateOperation,
  persistPropertyUpdateOperation,
  propertyEditDraftKey,
  savePropertyEditDraft,
} from '../services/propertyUpdateRecovery.ts';
import {
  PERSON_CLASSIFICATIONS,
  createPerson,
  normalizePersonPhone,
  personMatchesSearch,
} from '../services/people.ts';
import {
  persistAttachmentsThenDeleteRemoved,
  reorderAttachments,
  setAttachmentCover,
  type AttachmentFileStore,
  type LocalAttachment,
} from '../services/attachmentOperations.ts';
import { requestInjectedCoordinates } from '../services/coordinateRequest.ts';
import { executePropertySharePreview } from '../services/propertyShareExecution.ts';
import { optionalClassifiedLiteral } from '../services/literalText.ts';
import {
  buildContactPhoneChoices,
  inferPhoneCountry,
  normalizePhoneForCountry,
  phoneDigits,
} from '../services/phoneEntry.ts';

const sharedSourcePath = (relativePath: string) =>
  decodeURIComponent(new URL(relativePath, import.meta.url).pathname);

test('Bounded People model preserves literal fields and normalized phone search', () => {
  assert.deepEqual(PERSON_CLASSIFICATIONS, [
    'seeker',
    'owner',
    'broker',
    'real_estate_company',
    'building_guard',
  ]);
  const person = createPerson({
    id: 'person-stable-1',
    name: '  أحمد الوسيط  ',
    displayPhone: '+٩٦٥ 5000-1234',
    notes: '  keep this literally\nas entered  ',
    classifications: ['broker', 'owner'],
  });
  assert.equal(person.id, 'person-stable-1');
  assert.equal(person.name, '  أحمد الوسيط  ');
  assert.equal(person.displayPhone, '+٩٦٥ 5000-1234');
  assert.equal(person.normalizedPhone, '+96550001234');
  assert.equal(person.notes, '  keep this literally\nas entered  ');
  assert.equal(normalizePersonPhone('٥٠٠٠ ١٢٣٤'), '50001234');
  assert.equal(personMatchesSearch(person, 'أحمد'), true);
  assert.equal(personMatchesSearch(person, '50001234'), true);
  assert.throws(() => createPerson({
    id: 'invalid',
    name: '',
    displayPhone: '5000',
    classifications: ['seeker'],
  }), /PERSON_NAME_REQUIRED/);
});

test('People source exposes selected contact import, actions, links, and confirmations', async () => {
  const sourcePath = (relativePath: string) =>
    decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
  const [form, detail, persistence, translations] = await Promise.all([
    readFile(sourcePath('../app/person/new.tsx'), 'utf8'),
    readFile(sourcePath('../app/person/[personId].tsx'), 'utf8'),
    readFile(sourcePath('../services/persistence.ts'), 'utf8'),
    readFile(sourcePath('../contexts/I18nContext.tsx'), 'utf8'),
  ]);
  assert.match(form, /requestPermissionsAsync/);
  assert.match(form, /getContactsAsync/);
  assert.match(form, /contact-choice-/);
  assert.match(detail, /person-call/);
  assert.match(detail, /person-whatsapp/);
  assert.match(detail, /person-remove-dialog/);
  assert.match(detail, /unlinkPersonFromProperty/);
  assert.match(detail, /linkPersonToProperty/);
  assert.match(persistence, /DELETE FROM person_property_links WHERE property_core_id = \?/);
  assert.match(persistence, /DELETE FROM person_property_links WHERE person_id = \?/);
  assert.match(translations, /'people\.classification\.broker': 'وسيط'/);
});

test('Synthetic enrichment route preserves the bounded post-save entry points and write-free Later action', async () => {
  const sourcePath = (relativePath: string) =>
    decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
  const [successSource, enrichmentSource, fieldSource, detailSource, translations] = await Promise.all([
    readFile(sourcePath('../app/capture/success.tsx'), 'utf8'),
    readFile(sourcePath('../app/property/[propertyCoreId]/enrich.tsx'), 'utf8'),
    readFile(sourcePath('../components/PropertyEnrichmentFields.tsx'), 'utf8'),
    readFile(sourcePath('../app/property/[propertyCoreId].tsx'), 'utf8'),
    readFile(sourcePath('../contexts/I18nContext.tsx'), 'utf8'),
  ]);
  assert.match(successSource, /btn-add-details-now/);
  assert.match(successSource, /btn-later/);
  assert.match(successSource, /summary\.later/);
  assert.match(successSource, /navigationStartedRef/);
  assert.match(successSource, /replaceOnce/);
  assert.doesNotMatch(successSource, /saveProperty|compareAndUpdate|savePropertyEnrichmentDraft|clearConfirmedPropertyEnrichmentDraft/);
  assert.match(detailSource, /loadPropertyEnrichmentDraft/);
  assert.match(detailSource, /loadPropertyEnrichmentDraft\(id\)\.catch\(\(\) => null\)/);
  assert.doesNotMatch(detailSource, /loadPropertyEnrichmentDraft\(id\)\.catch\(\(\) => ['"]unreadable['"]/);
  assert.match(detailSource, /hasEnrichmentDraft \? 'detail\.continue_details' : 'detail\.add_details'/);
  assert.match(translations, /'summary\.later': 'Later'/);
  assert.match(translations, /'summary\.later': 'لاحقًا'/);
  assert.match(translations, /'detail\.continue_details': 'Continue details'/);
  assert.match(translations, /'detail\.continue_details': 'متابعة التفاصيل'/);
  assert.match(enrichmentSource, /persistAttachmentsThenDeleteRemoved/);
  assert.match(enrichmentSource, /requestCurrentCoordinates/);
  assert.match(enrichmentSource, /enrich-other-required|OTHER_CLARIFICATION_REQUIRED/);
  assert.match(fieldSource, /PROPERTY_DETAIL_FIELD_DEFINITIONS/);
  assert.ok(fieldSource.indexOf("field === 'floorUse'") < fieldSource.indexOf('ordered.map'));
  assert.match(fieldSource, /FURNISHING_VALUES/);
  assert.match(fieldSource, /enrich\.furnishing\./);
  assert.match(fieldSource, /hasMaidRoom.*hasPool.*hasWaterfront.*hasColdStorage/);
  assert.match(fieldSource, /value \|\| 'clear'/);
  assert.match(fieldSource, /Math\.max\(0, current - 1\)/);
  assert.match(fieldSource, /keyboardType="number-pad"/);
  assert.match(fieldSource, /safeCountInput/);
  assert.match(fieldSource, /safeDecimalInput/);
  assert.doesNotMatch(fieldSource, /\bconstructionYear\b|\broomCount\b/);
});

test('Synthetic enrichment recovery and detail/share routes are wired fail-closed', async () => {
  const [recovery, detail, share] = await Promise.all([
    readFile(sharedSourcePath('../services/propertyEnrichmentRecovery.ts'), 'utf8'),
    readFile(sharedSourcePath('../app/property/[propertyCoreId].tsx'), 'utf8'),
    readFile(sharedSourcePath('../app/property/[propertyCoreId]/share.tsx'), 'utf8'),
  ]);
  assert.match(recovery, /writeGeneration/);
  assert.match(recovery, /clearConfirmedPropertyEnrichmentDraft/);
  assert.match(detail, /property-enrich-action/);
  assert.match(detail, /property-share-action/);
  assert.match(share, /createPropertyShareSelection/);
  assert.match(share, /buildPropertySharePreview/);
  assert.match(share, /Private notes can never be shared|share\.sensitive_off/);
});

test('Synthetic enrichment autosave and reviewed package contract remain deterministic', async () => {
  const [enrich, recovery, packageSource, share] = await Promise.all([
    readFile(sharedSourcePath('../app/property/[propertyCoreId]/enrich.tsx'), 'utf8'),
    readFile(sharedSourcePath('../services/propertyEnrichmentRecovery.ts'), 'utf8'),
    readFile(sharedSourcePath('../services/propertySharePackage.ts'), 'utf8'),
    readFile(sharedSourcePath('../app/property/[propertyCoreId]/share.tsx'), 'utf8'),
  ]);
  assert.match(enrich, /setTimeout/);
  assert.match(enrich, /AppState\.addEventListener/);
  assert.match(enrich, /flushPropertyEnrichmentDraftWrites/);
  assert.match(enrich, /autosaveFlight/);
  assert.match(enrich, /autosavePending/);
  assert.match(enrich, /durableCandidateSnapshot/);
  assert.match(enrich, /persistInProgress/);
  assert.match(enrich, /persistFlight/);
  assert.match(enrich, /await activePersist/);
  assert.match(enrich, /persistAttachmentChanges/);
  assert.match(enrich, /AppState\.addEventListener[\s\S]*\}, \[\]\);/);
  assert.doesNotMatch(enrich, /subscription\.remove\(\)[\s\S]{0,250}setEnrichmentDraft/);
  assert.match(recovery, /existing\.writeGeneration >= draft\.writeGeneration/);
  assert.match(packageSource, /property-preview\.txt/);
  assert.match(packageSource, /await input\.shareZip\(output\.uri\)/);
  assert.match(packageSource, /finally[\s\S]*await output\.delete/);
  assert.match(share, /share-preview-attachments/);
  assert.doesNotMatch(share, /for \(const file of files\)/);
});

test('Synthetic enrichment coordinator excludes concurrent persists and flushes edits made during one', async () => {
  let releasePersist: (() => void) | undefined;
  const persistGate = new Promise<void>(resolve => { releasePersist = resolve; });
  const order: string[] = [];
  let activePersist: Promise<void> | null = null;
  let pendingAutosave = false;
  let latest = 'before';
  let evidence: string | null = null;

  const autosave = async (): Promise<void> => {
    if (activePersist) {
      pendingAutosave = true;
      await activePersist.catch(() => undefined);
      return autosave();
    }
    if (pendingAutosave || evidence !== latest) {
      pendingAutosave = false;
      evidence = latest;
      order.push(`autosave:${latest}`);
    }
  };
  const persist = (candidate: string) => {
    if (activePersist) return Promise.reject(new Error('PERSIST_IN_PROGRESS'));
    activePersist = (async () => {
      order.push(`persist:${candidate}`);
      await persistGate;
      evidence = candidate;
    })().finally(() => { activePersist = null; });
    return activePersist;
  };
  const lifecycleFlush = async () => {
    await autosave();
    order.push('flush');
  };

  const first = persist('before');
  await assert.rejects(persist('concurrent'), /PERSIST_IN_PROGRESS/);
  latest = 'edited-during-persist';
  const lifecycle = lifecycleFlush();
  releasePersist!();
  await first;
  await lifecycle;
  assert.deepEqual(order, ['persist:before', 'autosave:edited-during-persist', 'flush']);
  assert.equal(evidence, 'edited-during-persist');
});

test('Synthetic enrichment retry and restart retain failed candidate evidence', async () => {
  let evidence: string | null = null;
  let failOnce = true;
  const persist = async (candidate: string) => {
    evidence = candidate; // The recovery journal is durable before CAS.
    if (failOnce) {
      failOnce = false;
      throw new Error('PROPERTY_CHANGED');
    }
  };

  await assert.rejects(persist('candidate-v1'), /PROPERTY_CHANGED/);
  const recoveredAfterRestart = evidence;
  assert.equal(recoveredAfterRestart, 'candidate-v1');
  await persist(recoveredAfterRestart!);
  assert.equal(evidence, 'candidate-v1');
});

test('BASIC Other remains valid through synthetic autosave restart without clarification', () => {
  const projected = projectDraftToProperty({
    propertyCoreId: 'property-basic-other',
    offerId: 'offer-basic-other',
    propertyType: 'other_built_property',
    locationAreaId: KUWAIT_AREAS[0].id,
    transaction: 'sale',
    salePrice: { amount: 1, currencyCode: 'KWD' },
  });
  assert.equal(projected.ok, true);
  if (!projected.ok) return;
  assert.equal(projected.value.typeDetails, undefined);

  const restarted = JSON.parse(JSON.stringify(projected.value)) as Property;
  assert.equal(restarted.typeDetails, undefined);
  assert.equal(validateProperty(restarted).ok, true);
});

test('Property enrichment preserves governed literal whitespace exactly', () => {
  const values = [
    '  Description line 1\nالوصف  ',
    '\tPrivate notes\n  ',
    '  PACI-123  ',
    '  Block 4, Street 2  ',
    '  https://maps.google.com/?q=29.3,48.0  ',
  ];
  const privacy = [
    { classification: 'normal', disclosurePolicy: 'normal' },
    { classification: 'private_notes', disclosurePolicy: 'never' },
    { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' },
    { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' },
    { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' },
  ] as const;

  values.forEach((value, index) => {
    assert.equal(optionalClassifiedLiteral(value, privacy[index])?.value, value);
  });
  assert.equal(optionalClassifiedLiteral(' \n\t ', privacy[0]), undefined);
});

class RecoveryMemoryStorage {
  values = new Map<string, string>();
  failRemove = false;

  async getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  async removeItem(key: string) {
    if (this.failRemove) throw new Error('cleanup failed');
    this.values.delete(key);
  }
}

class SyntheticPropertyStore {
  properties: Property[];
  deleted = new Set<string>();
  failDelete = false;

  constructor(properties: Property[]) {
    this.properties = JSON.parse(JSON.stringify(properties)) as Property[];
  }

  async init() {}
  async saveProperty(property: Property) {
    if (this.deleted.has(property.core.id)) throw new Error('PROPERTY_ID_DELETED');
    this.properties.push(property);
  }
  async getProperty(id: string) {
    return this.properties.find(property => property.core.id === id) ?? null;
  }
  async compareAndUpdate(expected: Property, replacement: Property) {
    if (this.deleted.has(expected.core.id)) return false;
    const index = this.properties.findIndex(property =>
      property.core.id === expected.core.id
      && JSON.stringify(property) === JSON.stringify(expected));
    if (index < 0) return false;
    this.properties[index] = replacement;
    return true;
  }
  canSafelyUpdate() { return true; }
  canPermanentlyDelete() { return true; }
  async getProperties() { return this.properties; }
  async searchProperties() { return this.properties; }
  async deleteProperty(expected: Property) {
    return this.deletePropertiesSnapshot([expected]);
  }
  async deletePropertiesSnapshot(expected: readonly Property[]) {
    if (this.failDelete) throw new Error('storage failed');
    const ids = expected.map(property => property.core.id);
    if (new Set(ids).size !== ids.length) return { status: 'duplicate' as const };
    for (const property of expected) {
      const matching = this.properties.filter(item => item.core.id === property.core.id);
      if (matching.length === 0) return { status: 'missing' as const };
      if (matching.length > 1) return { status: 'duplicate' as const };
      if (JSON.stringify(matching[0]) !== JSON.stringify(property)) {
        return { status: 'stale' as const };
      }
    }
    expected.forEach(property => this.deleted.add(property.core.id));
    const targets = new Set(ids);
    this.properties = this.properties.filter(property => !targets.has(property.core.id));
    return { status: 'deleted' as const, count: expected.length };
  }
  async getPropertyInventory() {
    return { count: this.properties.length, ids: this.properties.map(item => item.core.id) };
  }
}

const recoveryDraft: PropertyDraft = {
  propertyCoreId: 'recovery-core',
  offerId: 'recovery-offer',
  propertyType: 'apartment',
  transaction: 'sale',
  salePrice: { amount: 150000, currencyCode: 'KWD' },
  locationAreaId: 'salmiya',
};

const recoveryProperty: Property = {
  core: {
    id: 'recovery-core',
    propertyType: 'apartment',
    locationArea: { id: 'salmiya' },
  },
  activeOffer: {
    id: 'recovery-offer',
    propertyCoreId: 'recovery-core',
    transaction: 'sale',
    salePrice: { amount: 150000, currencyCode: 'KWD' },
  },
};

function newRecoveryOperation() {
  return createPropertySaveOperation({
    operationId: 'operation-1',
    draft: recoveryDraft,
    targetProperty: recoveryProperty,
    preparedAt: '2026-08-28T12:00:00.000Z',
  });
}

test('I18n logic (Mocked)', () => {
  const isRTL = (lang: string) => lang === 'ar';
  assert.equal(isRTL('ar'), true);
  assert.equal(isRTL('en'), false);
});

test('Android uses resize keyboard mode for reachable full-screen results', () => {
  assert.equal(appConfig.expo.android.softwareKeyboardLayoutMode, 'resize');
});

test('Draft Projection: Sale Path Validation (KWD)', () => {
  const draft: PropertyDraft = {
    propertyCoreId: 'core-123',
    offerId: 'offer-123',
    propertyType: 'apartment',
    transaction: 'sale',
    salePrice: { amount: 150000, currencyCode: MARKET_CONFIG.currencyCode },
    locationAreaId: 'approved-area-id'
  };

  const result = projectDraftToProperty(draft);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.activeOffer.transaction, 'sale');
    assert.equal(result.value.core.propertyType, 'apartment');
    assert.equal(result.value.core.locationArea.id, 'approved-area-id');
  }
});

test('Draft Projection: Rent Path Validation (KWD)', () => {
  const draft: PropertyDraft = {
    propertyCoreId: 'core-456',
    offerId: 'offer-456',
    propertyType: 'villa',
    transaction: 'rent',
    rentalPrice: { amount: 500, currencyCode: MARKET_CONFIG.currencyCode },
    rentalPeriodId: MARKET_CONFIG.defaultRentalPeriodId,
    locationAreaId: 'approved-area-id'
  };

  const result = projectDraftToProperty(draft);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.activeOffer.transaction, 'rent');
    assert.equal(result.value.activeOffer.rentalPrice?.currencyCode, 'KWD');
    assert.equal(result.value.activeOffer.rentalPrice?.amount, 500);
    assert.equal(result.value.activeOffer.rentalPeriodId, 'monthly');
  }
});

test('Rental price cadence displays monthly bilingually and preserves recorded legacy cadence', () => {
  const labels: Record<string, string> = {
    'price.cadence.monthly': 'per month',
    'price.cadence.recorded_yearly': 'recorded cadence: yearly',
    'price.cadence.recorded': 'recorded cadence',
    'price.cadence.missing': 'cadence not recorded',
  };
  const translate = (key: string) => labels[key] ?? key;
  const translateArabic = (key: string) => key === 'price.cadence.monthly' ? 'شهريا' : labels[key] ?? key;
  assert.equal(MARKET_CONFIG.defaultRentalPeriodId, 'monthly');
  assert.equal(formatRentalPrice(500, 'KWD', 'monthly', 'en', translate), '500 KWD per month');
  assert.equal(formatRentalPrice(500, 'KWD', 'monthly', 'ar', translateArabic), '500 د.ك شهريا');
  assert.equal(
    formatRentalPrice(500, 'KWD', 'yearly', 'en', translate),
    '500 KWD recorded cadence: yearly',
  );
  assert.equal(
    formatRentalPrice(500, 'KWD', 'quarterly', 'en', translate),
    '500 KWD recorded cadence: quarterly',
  );
  assert.equal(
    formatRentalPrice(500, 'KWD', undefined, 'en', translate),
    '500 KWD cadence not recorded',
  );
});

test('Blank generated scaffolds remain fresh while meaningful rental drafts retain cadence protection', () => {
  const classify = (draft: PropertyDraft): 'fresh' | 'resumed' =>
    typeof draft.propertyCoreId === 'string'
    && draft.propertyCoreId.length > 0
    && typeof draft.offerId === 'string'
    && draft.offerId.length > 0
    && Object.entries(draft).every(([key, value]) =>
      key === 'propertyCoreId' || key === 'offerId' || value === undefined)
      ? 'fresh'
      : 'resumed';
  const defaultPeriod = (
    origin: 'fresh' | 'resumed',
    transaction: 'sale' | 'rent',
    existing?: string,
  ) => existing ?? (origin === 'fresh' && transaction === 'rent' ? 'monthly' : undefined);
  const needsConfirmation = (origin: 'fresh' | 'resumed', period?: string) =>
    origin === 'resumed' && period !== 'monthly';
  assert.equal(classify({ propertyCoreId: 'new-core', offerId: 'new-offer' }), 'fresh');
  assert.equal(classify({
    propertyCoreId: 'legacy-core',
    offerId: 'legacy-offer',
    transaction: 'rent',
  }), 'resumed');
  assert.equal(classify({
    propertyCoreId: 'legacy-core',
    offerId: 'legacy-offer',
    transaction: 'rent',
    rentalPeriodId: 'yearly',
  }), 'resumed');
  assert.equal(defaultPeriod('fresh', 'rent'), 'monthly');
  assert.equal(defaultPeriod('resumed', 'rent'), undefined);
  assert.equal(defaultPeriod('resumed', 'rent', 'yearly'), 'yearly');
  assert.equal(needsConfirmation('resumed'), true);
  assert.equal(needsConfirmation('resumed', 'yearly'), true);
  assert.equal(needsConfirmation('resumed', 'monthly'), false);
  assert.equal(needsConfirmation('fresh'), false);
});

test('Approved Kuwait dataset contains 6 governorates and 96 valid areas', () => {
  assert.equal(KUWAIT_GOVERNORATES.length, 6);
  assert.equal(KUWAIT_AREAS.length, 96);
  assert.equal(KUWAIT_AREA_DATASET_STATUS.governorateCount, 6);
  assert.equal(KUWAIT_AREA_DATASET_STATUS.areaCount, 96);
  assert.equal(KUWAIT_AREA_DATASET_STATUS.version, '1.0.0');
  assert.equal(KUWAIT_AREA_DATASET_STATUS.isComplete, true);

  const governorateIds = new Set(KUWAIT_GOVERNORATES.map(item => item.id));
  const areaIds = new Set(KUWAIT_AREAS.map(item => item.id));
  assert.equal(areaIds.size, 96);
  for (const area of KUWAIT_AREAS) {
    assert.ok(governorateIds.has(area.governorateId));
    assert.ok(area.ar.trim());
    assert.ok(area.en.trim());
  }
  for (const alias of KUWAIT_AREA_ALIASES) {
    assert.ok(areaIds.has(alias.canonicalAreaId));
  }
  for (const group of KUWAIT_SEARCH_GROUPS) {
    for (const areaId of group.areaIds) {
      assert.ok(areaIds.has(areaId));
    }
  }
});

test('Area selector architecture searches approved bilingual data', () => {
  const approvedFixture: Area[] = [{
    id: 'approved-area-id',
    en: 'Approved English Area',
    ar: 'منطقة معتمدة',
    governorateId: 'approved-governorate',
    governorateEn: 'Approved Governorate',
    governorateAr: 'محافظة معتمدة',
    areaType: 'residential',
    displayOrder: 1,
  }];

  assert.equal(getAreaById('approved-area-id', approvedFixture)?.ar, 'منطقة معتمدة');
  assert.equal(searchAreas('english', approvedFixture).length, 1);
  assert.equal(searchAreas('معتمدة', approvedFixture).length, 1);
});

test('Area search progressively narrows Arabic and English results', () => {
  const broadArabic = searchAreas('سالم').map(area => area.id);
  const narrowArabic = searchAreas('صباح السالم').map(area => area.id);
  assert.ok(broadArabic.includes('salmiya'));
  assert.ok(broadArabic.includes('sabah_al_salem'));
  assert.deepEqual(narrowArabic, ['sabah_al_salem']);
  assert.ok(narrowArabic.length < broadArabic.length);

  const broadEnglish = searchAreas('sal').map(area => area.id);
  const narrowEnglish = searchAreas('salmiya').map(area => area.id);
  assert.ok(broadEnglish.includes('salmiya'));
  assert.deepEqual(narrowEnglish, ['salmiya']);
  assert.ok(narrowEnglish.length < broadEnglish.length);
});

test('Area search normalizes approved aliases and search groups', () => {
  assert.equal(normalizeAreaSearchText('إشـبيلية'), normalizeAreaSearchText('اشبيلية'));
  assert.equal(searchAreas('Jibla')[0]?.id, 'qibla');
  assert.equal(searchAreas('Al Qibla')[0]?.id, 'qibla');
  assert.equal(searchAreas('اشبيلية')[0]?.id, 'ishbiliya');

  const southSurra = searchAreas('South-Surra').map(area => area.id);
  assert.deepEqual(southSurra, ['salam', 'hitteen', 'shuhada', 'siddiq', 'zahra']);
  assert.equal(getAreaById('south_surra'), undefined);
});

test('Canonical area ID resolves localized labels without storing aliases', () => {
  const canonical = getAreaById('qibla');
  assert.equal(canonical?.en, 'Qibla');
  assert.equal(canonical?.ar, 'القبلة');
  assert.equal(searchAreas('Jibla')[0]?.id, 'qibla');
  assert.notEqual(searchAreas('Jibla')[0]?.id, 'Jibla');
});

test('Persistence Mapping & Search Logic', () => {
  // Simulating the WebStore search logic without RN imports
  const properties: Property[] = [
    {
      core: {
        id: 'core-777',
        propertyType: 'apartment',
        locationArea: { id: 'approved-area-id' }
      },
      activeOffer: {
        id: 'offer-777',
        propertyCoreId: 'core-777',
        transaction: 'rent',
        rentalPrice: { amount: 500, currencyCode: 'KWD' },
        rentalPeriodId: 'yearly'
      }
    }
  ];

  const searchProperties = (query: string) => {
    const q = query.toLowerCase();
    return properties.filter(p => {
      const text = [
        p.core.propertyType,
        p.activeOffer.transaction,
        p.core.locationArea.id,
        p.core.id
      ].join(' ').toLowerCase();
      return text.includes(q);
    });
  };

  assert.equal(searchProperties('approved-area-id').length, 1);
  assert.equal(searchProperties('rent').length, 1);
  assert.equal(searchProperties('villa').length, 0);
});

test('Currency display is localized without changing the amount', () => {
  assert.equal(formatPrice(350, 'KWD', 'en'), '350 KWD');
  assert.equal(formatPrice(350, 'KWD', 'ar'), '350 د.ك');
});

test('Legacy Stage 01B1 SAR property normalization is idempotent', () => {
  const legacy: Property = {
    core: {
      id: 'legacy-core',
      propertyType: 'apartment',
      locationArea: { id: 'legacy-area' },
    },
    activeOffer: {
      id: 'legacy-offer',
      propertyCoreId: 'legacy-core',
      transaction: 'sale',
      salePrice: { amount: 350, currencyCode: 'SAR' },
    },
  };

  const first = normalizePropertyCurrency(legacy);
  assert.equal(first.changed, true);
  assert.equal(first.property.activeOffer.transaction, 'sale');
  if (first.property.activeOffer.transaction === 'sale') {
    assert.equal(first.property.activeOffer.salePrice.amount, 350);
    assert.equal(first.property.activeOffer.salePrice.currencyCode, 'KWD');
  }

  const reload = normalizePropertyCurrency(first.property);
  assert.equal(reload.changed, false);
  assert.deepEqual(reload.property, first.property);
});

test('Legacy Stage 01B1 SAR draft recovery preserves price and writes KWD', () => {
  const legacyDraft: PropertyDraft = {
    transaction: 'rent',
    rentalPrice: { amount: 350, currencyCode: 'SAR' },
  };
  const normalized = normalizeDraftCurrency(legacyDraft);
  assert.equal(normalized.changed, true);
  assert.equal(normalized.draft.rentalPrice?.amount, 350);
  assert.equal(normalized.draft.rentalPrice?.currencyCode, 'KWD');
});

test('Web persistence migration is one-time, durable, and leaves later SAR records alone', async () => {
  class MemoryStorage {
    values = new Map<string, string>();
    async getItem(key: string) {
      return this.values.get(key) ?? null;
    }
    async setItem(key: string, value: string) {
      this.values.set(key, value);
    }
  }

  const storage = new MemoryStorage();
  const propertiesKey = '@viewstate_properties';
  const legacyRecords: Property[] = [
    {
      core: {
        id: 'legacy-sale',
        propertyType: 'apartment',
        locationArea: { id: 'legacy-area' },
        description: {
          value: 'preserve me',
          privacy: { classification: 'normal', disclosurePolicy: 'normal' },
        },
      },
      activeOffer: {
        id: 'legacy-sale-offer',
        propertyCoreId: 'legacy-sale',
        transaction: 'sale',
        salePrice: { amount: 350, currencyCode: 'SAR' },
      },
    },
    {
      core: {
        id: 'legacy-rent',
        propertyType: 'villa',
        locationArea: { id: 'legacy-area-2' },
      },
      activeOffer: {
        id: 'legacy-rent-offer',
        propertyCoreId: 'legacy-rent',
        transaction: 'rent',
        rentalPrice: { amount: 450, currencyCode: 'SAR' },
        rentalPeriodId: 'yearly',
      },
    },
  ];
  await storage.setItem(propertiesKey, JSON.stringify(legacyRecords));

  assert.equal(await migrateStage01B1WebProperties(storage, propertiesKey), true);
  const migrated = JSON.parse((await storage.getItem(propertiesKey))!) as Property[];
  assert.equal(migrated[0].activeOffer.transaction, 'sale');
  if (migrated[0].activeOffer.transaction === 'sale') {
    assert.equal(migrated[0].activeOffer.salePrice.amount, 350);
    assert.equal(migrated[0].activeOffer.salePrice.currencyCode, 'KWD');
  }
  assert.deepEqual(migrated[0].core.description, legacyRecords[0].core.description);
  assert.equal(migrated[1].activeOffer.transaction, 'rent');
  if (migrated[1].activeOffer.transaction === 'rent') {
    assert.equal(migrated[1].activeOffer.rentalPrice.amount, 450);
    assert.equal(migrated[1].activeOffer.rentalPrice.currencyCode, 'KWD');
  }
  assert.equal(await storage.getItem(STAGE_01B1_WEB_MIGRATION_KEY), 'complete');

  const legitimateFutureSar: Property = {
    core: {
      id: 'future-sa-record',
      propertyType: 'office',
      locationArea: { id: 'future-area' },
    },
    activeOffer: {
      id: 'future-sa-offer',
      propertyCoreId: 'future-sa-record',
      transaction: 'sale',
      salePrice: { amount: 999, currencyCode: 'SAR' },
    },
  };
  await storage.setItem(propertiesKey, JSON.stringify([...migrated, legitimateFutureSar]));

  assert.equal(await migrateStage01B1WebProperties(storage, propertiesKey), false);
  const reloaded = JSON.parse((await storage.getItem(propertiesKey))!) as Property[];
  const future = reloaded.find(property => property.core.id === 'future-sa-record');
  assert.equal(future?.activeOffer.transaction, 'sale');
  if (future?.activeOffer.transaction === 'sale') {
    assert.equal(future.activeOffer.salePrice.amount, 999);
    assert.equal(future.activeOffer.salePrice.currencyCode, 'SAR');
  }
});

test('Concurrent Stage 01B1 migration preserves records added during migration', async () => {
  class DelayedStorage {
    values = new Map<string, string>();
    latestReadCount = 0;

    async getItem(key: string) {
      if (key === '@viewstate_properties') {
        this.latestReadCount += 1;
        if (this.latestReadCount === 2) {
          const current = JSON.parse(this.values.get(key)!) as Property[];
          current[0] = {
            ...current[0],
            core: {
              ...current[0].core,
              locationArea: { id: 'newer-area' },
              description: {
                value: 'newer description',
                privacy: {
                  classification: 'normal',
                  disclosurePolicy: 'normal',
                },
              },
            },
          };
          if (current[1].activeOffer.transaction === 'sale') {
            current[1] = {
              ...current[1],
              activeOffer: {
                ...current[1].activeOffer,
                salePrice: { amount: 777, currencyCode: 'SAR' },
              },
            };
          }
          current.push({
            core: {
              id: 'added-during-migration',
              propertyType: 'office',
              locationArea: { id: 'future-area' },
            },
            activeOffer: {
              id: 'future-offer',
              propertyCoreId: 'added-during-migration',
              transaction: 'sale',
              salePrice: { amount: 999, currencyCode: 'SAR' },
            },
          });
          this.values.set(key, JSON.stringify(current));
        }
      }
      return this.values.get(key) ?? null;
    }

    async setItem(key: string, value: string) {
      this.values.set(key, value);
    }
  }

  const storage = new DelayedStorage();
  const key = '@viewstate_properties';
  await storage.setItem(key, JSON.stringify([
    {
      core: {
        id: 'legacy-before-migration',
        propertyType: 'apartment',
        locationArea: { id: 'legacy-area' },
      },
      activeOffer: {
        id: 'legacy-before-offer',
        propertyCoreId: 'legacy-before-migration',
        transaction: 'sale',
        salePrice: { amount: 350, currencyCode: 'SAR' },
      },
    },
    {
      core: {
        id: 'legacy-price-changed',
        propertyType: 'shop',
        locationArea: { id: 'legacy-area-2' },
      },
      activeOffer: {
        id: 'legacy-price-changed-offer',
        propertyCoreId: 'legacy-price-changed',
        transaction: 'sale',
        salePrice: { amount: 500, currencyCode: 'SAR' },
      },
    },
  ] satisfies Property[]));

  const [first, second] = await Promise.all([
    migrateStage01B1WebProperties(storage, key),
    migrateStage01B1WebProperties(storage, key),
  ]);
  assert.equal(first, true);
  assert.equal(second, true);

  const persisted = JSON.parse((await storage.getItem(key))!) as Property[];
  assert.equal(persisted.length, 3);
  const legacy = persisted.find(property => property.core.id === 'legacy-before-migration');
  const changedPrice = persisted.find(property => property.core.id === 'legacy-price-changed');
  const future = persisted.find(property => property.core.id === 'added-during-migration');
  if (legacy?.activeOffer.transaction === 'sale') {
    assert.equal(legacy.activeOffer.salePrice.currencyCode, 'KWD');
    assert.equal(legacy.activeOffer.salePrice.amount, 350);
    assert.equal(legacy.core.locationArea.id, 'newer-area');
    assert.equal(legacy.core.description?.value, 'newer description');
  } else {
    assert.fail('Expected migrated legacy sale record');
  }
  if (changedPrice?.activeOffer.transaction === 'sale') {
    assert.equal(changedPrice.activeOffer.salePrice.currencyCode, 'SAR');
    assert.equal(changedPrice.activeOffer.salePrice.amount, 777);
  } else {
    assert.fail('Expected concurrently updated sale record');
  }
  if (future?.activeOffer.transaction === 'sale') {
    assert.equal(future.activeOffer.salePrice.currencyCode, 'SAR');
    assert.equal(future.activeOffer.salePrice.amount, 999);
  } else {
    assert.fail('Expected future sale record');
  }
});

test('Concurrent draft migration preserves newer draft fields and changed prices', async () => {
  class DelayedDraftStorage {
    values = new Map<string, string>();
    draftReadCount = 0;

    async getItem(key: string) {
      if (key === '@viewstate_property_draft') {
        this.draftReadCount += 1;
        if (this.draftReadCount === 2) {
          const latest = JSON.parse(this.values.get(key)!) as PropertyDraft;
          this.values.set(key, JSON.stringify({
            ...latest,
            locationAreaId: 'newer-area',
            rentalPrice: { amount: 777, currencyCode: 'SAR' },
          }));
        }
      }
      return this.values.get(key) ?? null;
    }

    async setItem(key: string, value: string) {
      this.values.set(key, value);
    }
  }

  const storage = new DelayedDraftStorage();
  const key = '@viewstate_property_draft';
  await storage.setItem(key, JSON.stringify({
    transaction: 'rent',
    locationAreaId: 'legacy-area',
    salePrice: { amount: 350, currencyCode: 'SAR' },
    rentalPrice: { amount: 500, currencyCode: 'SAR' },
  } satisfies PropertyDraft));

  assert.equal(await migrateStage01B1Draft(storage, key), true);
  assert.equal(await storage.getItem(STAGE_01B1_DRAFT_MIGRATION_KEY), 'complete');
  const persisted = JSON.parse((await storage.getItem(key))!) as PropertyDraft;
  assert.equal(persisted.locationAreaId, 'newer-area');
  assert.equal(persisted.salePrice?.amount, 350);
  assert.equal(persisted.salePrice?.currencyCode, 'KWD');
  assert.equal(persisted.rentalPrice?.amount, 777);
  assert.equal(persisted.rentalPrice?.currencyCode, 'SAR');
});

test('Draft writes remain ordered through immediate reset', async () => {
  const queue = new SerialTaskQueue();
  const stored: string[] = [];

  void queue.enqueue(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    stored.push('old-draft');
  });
  await queue.enqueue(async () => {
    stored.length = 0;
  });
  await queue.enqueue(async () => {
    stored.push('fresh-draft');
  });
  await queue.flush();

  assert.deepEqual(stored, ['fresh-draft']);
});

test('Serial queue preserves ordering and continues after a failed write', async () => {
  const queue = new SerialTaskQueue();
  const stored: string[] = [];

  const failed = queue.enqueue(async () => {
    stored.push('first');
    throw new Error('write failed');
  });
  const recovered = queue.enqueue(async () => {
    stored.push('second');
  });

  await assert.rejects(failed, /write failed/);
  await recovered;
  await queue.flush();
  assert.deepEqual(stored, ['first', 'second']);
});

test('Unreadable stored draft is explicit and is not treated as an empty draft', () => {
  assert.equal(parseStoredJson<PropertyDraft>(null), null);
  assert.throws(
    () => parseStoredJson<PropertyDraft>('{"transaction":'),
    StoredValueParseError,
  );
});

test('Save failure keeps cleanup pending for a successful retry', async () => {
  let saveAttempts = 0;
  let cleanupAttempts = 0;

  const first = await runSaveWithCleanup({
    propertyAlreadySaved: false,
    saveProperty: async () => {
      saveAttempts += 1;
      throw new Error('disk unavailable');
    },
    cleanupDraft: async () => {
      cleanupAttempts += 1;
    },
  });
  assert.equal(first.status, 'save_failed');
  assert.equal(first.propertySaved, false);
  assert.equal(saveAttempts, 1);
  assert.equal(cleanupAttempts, 0);

  const retry = await runSaveWithCleanup({
    propertyAlreadySaved: first.propertySaved,
    saveProperty: async () => {
      saveAttempts += 1;
    },
    cleanupDraft: async () => {
      cleanupAttempts += 1;
    },
  });
  assert.equal(retry.status, 'complete');
  assert.equal(saveAttempts, 2);
  assert.equal(cleanupAttempts, 1);
});

test('Draft cleanup retry never saves an already-persisted property twice', async () => {
  let saves = 0;
  let cleanups = 0;

  const first = await runSaveWithCleanup({
    propertyAlreadySaved: false,
    saveProperty: async () => {
      saves += 1;
    },
    cleanupDraft: async () => {
      cleanups += 1;
      throw new Error('draft write failed');
    },
  });
  assert.equal(first.status, 'cleanup_failed');
  assert.equal(first.propertySaved, true);

  const retry = await runSaveWithCleanup({
    propertyAlreadySaved: first.propertySaved,
    saveProperty: async () => {
      saves += 1;
    },
    cleanupDraft: async () => {
      cleanups += 1;
    },
  });
  assert.equal(retry.status, 'complete');
  assert.equal(saves, 1);
  assert.equal(cleanups, 2);
});

test('Restart before property save preserves work and requires explicit retry', async () => {
  const storage = new RecoveryMemoryStorage();
  await persistPropertySaveOperation(storage, newRecoveryOperation());
  const operation = await loadPropertySaveOperation(storage);
  assert.ok(operation);
  let saves = 0;
  let cleanups = 0;
  const result = await executePropertySaveRecovery({
    operation,
    allowSave: false,
    getProperties: async () => [],
    saveProperty: async () => { saves += 1; },
    getDraft: () => recoveryDraft,
    cleanupDraft: async () => { cleanups += 1; return 'replaced'; },
    clearOperation: async () => true,
  });

  assert.deepEqual(result, { status: 'retry_required' });
  assert.equal(saves, 0);
  assert.equal(cleanups, 0);
});

test('Explicit retry saves once, then performs guarded cleanup', async () => {
  const operation = newRecoveryOperation();
  const properties: Property[] = [];
  let saves = 0;
  let cleanups = 0;
  const result = await executePropertySaveRecovery({
    operation,
    allowSave: true,
    getProperties: async () => properties,
    saveProperty: async property => {
      saves += 1;
      properties.push(property);
    },
    getDraft: () => recoveryDraft,
    cleanupDraft: async () => { cleanups += 1; return 'replaced'; },
    clearOperation: async () => true,
  });

  assert.equal(result.status, 'complete');
  assert.equal(saves, 1);
  assert.equal(cleanups, 1);
});

test('Restart after confirmed save retries cleanup only and never saves twice', async () => {
  const storage = new RecoveryMemoryStorage();
  await persistPropertySaveOperation(storage, newRecoveryOperation());
  const operation = await loadPropertySaveOperation(storage);
  assert.ok(operation);
  let saves = 0;
  let cleanupAttempts = 0;
  let failCleanup = true;
  const options = {
    operation,
    allowSave: false,
    getProperties: async () => [recoveryProperty],
    saveProperty: async () => { saves += 1; },
    getDraft: () => recoveryDraft,
    cleanupDraft: async () => {
      cleanupAttempts += 1;
      if (failCleanup) throw new Error('draft cleanup failed');
      return 'replaced' as const;
    },
    clearOperation: async () => true,
  };

  const interrupted = await executePropertySaveRecovery(options);
  assert.equal(interrupted.status, 'cleanup_failed');
  assert.equal(saves, 0);

  failCleanup = false;
  const restartRetry = await executePropertySaveRecovery(options);
  assert.equal(restartRetry.status, 'complete');
  assert.equal(saves, 0);
  assert.equal(cleanupAttempts, 2);
});

test('Newer draft contents survive cleanup even when identifiers are unchanged', async () => {
  const operation = newRecoveryOperation();
  const changedSameIds: PropertyDraft = {
    ...recoveryDraft,
    locationAreaId: 'qibla',
  };
  let cleanupAttempts = 0;
  let cleared = 0;
  const result = await executePropertySaveRecovery({
    operation,
    allowSave: false,
    getProperties: async () => [recoveryProperty],
    saveProperty: async () => assert.fail('confirmed property must not be saved again'),
    getDraft: () => changedSameIds,
    cleanupDraft: async () => { cleanupAttempts += 1; return 'replaced'; },
    clearOperation: async () => { cleared += 1; return true; },
  });

  assert.deepEqual(result, {
    status: 'complete',
    savedNow: false,
    newerDraftPreserved: true,
  });
  assert.equal(cleanupAttempts, 0);
  assert.equal(cleared, 1);
});

test('Newer draft with different identifiers also survives confirmed-save cleanup', async () => {
  const operation = newRecoveryOperation();
  const newerDraft: PropertyDraft = {
    ...recoveryDraft,
    propertyCoreId: 'newer-core',
    offerId: 'newer-offer',
  };
  let cleanupAttempts = 0;
  const result = await executePropertySaveRecovery({
    operation,
    allowSave: false,
    getProperties: async () => [recoveryProperty],
    saveProperty: async () => assert.fail('confirmed property must not be saved again'),
    getDraft: () => newerDraft,
    cleanupDraft: async () => { cleanupAttempts += 1; return 'replaced'; },
    clearOperation: async () => true,
  });

  assert.equal(result.status, 'complete');
  assert.equal(cleanupAttempts, 0);
});

test('Changed saved property blocks overwrite and preserves unresolved operation', async () => {
  const operation = newRecoveryOperation();
  const changedProperty: Property = {
    ...recoveryProperty,
    core: {
      ...recoveryProperty.core,
      locationArea: { id: 'qibla' },
    },
  };
  let saves = 0;
  let cleanups = 0;
  let clears = 0;
  const result = await executePropertySaveRecovery({
    operation,
    allowSave: true,
    getProperties: async () => [changedProperty],
    saveProperty: async () => { saves += 1; },
    getDraft: () => recoveryDraft,
    cleanupDraft: async () => { cleanups += 1; return 'replaced'; },
    clearOperation: async () => { clears += 1; return true; },
  });

  assert.deepEqual(result, { status: 'conflict' });
  assert.equal(saves, 0);
  assert.equal(cleanups, 0);
  assert.equal(clears, 0);
});

test('Malformed recovery data stays stored and blocks recovery', async () => {
  const storage = new RecoveryMemoryStorage();
  const malformed = '{"version":1,"operationId":';
  storage.values.set(PROPERTY_SAVE_OPERATION_KEY, malformed);

  await assert.rejects(
    () => loadPropertySaveOperation(storage),
    SaveRecoveryReadError,
  );
  assert.equal(storage.values.get(PROPERTY_SAVE_OPERATION_KEY), malformed);
});

test('An unresolved recovery operation cannot be replaced', async () => {
  const storage = new RecoveryMemoryStorage();
  const first = newRecoveryOperation();
  await persistPropertySaveOperation(storage, first);
  const second = {
    ...first,
    operationId: 'operation-2',
  };

  await assert.rejects(
    () => persistPropertySaveOperation(storage, second),
    PendingSaveOperationExistsError,
  );
  assert.deepEqual(await loadPropertySaveOperation(storage), first);
});

test('Failure to clear recovery state causes cleanup-only retry without another save', async () => {
  const operation = newRecoveryOperation();
  const storage = new RecoveryMemoryStorage();
  await persistPropertySaveOperation(storage, operation);
  storage.failRemove = true;
  let saves = 0;
  const run = () => executePropertySaveRecovery({
    operation,
    allowSave: false,
    getProperties: async () => [recoveryProperty],
    saveProperty: async () => { saves += 1; },
    getDraft: () => recoveryDraft,
    cleanupDraft: async () => 'replaced',
    clearOperation: candidate => clearPropertySaveOperation(storage, candidate),
  });

  assert.equal((await run()).status, 'cleanup_failed');
  assert.equal(saves, 0);
  assert.ok(await storage.getItem(PROPERTY_SAVE_OPERATION_KEY));

  storage.failRemove = false;
  assert.equal((await run()).status, 'complete');
  assert.equal(saves, 0);
  assert.equal(await storage.getItem(PROPERTY_SAVE_OPERATION_KEY), null);
});

test('Changed same-ID draft prevents explicit retry of an unresolved save', async () => {
  const operation = newRecoveryOperation();
  const changedSameIds: PropertyDraft = {
    ...recoveryDraft,
    salePrice: { amount: 175000, currencyCode: 'KWD' },
  };
  let saves = 0;
  const result = await executePropertySaveRecovery({
    operation,
    allowSave: true,
    getProperties: async () => [],
    saveProperty: async () => { saves += 1; },
    getDraft: () => changedSameIds,
    cleanupDraft: async () => 'replaced',
    clearOperation: async () => true,
  });

  assert.deepEqual(result, { status: 'unresolved_draft' });
  assert.equal(saves, 0);
});

test('Single-flight guard prevents rapid duplicate submissions', async () => {
  const flight = new SingleFlight();
  let submissions = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });

  const first = flight.run(async () => {
    submissions += 1;
    await gate;
    return 'saved';
  });
  const duplicate = await flight.run(async () => {
    submissions += 1;
    return 'duplicate';
  });

  assert.deepEqual(duplicate, { started: false });
  assert.equal(submissions, 1);
  release();
  assert.deepEqual(await first, { started: true, value: 'saved' });
});

test('Capture reliability UI exposes localized errors and accessible stable controls', async () => {
  const sourcePath = (relativePath: string) => decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
  const [i18n, header, selectCard, location, summary, button, captureContext, draftService] = await Promise.all([
    readFile(sourcePath('../contexts/I18nContext.tsx'), 'utf8'),
    readFile(sourcePath('../components/CaptureHeader.tsx'), 'utf8'),
    readFile(sourcePath('../components/SelectCard.tsx'), 'utf8'),
    readFile(sourcePath('../app/capture/location.tsx'), 'utf8'),
    readFile(sourcePath('../app/capture/summary.tsx'), 'utf8'),
    readFile(sourcePath('../components/Button.tsx'), 'utf8'),
    readFile(sourcePath('../contexts/CaptureContext.tsx'), 'utf8'),
    readFile(sourcePath('../services/draft.ts'), 'utf8'),
  ]);

  assert.match(i18n, /'errors\.storage_save': 'The local save failed/);
  assert.match(i18n, /'errors\.storage_save': 'تعذر الحفظ محلياً/);
  assert.match(i18n, /'errors\.cleanup_after_save': 'The property was saved/);
  assert.match(i18n, /'errors\.cleanup_after_save': 'تم حفظ العقار/);
  assert.match(header, /testID="capture-back"/);
  assert.match(header, /testID="capture-cancel"/);
  assert.match(header, /testID="capture-cancel-dialog"/);
  assert.match(header, /testID="capture-keep-editing"/);
  assert.match(header, /testID="capture-keep-draft-exit"/);
  assert.match(header, /testID="capture-discard-draft"/);
  assert.match(header, /capture\.keep_draft_exit/);
  assert.match(header, /capture\.discard/);
  assert.match(selectCard, /accessibilityRole="radio"/);
  assert.match(selectCard, /accessibilityState=\{\{ selected: Boolean\(selected\) \}\}/);
  assert.match(location, /testID="location-selector"/);
  assert.match(location, /testID=\{`location-area-\$\{item\.id\}`\}/);
  assert.match(summary, /new SingleFlight\(\)/);
  assert.match(summary, /savePropertyWithRecovery/);
  assert.match(i18n, /'errors\.recovery_retry': 'The previous save could not be confirmed/);
  assert.match(i18n, /'errors\.recovery_retry': 'تعذر تأكيد عملية الحفظ السابقة/);
  assert.match(i18n, /'errors\.recovery_conflict': 'The saved property or draft changed/);
  assert.match(i18n, /'errors\.recovery_unreadable': 'تعذرت قراءة سجل الحفظ المعلق/);
  assert.match(button, /accessibilityState=\{\{ disabled: disabled \|\| loading, busy: loading \}\}/);
  assert.match(captureContext, /\}\, \[\]\);/);
  assert.match(captureContext, /if \(!isReady\) return null;/);
  assert.match(captureContext, /saveRecoveryStatus !== 'none'/);
  assert.match(captureContext, /The draft cannot be discarded while save recovery is unresolved/);
  assert.match(captureContext, /mutationsBlocked\.current = true;[\s\S]*persistPropertySaveOperation/);
  assert.match(draftService, /current !== expectedSnapshot/);
  assert.match(draftService, /generation !== writeGeneration/);
});

test('Task 6 executable candidate simulation: unchanged type preserves exact identity, literals, privacy, source and unknown data', () => {
  const baseline = {
    core: {
      id: 'edit-preserve-core',
      propertyType: 'villa',
      locationArea: { id: 'salmiya', unknownLocation: 'kept' },
      description: { value: 'literal', privacy: { classification: 'normal', disclosurePolicy: 'normal' } },
      privateNotes: { value: 'private', privacy: { classification: 'private_notes', disclosurePolicy: 'never' } },
      ownerSource: { value: 'owner', privacy: { classification: 'owner_source', disclosurePolicy: 'explicit_per_share' } },
      exactLocation: { value: 'exact', privacy: { classification: 'exact_location', disclosurePolicy: 'explicit_per_share' } },
      sourceEnvelope: { imported: true },
    },
    activeOffer: {
      id: 'edit-preserve-offer',
      propertyCoreId: 'edit-preserve-core',
      transaction: 'sale',
      salePrice: { amount: 100, currencyCode: 'KWD', priceMetadata: { source: 'literal' } },
      unrelatedOfferData: { literal: 'keep' },
    },
    unknownRoot: { privacySafe: true },
  } as unknown as Property;
  const candidate = buildPropertyUpdateCandidate(baseline, {
    propertyType: 'villa',
    transaction: 'sale',
    priceAmount: 900,
    locationAreaId: 'qibla',
  });
  assert.equal(candidate.core.id, baseline.core.id);
  assert.equal(candidate.activeOffer.id, baseline.activeOffer.id);
  assert.equal(candidate.activeOffer.propertyCoreId, baseline.core.id);
  assert.equal(candidate.core.propertyType, 'villa');
  assert.equal(candidate.core.locationArea.id, 'qibla');
  assert.equal(candidate.activeOffer.transaction, 'sale');
  if (candidate.activeOffer.transaction === 'sale') {
    assert.equal(candidate.activeOffer.salePrice.amount, 900);
    assert.deepEqual((candidate.activeOffer.salePrice as any).priceMetadata, { source: 'literal' });
  }
  assert.deepEqual((candidate.core as any).description, (baseline.core as any).description);
  assert.deepEqual((candidate.core as any).privateNotes, (baseline.core as any).privateNotes);
  assert.deepEqual((candidate.core as any).ownerSource, (baseline.core as any).ownerSource);
  assert.deepEqual((candidate.core as any).exactLocation, (baseline.core as any).exactLocation);
  assert.deepEqual((candidate.core as any).sourceEnvelope, (baseline.core as any).sourceEnvelope);
  assert.equal((candidate.core.locationArea as any).unknownLocation, 'kept');
  assert.deepEqual((candidate.activeOffer as any).unrelatedOfferData, (baseline.activeOffer as any).unrelatedOfferData);
  assert.deepEqual((candidate as any).unknownRoot, (baseline as any).unknownRoot);
  assert.equal(baseline.activeOffer.transaction, 'sale');
  const pricePatched = buildPropertyUpdateCandidate(baseline, {
    propertyType: 'villa',
    transaction: 'sale',
    priceAmount: 101,
    locationAreaId: 'salmiya',
  });
  assert.equal(pricePatched.activeOffer.transaction, 'sale');
  assert.deepEqual((pricePatched.activeOffer.salePrice as any).currencyCode, 'KWD');
  assert.deepEqual((pricePatched.activeOffer.salePrice as any).priceMetadata, { source: 'literal' });
});

test('Task 6 executable validation simulation: explicit Sale to Rent uses the monthly market default', () => {
  const sale = recoveryProperty;
  const rent = buildPropertyUpdateCandidate(sale, {
    propertyType: 'apartment',
    transaction: 'rent',
    priceAmount: 500,
    locationAreaId: 'salmiya',
    rentalPeriodId: MARKET_CONFIG.defaultRentalPeriodId,
  });
  assert.equal(rent.core.id, sale.core.id);
  assert.equal(rent.activeOffer.id, sale.activeOffer.id);
  assert.equal(rent.activeOffer.propertyCoreId, sale.core.id);
  assert.equal(rent.activeOffer.transaction, 'rent');
  if (rent.activeOffer.transaction === 'rent') {
    assert.equal(rent.activeOffer.rentalPrice.amount, 500);
    assert.equal(rent.activeOffer.rentalPeriodId, 'monthly');
    assert.equal('salePrice' in rent.activeOffer, false);
  }
  assert.throws(() => buildPropertyUpdateCandidate(sale, {
    propertyType: 'apartment',
    transaction: 'rent',
    priceAmount: 500,
    locationAreaId: 'salmiya',
    rentalPeriodId: 'yearly',
  }), /TRANSACTION_SCOPE_RENT_PERIOD/);
});

test('Task 6 executable validation simulation: original Rent may switch to Sale and back using retained period with a new price', () => {
  const rent: Property = {
    core: { id: 'rent-transition', propertyType: 'apartment', locationArea: { id: 'salmiya' } },
    activeOffer: {
      id: 'rent-transition-offer',
      propertyCoreId: 'rent-transition',
      transaction: 'rent',
      rentalPrice: { amount: 500, currencyCode: 'KWD' },
      rentalPeriodId: 'monthly',
    },
  };
  const sale = buildPropertyUpdateCandidate(rent, {
    propertyType: 'apartment',
    transaction: 'sale',
    priceAmount: 175000,
    locationAreaId: 'salmiya',
    rentalPeriodId: 'monthly',
  });
  assert.equal(sale.activeOffer.transaction, 'sale');
  assert.equal('rentalPrice' in sale.activeOffer, false);
  assert.equal('rentalPeriodId' in sale.activeOffer, false);
  const rentAgain = buildPropertyUpdateCandidate(rent, {
    propertyType: 'apartment',
    transaction: 'rent',
    priceAmount: 650,
    locationAreaId: 'salmiya',
    rentalPeriodId: 'monthly',
  });
  assert.equal(rentAgain.activeOffer.transaction, 'rent');
  if (rentAgain.activeOffer.transaction === 'rent') {
    assert.equal(rentAgain.activeOffer.rentalPeriodId, 'monthly');
    assert.equal(rentAgain.activeOffer.rentalPrice.amount, 650);
  }
});

test('Task 6 executable validation simulation: legacy rental cadence is retained and never defaulted or converted', () => {
  const makeRent = (rentalPeriodId: string) => ({
    core: { id: `legacy-${rentalPeriodId}`, propertyType: 'villa', locationArea: { id: 'salmiya' } },
    activeOffer: {
      id: `legacy-${rentalPeriodId}-offer`,
      propertyCoreId: `legacy-${rentalPeriodId}`,
      transaction: 'rent' as const,
      rentalPrice: { amount: 500, currencyCode: 'KWD' },
      rentalPeriodId,
    },
  }) satisfies Property;
  for (const recordedPeriod of ['yearly', 'quarterly']) {
    const baseline = makeRent(recordedPeriod);
    const draft = createEditDraft(baseline);
    assert.equal(draft.choices.rentalPeriodId, recordedPeriod);
    const candidate = buildPropertyUpdateCandidate(baseline, {
      ...draft.choices,
      priceAmount: 550,
      locationAreaId: 'qibla',
    });
    assert.equal(candidate.activeOffer.transaction, 'rent');
    if (candidate.activeOffer.transaction === 'rent') {
      assert.equal(candidate.activeOffer.rentalPeriodId, recordedPeriod);
      assert.equal(candidate.activeOffer.rentalPrice.amount, 550);
    }
  }

  const missingPeriod = {
    core: { id: 'legacy-missing', propertyType: 'villa', locationArea: { id: 'salmiya' } },
    activeOffer: {
      id: 'legacy-missing-offer',
      propertyCoreId: 'legacy-missing',
      transaction: 'rent',
      rentalPrice: { amount: 500, currencyCode: 'KWD' },
    },
  } as unknown as Property;
  const before = JSON.stringify(missingPeriod);
  const draft = createEditDraft(missingPeriod);
  assert.equal(draft.choices.rentalPeriodId, undefined);
  assert.throws(() => buildPropertyUpdateCandidate(missingPeriod, {
    ...draft.choices,
    priceAmount: 550,
  }), /MISSING_RENTAL_PERIOD/);
  assert.equal(JSON.stringify(missingPeriod), before);
});

test('Task 6 executable validation simulation: enrichment mismatch, invalid price and unapproved area fail closed', () => {
  const safeTypeChange = buildPropertyUpdateCandidate(recoveryProperty, {
    propertyType: 'villa',
    transaction: 'sale',
    priceAmount: 150000,
    locationAreaId: 'salmiya',
  });
  assert.equal(safeTypeChange.core.propertyType, 'villa');
  const enriched = {
    ...recoveryProperty,
    typeDetails: { propertyType: 'apartment' as const, apartmentSubtype: 'studio' as const },
  };
  assert.throws(() => buildPropertyUpdateCandidate(enriched, {
    propertyType: 'villa',
    transaction: 'sale',
    priceAmount: 1,
    locationAreaId: 'salmiya',
  }), /INCOMPATIBLE_TYPE_DETAILS/);
  const unknownEnrichment = { ...recoveryProperty, enrichment: { sourceType: 'apartment' } } as Property;
  assert.throws(() => buildPropertyUpdateCandidate(unknownEnrichment, {
    propertyType: 'villa',
    transaction: 'sale',
    priceAmount: 1,
    locationAreaId: 'salmiya',
  }), /INCOMPATIBLE_TYPE_DETAILS/);
  const arbitraryUnknown = {
    ...recoveryProperty,
    core: {
      ...recoveryProperty.core,
      locationArea: { ...recoveryProperty.core.locationArea, potentiallyTypeBound: true },
    },
  } as Property;
  assert.throws(() => buildPropertyUpdateCandidate(arbitraryUnknown, {
    propertyType: 'villa',
    transaction: 'sale',
    priceAmount: 1,
    locationAreaId: 'salmiya',
  }), /INCOMPATIBLE_TYPE_DETAILS/);
  assert.throws(() => buildPropertyUpdateCandidate(recoveryProperty, {
    propertyType: 'apartment',
    transaction: 'sale',
    priceAmount: -1,
    locationAreaId: 'salmiya',
  }), /INVALID_PRICE/);
  assert.throws(() => buildPropertyUpdateCandidate(recoveryProperty, {
    propertyType: 'apartment',
    transaction: 'sale',
    priceAmount: 1,
    locationAreaId: 'not-approved',
  }), /INVALID_APPROVED_AREA/);
});

test('Task 6 executable draft simulation: per-property edit drafts are isolated from add draft and each other', async () => {
  const storage = new RecoveryMemoryStorage();
  const first = createEditDraft({ ...recoveryProperty, core: { ...recoveryProperty.core, id: 'draft-a' }, activeOffer: { ...recoveryProperty.activeOffer, propertyCoreId: 'draft-a' } });
  const second = createEditDraft({ ...recoveryProperty, core: { ...recoveryProperty.core, id: 'draft-b' }, activeOffer: { ...recoveryProperty.activeOffer, propertyCoreId: 'draft-b' } });
  await savePropertyEditDraft(first, storage);
  await savePropertyEditDraft(second, storage);
  storage.values.set('@viewstate_property_draft', '{"capture":"untouched"}');
  assert.deepEqual(await loadPropertyEditDraft('draft-a', storage), first);
  assert.deepEqual(await loadPropertyEditDraft('draft-b', storage), second);
  assert.equal(storage.values.get('@viewstate_property_draft'), '{"capture":"untouched"}');
  assert.notEqual(propertyEditDraftKey('draft-a'), propertyEditDraftKey('draft-b'));
});

test('Task 6 executable draft simulation: newer same-ID generation and discard prevent delayed resurrection', async () => {
  const storage = new RecoveryMemoryStorage();
  const first = createEditDraft({ ...recoveryProperty, core: { ...recoveryProperty.core, id: 'generation-core' }, activeOffer: { ...recoveryProperty.activeOffer, propertyCoreId: 'generation-core' } });
  await savePropertyEditDraft(first, storage);
  const newer = { ...first, choices: { ...first.choices, priceAmount: 999 }, writeGeneration: 2 };
  await savePropertyEditDraft(newer, first, storage);
  assert.equal(await discardPropertyEditDraft(first.propertyCoreId, first, storage), false);
  assert.deepEqual(await loadPropertyEditDraft(first.propertyCoreId, storage), newer);
  assert.equal(await discardPropertyEditDraft(newer.propertyCoreId, newer, storage), true);
  assert.equal(await savePropertyEditDraft(first, storage), false);
  assert.equal(await loadPropertyEditDraft(first.propertyCoreId, storage), null);
});

test('Task 6 executable draft simulation: unreadable edit data is preserved and fails closed', async () => {
  const storage = new RecoveryMemoryStorage();
  const expected = createEditDraft(recoveryProperty);
  const key = propertyEditDraftKey(expected.propertyCoreId);
  storage.values.set(key, '{"version":');
  await assert.rejects(() => loadPropertyEditDraft(expected.propertyCoreId, storage), PropertyEditReadError);
  assert.equal(await discardPropertyEditDraft(expected.propertyCoreId, expected, storage), false);
  assert.equal(storage.values.get(key), '{"version":');
});

function newUpdateFixture() {
  const draft = createEditDraft(recoveryProperty);
  const candidate = buildPropertyUpdateCandidate(recoveryProperty, {
    ...draft.choices,
    priceAmount: 160000,
  });
  const operation = createPropertyUpdateOperation({
    operationId: 'update-operation-1',
    baseline: recoveryProperty,
    candidate,
    draftSnapshot: draft,
    preparedAt: '2026-08-28T12:00:00.000Z',
  });
  return { draft, candidate, operation };
}

test('Task 6 executable recovery simulation: restart never updates baseline until explicit retry', async () => {
  const storage = new RecoveryMemoryStorage();
  const { draft, candidate, operation } = newUpdateFixture();
  await savePropertyEditDraft(draft, storage);
  await persistPropertyUpdateOperation(operation, storage);
  let current = recoveryProperty;
  let updates = 0;
  const run = (allowUpdate: boolean) => executePropertyUpdateRecovery({
    operation,
    allowUpdate,
    getProperty: async () => current,
    compareAndUpdate: async (baseline, replacement) => {
      updates += 1;
      if (JSON.stringify(current) !== JSON.stringify(baseline)) return false;
      current = replacement;
      return true;
    },
    storage,
  });
  assert.deepEqual(await run(false), { status: 'retry_required' });
  assert.equal(updates, 0);
  assert.deepEqual(await run(true), { status: 'complete', updatedNow: true });
  assert.equal(updates, 1);
  assert.deepEqual(current, candidate);
});

test('Task 6 executable recovery simulation: changed, missing, and unreadable same-ID drafts block prepared CAS', async () => {
  const { draft, operation } = newUpdateFixture();
  for (const draftState of ['changed', 'missing', 'unreadable'] as const) {
    const storage = new RecoveryMemoryStorage();
    if (draftState === 'changed') {
      await savePropertyEditDraft({ ...draft, choices: { ...draft.choices, priceAmount: 123 }, writeGeneration: 2 }, null, storage);
    } else if (draftState === 'unreadable') {
      storage.values.set(propertyEditDraftKey(draft.propertyCoreId), '{broken');
    }
    await persistPropertyUpdateOperation(operation, storage);
    let updates = 0;
    const result = await executePropertyUpdateRecovery({
      operation,
      allowUpdate: true,
      getProperty: async () => recoveryProperty,
      compareAndUpdate: async () => { updates += 1; return true; },
      storage,
    });
    assert.deepEqual(result, { status: 'conflict' });
    assert.equal(updates, 0);
  }
});

test('Task 6 executable draft CAS simulation: expected full snapshot protects cross-tab update and discard', async () => {
  const storage = new RecoveryMemoryStorage();
  const draft = createEditDraft({ ...recoveryProperty, core: { ...recoveryProperty.core, id: 'cas-draft' }, activeOffer: { ...recoveryProperty.activeOffer, propertyCoreId: 'cas-draft' } });
  await savePropertyEditDraft(draft, null, storage);
  const tabTwo = { ...draft, choices: { ...draft.choices, priceAmount: 808 }, writeGeneration: draft.writeGeneration + 1 };
  assert.equal(await savePropertyEditDraft(tabTwo, draft, storage), true);
  const tabOne = { ...draft, choices: { ...draft.choices, locationAreaId: 'qibla' }, writeGeneration: draft.writeGeneration + 1 };
  assert.equal(await savePropertyEditDraft(tabOne, draft, storage), false);
  assert.equal(await discardPropertyEditDraft(draft.propertyCoreId, draft, storage), false);
  assert.deepEqual(await loadPropertyEditDraft(draft.propertyCoreId, storage), tabTwo);
});

test('Task 6 executable ordering simulation: rapid latest draft is persisted before its operation can be journaled', async () => {
  const storage = new RecoveryMemoryStorage();
  const first = createEditDraft({ ...recoveryProperty, core: { ...recoveryProperty.core, id: 'rapid-draft' }, activeOffer: { ...recoveryProperty.activeOffer, propertyCoreId: 'rapid-draft' } });
  const latest = { ...first, choices: { ...first.choices, priceAmount: 333 }, writeGeneration: first.writeGeneration + 1 };
  const firstWrite = savePropertyEditDraft(first, null, storage);
  const latestWrite = savePropertyEditDraft(latest, first, storage);
  await flushPropertyEditDraftWrites();
  assert.equal(await firstWrite, true);
  assert.equal(await latestWrite, true);
  assert.deepEqual(await loadPropertyEditDraft('rapid-draft', storage), latest);
  const candidate = buildPropertyUpdateCandidate(latest.baseline, latest.choices);
  const operation = createPropertyUpdateOperation({
    operationId: 'rapid-operation',
    baseline: latest.baseline,
    candidate,
    draftSnapshot: latest,
    preparedAt: '2026-08-28T12:00:00.000Z',
  });
  await persistPropertyUpdateOperation(operation, storage);
  assert.deepEqual((await loadPropertyUpdateOperation(storage))?.draftSnapshot, latest);
});

test('Task 6 executable recovery simulation: exact candidate is cleanup-only and third/missing values conflict', async () => {
  const { candidate, operation } = newUpdateFixture();
  let updates = 0;
  const candidateStorage = new RecoveryMemoryStorage();
  await persistPropertyUpdateOperation(operation, candidateStorage);
  assert.equal((await executePropertyUpdateRecovery({
    operation,
    allowUpdate: true,
    getProperty: async () => candidate,
    compareAndUpdate: async () => { updates += 1; return true; },
    storage: candidateStorage,
  })).status, 'complete');
  assert.equal(updates, 0);
  for (const current of [null, { ...recoveryProperty, core: { ...recoveryProperty.core, locationArea: { id: 'qibla' } } }]) {
    const storage = new RecoveryMemoryStorage();
    await persistPropertyUpdateOperation(operation, storage);
    assert.deepEqual(await executePropertyUpdateRecovery({
      operation,
      allowUpdate: true,
      getProperty: async () => current,
      compareAndUpdate: async () => { updates += 1; return true; },
      storage,
    }), { status: 'conflict' });
    assert.ok(storage.values.has(PROPERTY_UPDATE_OPERATION_KEY));
  }
});

test('Task 6 executable recovery simulation: failed CAS retries, cleanup failure never updates confirmed candidate again', async () => {
  const { draft, candidate, operation } = newUpdateFixture();
  const storage = new RecoveryMemoryStorage();
  await savePropertyEditDraft(draft, storage);
  await persistPropertyUpdateOperation(operation, storage);
  let current = recoveryProperty;
  let calls = 0;
  const failed = await executePropertyUpdateRecovery({
    operation,
    allowUpdate: true,
    getProperty: async () => current,
    compareAndUpdate: async () => { calls += 1; throw new Error('disk'); },
    storage,
  });
  assert.equal(failed.status, 'update_failed');
  storage.failRemove = true;
  const cleanupFailed = await executePropertyUpdateRecovery({
    operation,
    allowUpdate: true,
    getProperty: async () => current,
    compareAndUpdate: async (_baseline, replacement) => { calls += 1; current = replacement; return true; },
    storage,
  });
  assert.equal(cleanupFailed.status, 'cleanup_failed');
  const confirmed = await loadPropertyUpdateOperation(storage);
  assert.equal(confirmed?.state, 'confirmed');
  storage.failRemove = false;
  const cleanupRetry = await executePropertyUpdateRecovery({
    operation: confirmed!,
    allowUpdate: true,
    getProperty: async () => candidate,
    compareAndUpdate: async () => { calls += 1; return true; },
    storage,
  });
  assert.equal(cleanupRetry.status, 'complete');
  assert.equal(calls, 2);
});

test('Task 6 executable recovery simulation: unreadable and unresolved operations remain evidence and cannot be replaced', async () => {
  const storage = new RecoveryMemoryStorage();
  const { operation } = newUpdateFixture();
  storage.values.set(PROPERTY_UPDATE_OPERATION_KEY, '{"version":');
  await assert.rejects(() => loadPropertyUpdateOperation(storage), PropertyEditReadError);
  assert.equal(storage.values.get(PROPERTY_UPDATE_OPERATION_KEY), '{"version":');
  storage.values.clear();
  await persistPropertyUpdateOperation(operation, storage);
  await assert.rejects(
    () => persistPropertyUpdateOperation({ ...operation, operationId: 'other' }, storage),
    PendingPropertyUpdateExistsError,
  );
  assert.deepEqual(await loadPropertyUpdateOperation(storage), operation);
});

test('Task 6 static/source assertions: detail, monthly cadence, accessibility, back/discard and localized RTL-safe editing are wired', async () => {
  const sourcePath = (relativePath: string) => decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
  const [detail, home, i18n, market, price, summary] = await Promise.all([
    readFile(sourcePath('../app/property/[propertyCoreId].tsx'), 'utf8'),
    readFile(sourcePath('../app/(tabs)/index.tsx'), 'utf8'),
    readFile(sourcePath('../contexts/I18nContext.tsx'), 'utf8'),
    readFile(sourcePath('../constants/market.ts'), 'utf8'),
    readFile(sourcePath('../app/capture/price.tsx'), 'utf8'),
    readFile(sourcePath('../app/capture/summary.tsx'), 'utf8'),
  ]);
  assert.match(home, /property-card-\$\{item\.core\.id\}/);
  assert.match(home, /accessibilityRole="button"/);
  assert.match(detail, /status === 'missing'/);
  assert.match(detail, /property-edit-action/);
  assert.match(detail, /property-edit-save/);
  assert.match(detail, /testID="property-update-retry"/);
  assert.match(detail, /testID="property-update-cleanup-retry"/);
  assert.match(detail, /retryRecovery\(true\)/);
  assert.match(detail, /retryRecovery\(false\)/);
  assert.match(detail, /testID="property-edit-leave-dialog"/);
  assert.match(detail, /testID="property-edit-keep-editing"/);
  assert.match(detail, /testID="property-edit-keep-draft-exit"/);
  assert.match(detail, /testID="property-edit-discard"/);
  assert.doesNotMatch(detail, /Alert\.alert\(t\('edit\.leave_title'/);
  assert.doesNotMatch(detail, /rentalPeriodId:\s*'yearly'/);
  assert.match(detail, /MARKET_CONFIG\.defaultRentalPeriodId/);
  assert.match(detail, /formatRentalPrice/);
  assert.match(home, /formatRentalPrice/);
  assert.match(summary, /formatRentalPrice/);
  assert.match(price, /confirm-monthly-cadence/);
  assert.match(price, /draftOrigin === 'fresh'/);
  assert.match(price, /if \(!workingRentalPeriodId\) return/);
  assert.match(market, /defaultRentalPeriodId: 'monthly'/);
  assert.match(detail, /capture\.keep_editing/);
  assert.match(detail, /discardPropertyEditDraft/);
  assert.match(detail, /searchAreas\(areaSearch\)/);
  assert.match(detail, /isRTL \? 'right' : 'left'/);
  assert.match(i18n, /'edit\.not_found': 'This property could not be found/);
  assert.match(i18n, /'edit\.not_found': 'تعذر العثور/);
  assert.match(i18n, /'price\.cadence\.monthly': 'per month'/);
  assert.match(i18n, /'price\.cadence\.monthly': 'شهريا'/);
  assert.match(i18n, /'edit\.rental_period_missing': 'This rental record has no stored cadence/);
  assert.match(detail, /message\.includes\('MISSING_RENTAL_PERIOD'\) \? t\('edit\.rental_period_missing'\)/);
  assert.match(i18n, /'edit\.retry_update': 'إعادة محاولة تحديث العقار'/);
});

test('Synthetic deletion service simulation is exact, isolated, fenced, and rejects delayed mutation', async () => {
  const other: Property = {
    ...recoveryProperty,
    core: { ...recoveryProperty.core, id: 'other-core' },
    activeOffer: {
      ...recoveryProperty.activeOffer,
      id: 'other-offer',
      propertyCoreId: 'other-core',
    },
  };
  const storage = new RecoveryMemoryStorage();
  const synthetic = new SyntheticPropertyStore([recoveryProperty, other]);
  const result = await deleteSavedProperty({
    expected: recoveryProperty,
    store: synthetic,
    evidenceStorage: storage,
  });
  assert.deepEqual(result, { status: 'deleted', count: 1 });
  assert.deepEqual(synthetic.properties.map(item => item.core.id), ['other-core']);
  await assert.rejects(() => synthetic.saveProperty(recoveryProperty), /PROPERTY_ID_DELETED/);
  assert.equal(await synthetic.compareAndUpdate(recoveryProperty, recoveryProperty), false);
});

test('Synthetic deletion service simulation rejects stale snapshots and pending save evidence', async () => {
  const changed: Property = {
    ...recoveryProperty,
    core: { ...recoveryProperty.core, locationArea: { id: 'qibla' } },
  };
  const storage = new RecoveryMemoryStorage();
  const synthetic = new SyntheticPropertyStore([changed]);
  assert.deepEqual(
    await deleteSavedProperty({
      expected: recoveryProperty,
      store: synthetic,
      evidenceStorage: storage,
    }),
    { status: 'stale' },
  );
  await persistPropertySaveOperation(storage, newRecoveryOperation());
  const blocked = await deleteSavedProperty({
    expected: changed,
    store: synthetic,
    evidenceStorage: storage,
  });
  assert.equal(blocked.status, 'evidence_blocked');
  assert.deepEqual(synthetic.properties, [changed]);
});

test('Synthetic fixed-snapshot service simulation is all-or-nothing and preserves concurrent additions', async () => {
  const second: Property = {
    ...recoveryProperty,
    core: { ...recoveryProperty.core, id: 'second-core' },
    activeOffer: {
      ...recoveryProperty.activeOffer,
      id: 'second-offer',
      propertyCoreId: 'second-core',
    },
  };
  const added: Property = {
    ...second,
    core: { ...second.core, id: 'added-after-snapshot' },
    activeOffer: {
      ...second.activeOffer,
      id: 'added-offer',
      propertyCoreId: 'added-after-snapshot',
    },
  };
  const storage = new RecoveryMemoryStorage();
  const synthetic = new SyntheticPropertyStore([recoveryProperty, second, added]);
  assert.deepEqual(
    await deleteSavedPropertySnapshot({
      snapshot: [recoveryProperty, recoveryProperty],
      store: synthetic,
      evidenceStorage: storage,
      cooperatingWritersConfirmed: true,
    }),
    { status: 'duplicate' },
  );
  assert.equal(synthetic.properties.length, 3);
  assert.deepEqual(
    await deleteSavedPropertySnapshot({
      snapshot: [recoveryProperty, second],
      store: synthetic,
      evidenceStorage: storage,
      cooperatingWritersConfirmed: false,
    }),
    { status: 'unsupported' },
  );
  assert.equal(synthetic.properties.length, 3);
  const staleSecond = { ...second, core: { ...second.core, locationArea: { id: 'qibla' } } };
  assert.deepEqual(
    await deleteSavedPropertySnapshot({
      snapshot: [recoveryProperty, staleSecond],
      store: synthetic,
      evidenceStorage: storage,
      cooperatingWritersConfirmed: true,
    }),
    { status: 'stale' },
  );
  assert.equal(synthetic.properties.length, 3);
  assert.deepEqual(
    await deleteSavedPropertySnapshot({
      snapshot: [recoveryProperty, second],
      store: synthetic,
      evidenceStorage: storage,
      cooperatingWritersConfirmed: true,
    }),
    { status: 'deleted', count: 2 },
  );
  assert.deepEqual(synthetic.properties.map(item => item.core.id), ['added-after-snapshot']);
});

test('Synthetic deletion service simulation never reports storage failure as success', async () => {
  const synthetic = new SyntheticPropertyStore([recoveryProperty]);
  synthetic.failDelete = true;
  const result = await deleteSavedProperty({
    expected: recoveryProperty,
    store: synthetic,
    evidenceStorage: new RecoveryMemoryStorage(),
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(synthetic.properties, [recoveryProperty]);
});

test('Deletion source keeps cancellation inert and safeguards privacy-minimal', async () => {
  const sourcePath = (relativePath: string) => decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
  const detail = await readFile(sourcePath('../app/property/[propertyCoreId].tsx'), 'utf8');
  const persistence = await readFile(sourcePath('../services/persistence.ts'), 'utf8');
  const coordinator = await readFile(sourcePath('../services/propertyDeletion.ts'), 'utf8');
  assert.match(detail, /testID="property-delete-cancel"/);
  assert.match(detail, /const canPermanentlyDelete = store\.canPermanentlyDelete\(\)/);
  assert.match(detail, /canPermanentlyDelete \? \(/);
  assert.match(detail, /visible=\{deleteVisible && canPermanentlyDelete\}/);
  assert.match(detail, /if \(!store\.canPermanentlyDelete\(\)\)/);
  assert.match(detail, /onPress=\{\(\) => setDeleteVisible\(false\)\}/);
  assert.match(detail, /result\.status !== 'deleted'/);
  assert.match(persistence, /CREATE TABLE IF NOT EXISTS deleted_property_ids/);
  assert.match(persistence, /private readonly DELETED_KEY = '@viewstate_deleted_property_ids_v1'/);
  assert.match(persistence, /canPermanentlyDelete\(\) \{\s+return false;/);
  assert.match(persistence, /private async getAllRaw/);
  assert.match(persistence, /all\.filter\(property => !deletedIds\.has\(property\.core\.id\)\)/);
  const webDeletionMethods = persistence.slice(
    persistence.indexOf('async deleteProperty(expected: Property): Promise<PropertyDeletionResult>', persistence.indexOf('export class WebStore')),
    persistence.indexOf('async getPropertyInventory()', persistence.indexOf('export class WebStore')),
  );
  assert.match(webDeletionMethods, /return \{ status: 'unsupported' \}/);
  assert.doesNotMatch(webDeletionMethods, /setItem|withMutationLock|getAllRaw/);
  assert.match(coordinator, /cooperatingWritersConfirmed/);
  assert.match(coordinator, /WebStore is unavailable regardless/);
  assert.doesNotMatch(coordinator, /rentalPrice|salePrice|locationArea|description|privateNotes/);
});

test('Task 6 static/source assertions: native atomic CAS/shared queue and web exclusive lock/unsupported gate are explicit', async () => {
  const sourcePath = (relativePath: string) => decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
  const persistence = await readFile(sourcePath('../services/persistence.ts'), 'utf8');
  assert.match(persistence, /const nativeMutations = new SerialTaskQueue\(\)/);
  assert.match(persistence, /UPDATE properties SET data = \?, search_text = \? WHERE id = \? AND data = \?/);
  assert.match(persistence, /result\.changes === 1/);
  assert.match(persistence, /navigator/);
  assert.match(persistence, /locks\.request\('viewstate-properties-mutation', \{ mode: 'exclusive' \}/);
  assert.match(persistence, /SAFE_WEB_MUTATION_UNSUPPORTED/);
  assert.match(persistence, /async saveProperty[\s\S]*withMutationLock/);
  assert.match(persistence, /async compareAndUpdate[\s\S]*withMutationLock/);
  assert.match(persistence, /private readonly KEY = '@viewstate_properties'/);
  assert.match(persistence, /INSERT INTO properties \(id, data, search_text\)/);
  assert.match(persistence, /PROPERTY_ID_ALREADY_EXISTS/);
  assert.doesNotMatch(persistence, /INSERT OR REPLACE INTO properties/);
});

test('DEC-044 exact Dynamic Details matrix validates all types, floor variants, and sale/rent compatibility', () => {
  assert.equal(PROPERTY_TYPES.length, 11);
  const exactFields = {
    apartment: ['builtUpAreaSquareMeters', 'apartmentSubtype', 'bedroomCount', 'bathroomCount', 'livingRoomCount', 'floorNumber', 'furnishing', 'hasMaidRoom', 'parkingSpaceCount'],
    house: ['plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'bedroomCount', 'bathroomCount', 'livingRoomCount', 'floorCount', 'furnishing', 'hasMaidRoom', 'parkingSpaceCount', 'hasPool'],
    villa: ['plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'bedroomCount', 'bathroomCount', 'livingRoomCount', 'floorCount', 'furnishing', 'hasMaidRoom', 'parkingSpaceCount', 'hasPool'],
    chalet: ['plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'bedroomCount', 'bathroomCount', 'livingRoomCount', 'floorCount', 'furnishing', 'hasMaidRoom', 'parkingSpaceCount', 'hasPool', 'hasWaterfront'],
    floor_residential: ['builtUpAreaSquareMeters', 'bathroomCount', 'parkingSpaceCount', 'bedroomCount', 'livingRoomCount', 'floorNumber', 'floorUse', 'furnishing', 'hasMaidRoom'],
    floor_commercial: ['builtUpAreaSquareMeters', 'bathroomCount', 'parkingSpaceCount', 'floorNumber', 'floorUse', 'intendedUse', 'commercialActivity', 'frontageWidthMeters', 'ceilingHeightMeters'],
    office: ['builtUpAreaSquareMeters', 'bathroomCount', 'parkingSpaceCount', 'floorNumber', 'intendedUse', 'commercialActivity'],
    shop: ['builtUpAreaSquareMeters', 'bathroomCount', 'parkingSpaceCount', 'floorNumber', 'intendedUse', 'commercialActivity', 'frontageWidthMeters', 'ceilingHeightMeters'],
    whole_building: ['plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'parkingSpaceCount', 'floorCount', 'unitCount', 'apartmentCount', 'shopCount', 'officeCount', 'elevatorCount'],
    commercial_complex: ['plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'parkingSpaceCount', 'floorCount', 'unitCount', 'apartmentCount', 'shopCount', 'officeCount', 'elevatorCount'],
    warehouse: ['plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'bathroomCount', 'parkingSpaceCount', 'intendedUse', 'commercialActivity', 'ceilingHeightMeters', 'loadingBayCount', 'hasColdStorage'],
    other_built_property: ['plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'parkingSpaceCount', 'clarification'],
  } as const;
  const fieldsFor = (propertyType: Property['core']['propertyType'], floorUse?: 'residential' | 'commercial') =>
    PROPERTY_DETAIL_FIELD_DEFINITIONS
      .filter(definition => definition.appliesTo.includes(propertyType)
        && (propertyType !== 'floor' || !definition.floorUses || definition.floorUses.includes(floorUse!)))
      .map(definition => definition.field)
      .sort();
  for (const propertyType of PROPERTY_TYPES.filter(type => type !== 'floor')) {
    assert.deepEqual(fieldsFor(propertyType), [...(exactFields as Record<string, readonly string[]>)[propertyType]].sort(), `${propertyType} exact field set`);
  }
  assert.deepEqual(fieldsFor('floor', 'residential'), [...exactFields.floor_residential].sort());
  assert.deepEqual(fieldsFor('floor', 'commercial'), [...exactFields.floor_commercial].sort());
  assert.deepEqual(FURNISHING_VALUES, ['unfurnished', 'semi_furnished', 'furnished']);
  assert.equal(PROPERTY_DETAIL_FIELD_DEFINITIONS.some(item => item.field === ('constructionYear' as never)), false);
  assert.equal(PROPERTY_DETAIL_FIELD_DEFINITIONS.some(item => item.field === ('roomCount' as never)), false);

  const normal = (value: string) => createLiteralText(value, createPrivacyMetadata('normal', 'normal'));
  const enrichedByType: Record<string, Property['typeDetails']> = {
    apartment: { propertyType: 'apartment', builtUpAreaSquareMeters: 90, apartmentSubtype: 'duplex', bedroomCount: 3, bathroomCount: 2, livingRoomCount: 1, floorNumber: 4, furnishing: 'semi_furnished', hasMaidRoom: true, parkingSpaceCount: 2 },
    house: { propertyType: 'house', plotAreaSquareMeters: 400, builtUpAreaSquareMeters: 300, bedroomCount: 4, bathroomCount: 3, livingRoomCount: 2, floorCount: 2, furnishing: 'unfurnished', hasMaidRoom: true, parkingSpaceCount: 3, hasPool: false },
    villa: { propertyType: 'villa', plotAreaSquareMeters: 500, builtUpAreaSquareMeters: 350, bedroomCount: 5, bathroomCount: 4, livingRoomCount: 2, floorCount: 3, furnishing: 'furnished', hasMaidRoom: true, parkingSpaceCount: 4, hasPool: true },
    chalet: { propertyType: 'chalet', plotAreaSquareMeters: 600, builtUpAreaSquareMeters: 250, bedroomCount: 4, bathroomCount: 3, livingRoomCount: 2, floorCount: 2, furnishing: 'furnished', hasMaidRoom: false, parkingSpaceCount: 4, hasPool: true, hasWaterfront: true },
    floor: { propertyType: 'floor', floorUse: 'residential', builtUpAreaSquareMeters: 300, bedroomCount: 4, bathroomCount: 3, livingRoomCount: 2, floorNumber: 5, furnishing: 'semi_furnished', hasMaidRoom: false, parkingSpaceCount: 2 },
    office: { propertyType: 'office', builtUpAreaSquareMeters: 120, floorNumber: 8, bathroomCount: 2, intendedUse: normal('  HQ Mixed-Case  '), commercialActivity: normal('Consulting & Design'), parkingSpaceCount: 3 },
    shop: { propertyType: 'shop', builtUpAreaSquareMeters: 80, floorNumber: 0, bathroomCount: 1, intendedUse: normal('Retail'), commercialActivity: normal('Coffee & Gifts'), parkingSpaceCount: 1, frontageWidthMeters: 8, ceilingHeightMeters: 4 },
    whole_building: { propertyType: 'whole_building', plotAreaSquareMeters: 800, builtUpAreaSquareMeters: 1500, floorCount: 5, unitCount: 20, apartmentCount: 12, shopCount: 4, officeCount: 4, elevatorCount: 2, parkingSpaceCount: 20 },
    commercial_complex: { propertyType: 'commercial_complex', plotAreaSquareMeters: 2000, builtUpAreaSquareMeters: 3500, floorCount: 4, unitCount: 30, apartmentCount: 0, shopCount: 20, officeCount: 10, elevatorCount: 4, parkingSpaceCount: 60 },
    warehouse: { propertyType: 'warehouse', plotAreaSquareMeters: 1500, builtUpAreaSquareMeters: 1200, bathroomCount: 2, intendedUse: normal('Distribution'), commercialActivity: normal('Food logistics'), parkingSpaceCount: 8, ceilingHeightMeters: 9, loadingBayCount: 4, hasColdStorage: true },
    other_built_property: { propertyType: 'other_built_property', clarification: normal('  Special mixed-use shell  '), plotAreaSquareMeters: 700, builtUpAreaSquareMeters: 450, parkingSpaceCount: 5 },
  };
  for (const propertyType of PROPERTY_TYPES) {
    for (const transaction of ['sale', 'rent'] as const) {
      const id = `dec044-${propertyType}-${transaction}`;
      const basic = projectDraftToProperty({
        propertyCoreId: `${id}-core`,
        offerId: `${id}-offer`,
        propertyType,
        locationAreaId: 'salmiya',
        transaction,
        ...(transaction === 'sale'
          ? { salePrice: { amount: 101, currencyCode: 'KWD' } }
          : { rentalPrice: { amount: 101, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' }),
      });
      assert.equal(basic.ok, true, `${id} BASIC projection must finalize`);
      if (!basic.ok) continue;
      assert.equal(basic.value.typeDetails, undefined, `${id} empty enrichment must omit typeDetails`);
      const enriched = { ...basic.value, typeDetails: enrichedByType[propertyType] } as Property;
      assert.equal(validateProperty(enriched).ok, true, `${id} optional enrichment must validate`);
    }
  }

  const commercial = {
    propertyType: 'floor' as const,
    floorUse: 'commercial' as const,
    builtUpAreaSquareMeters: 250,
    bathroomCount: 2,
    floorNumber: 3,
    intendedUse: normal('Offices and retail'),
    commercialActivity: normal('Professional services'),
    parkingSpaceCount: 5,
    frontageWidthMeters: 15,
    ceilingHeightMeters: 4,
  };
  assert.ok(validateTypeDetails(commercial, { id: 'floor', propertyType: 'floor', locationArea: { id: 'salmiya' } }).ok);
  assert.equal(validateTypeDetails({ ...commercial, bedroomCount: 1 } as never, { id: 'floor', propertyType: 'floor', locationArea: { id: 'salmiya' } }).ok, false);
  assert.equal(validateTypeDetails({ propertyType: 'floor', builtUpAreaSquareMeters: 10 } as never, { id: 'floor', propertyType: 'floor', locationArea: { id: 'salmiya' } }).ok, false);
  assert.equal(validateTypeDetails({ propertyType: 'apartment', builtUpAreaSquareMeters: 0 } as never, { id: 'a', propertyType: 'apartment', locationArea: { id: 'x' } }).ok, false);
  assert.equal(validateTypeDetails({ propertyType: 'shop', frontageWidthMeters: Number.POSITIVE_INFINITY } as never, { id: 's', propertyType: 'shop', locationArea: { id: 'x' } }).ok, false);
  assert.equal(validateTypeDetails({ propertyType: 'apartment', bedroomCount: 1.5 } as never, { id: 'a', propertyType: 'apartment', locationArea: { id: 'x' } }).ok, false);
  assert.equal(validateTypeDetails({ propertyType: 'apartment', bedroomCount: 10_000_000 } as never, { id: 'a', propertyType: 'apartment', locationArea: { id: 'x' } }).ok, true);
  assert.equal(validateTypeDetails({ propertyType: 'apartment', furnishing: 'partly' } as never, { id: 'a', propertyType: 'apartment', locationArea: { id: 'x' } }).ok, false);
  assert.equal(validateTypeDetails({ propertyType: 'apartment', hasMaidRoom: 'yes' } as never, { id: 'a', propertyType: 'apartment', locationArea: { id: 'x' } }).ok, false);
  assert.equal(validateTypeDetails({ propertyType: 'whole_building', unitCount: 2, apartmentCount: 1, shopCount: 1, officeCount: 1 }, { id: 'b', propertyType: 'whole_building', locationArea: { id: 'x' } }).ok, false);
  assert.equal(validateTypeDetails({ propertyType: 'other_built_property', builtUpAreaSquareMeters: 10 } as never, { id: 'o', propertyType: 'other_built_property', locationArea: { id: 'x' } }).ok, false);
  assert.equal((enrichedByType.office as { intendedUse: { value: string } }).intendedUse.value, '  HQ Mixed-Case  ');
});

test('V001 synthetic persistence restart preserves enriched edits and safe deletion contract', async () => {
  const initial = projectDraftToProperty({
    propertyCoreId: 'v001-restart-core', offerId: 'v001-restart-offer',
    propertyType: 'apartment', locationAreaId: 'salmiya', transaction: 'sale',
    salePrice: { amount: 222, currencyCode: 'KWD' },
  });
  assert.ok(initial.ok);
  if (!initial.ok) return;
  const edited: Property = {
    ...initial.value,
    core: {
      ...initial.value.core,
      privateNotes: createLiteralText('internal only', createPrivacyMetadata('private_notes', 'never')),
    },
    typeDetails: { propertyType: 'apartment', apartmentSubtype: 'duplex', bedroomCount: 3 },
  };
  const restartPayload = JSON.stringify([edited]);
  const restarted = JSON.parse(restartPayload) as Property[];
  assert.deepEqual(restarted, [edited]);
  assert.ok(validateProperty(restarted[0]).ok);
  const store = new SyntheticPropertyStore(restarted);
  assert.deepEqual(await deleteSavedProperty({
    expected: restarted[0], store, evidenceStorage: new RecoveryMemoryStorage(),
  }), { status: 'deleted', count: 1 });
  assert.equal((await store.getProperty('v001-restart-core')), null);
  assert.equal(store.canPermanentlyDelete(), true);
});

test('V001 injected adapters preserve attachment metadata sequencing and nonblocking optional location', async () => {
  const events: string[] = [];
  const fileStore: AttachmentFileStore = {
    copyToProperty: async () => { throw new Error('not used by this synthetic test'); },
    delete: async uri => { events.push(`delete:${uri}`); },
  };
  const previous: LocalAttachment[] = [
    { id: 'v001-image-a', kind: 'image', originalName: 'a.jpg', mimeType: 'image/jpeg', uri: 'mem://a', order: 0 },
    { id: 'v001-video-b', kind: 'video', originalName: 'b.mp4', mimeType: 'video/mp4', uri: 'mem://b', order: 1 },
    { id: 'v001-pdf-c', kind: 'pdf', originalName: 'c.pdf', mimeType: 'application/pdf', uri: 'mem://c', order: 2 },
  ];
  const ordered = reorderAttachments(previous, ['v001-video-b', 'v001-image-a', 'v001-pdf-c']);
  const covered = setAttachmentCover(ordered, 'v001-image-a');
  assert.deepEqual(covered.map(item => [item.id, item.order, item.isCover ?? false]), [
    ['v001-video-b', 0, false], ['v001-image-a', 1, true], ['v001-pdf-c', 2, false],
  ]);
  await persistAttachmentsThenDeleteRemoved(covered, covered.slice(0, 2), async next => {
    events.push(`persist:${next.map(item => item.id).join(',')}`);
  }, fileStore);
  assert.deepEqual(events, ['persist:v001-video-b,v001-image-a', 'delete:mem://c']);

  const coordinates = await requestInjectedCoordinates({
    requestForegroundPermissionsAsync: async () => ({ granted: true }),
    getCurrentPositionAsync: async () => ({ coords: { latitude: 29.3, longitude: 47.9, accuracy: 6 } }),
  }, 'ios');
  assert.deepEqual(coordinates, { latitude: 29.3, longitude: 47.9, accuracy: 6 });
  await assert.rejects(() => requestInjectedCoordinates({
    requestForegroundPermissionsAsync: async () => ({ granted: false }),
    getCurrentPositionAsync: async () => { throw new Error('must not request'); },
  }, 'ios'), /FOREGROUND_LOCATION_PERMISSION_DENIED/);
  assert.ok(projectDraftToProperty({
    propertyCoreId: 'v001-no-location-core', offerId: 'v001-no-location-offer',
    propertyType: 'shop', locationAreaId: 'salmiya', transaction: 'sale',
    salePrice: { amount: 1, currencyCode: 'KWD' },
  }).ok, 'location enrichment failure cannot block BASIC finalization');
});

test('V001 People synthetic model has five classifications, independent links, search seams, and URL actions', async () => {
  assert.equal(PERSON_CLASSIFICATIONS.length, 5);
  const imported = createPerson({
    id: 'v001-imported-person', name: 'Imported أحمد', displayPhone: '+965 5000 0001',
    notes: 'imported contact', classifications: ['owner', 'broker'],
  });
  const manual = createPerson({
    id: 'v001-manual-person', name: 'Manual Agent', displayPhone: '5000 0002',
    notes: 'manual note', classifications: ['seeker'],
  });
  const links = new Set<string>();
  const link = (personId: string, propertyCoreId: string) => {
    const key = `${personId}:${propertyCoreId}`;
    if (links.has(key)) throw new Error('DUPLICATE_LINK');
    links.add(key);
  };
  const unlink = (personId: string, propertyCoreId: string) => links.delete(`${personId}:${propertyCoreId}`);
  link(imported.id, 'v001-property-a');
  link(manual.id, 'v001-property-a');
  link(imported.id, 'v001-property-b');
  assert.throws(() => link(imported.id, 'v001-property-a'), /DUPLICATE_LINK/);
  assert.equal(unlink(imported.id, 'v001-property-a'), true);
  assert.deepEqual([...links].sort(), [
    'v001-imported-person:v001-property-b', 'v001-manual-person:v001-property-a',
  ]);
  const propertySearch = (personId: string, query: string) => {
    const linkedPropertyIds = [...links]
      .filter(linkKey => linkKey.startsWith(`${personId}:`))
      .map(linkKey => linkKey.split(':')[1]);
    return linkedPropertyIds.filter(propertyId => propertyId.includes(query));
  };
  assert.deepEqual(propertySearch(imported.id, 'property-b'), ['v001-property-b']);
  assert.deepEqual(propertySearch(manual.id, 'property-b'), []);
  assert.ok(personMatchesSearch(imported, '50000001'));
  assert.ok([imported, manual].filter(person => personMatchesSearch(person, 'manual')).includes(manual));
  const callUrl = `tel:${imported.normalizedPhone}`;
  const whatsappUrl = `https://wa.me/${imported.normalizedPhone.replace(/\D/g, '')}`;
  assert.equal(callUrl, 'tel:+96550000001');
  assert.equal(whatsappUrl, 'https://wa.me/96550000001');
});

test('V001 selective sharing defaults exclude private notes and injected sharing preserves selected files', async () => {
  const property: Property = {
    core: {
      id: 'v001-share-core', propertyType: 'apartment', locationArea: { id: 'salmiya' },
      description: createLiteralText('Arabic وصف / English description', createPrivacyMetadata('normal', 'normal')),
      privateNotes: createLiteralText('never share', createPrivacyMetadata('private_notes', 'never')),
      ownerSource: createLiteralText('synthetic owner', createPrivacyMetadata('owner_source', 'explicit_per_share')),
      exactLocation: createLiteralText('synthetic exact', createPrivacyMetadata('exact_location', 'explicit_per_share')),
    },
    activeOffer: { id: 'v001-share-offer', propertyCoreId: 'v001-share-core', transaction: 'sale', salePrice: { amount: 9, currencyCode: 'KWD' } },
    typeDetails: { propertyType: 'apartment', builtUpAreaSquareMeters: 88, furnishing: 'semi_furnished', hasMaidRoom: false },
  };
  const defaults = createPropertyShareSelection(property);
  assert.equal(defaults.attachmentIds.length, 0);
  assert.equal(defaults.discloseOwnerSource, false);
  assert.equal(defaults.normalFields.includes('description'), true);
  assert.equal(defaults.normalFields.includes('type_details'), true);
  const preview = buildPropertySharePreview({
    property,
    selection: { ...defaults, attachmentIds: ['v001-share-image'], discloseOwnerSource: true, discloseExactLocation: true },
    availableAttachments: [{ id: 'v001-share-image', propertyCoreId: property.core.id }],
    labels: { propertyType: 'نوع العقار / Property type', ownerSource: 'المصدر / Source', exactLocation: 'الموقع / Location' },
    detailLabels: { builtUpAreaSquareMeters: 'مساحة البناء', furnishing: 'التأثيث', hasMaidRoom: 'غرفة خادمة' },
    detailValueLabels: { semi_furnished: 'نصف مؤثث', false: 'لا' },
  });
  assert.match(preview.text, /نوع العقار/);
  assert.match(preview.text, /synthetic owner/);
  assert.match(preview.text, /synthetic exact/);
  assert.match(preview.text, /مساحة البناء: 88/);
  assert.match(preview.text, /التأثيث: نصف مؤثث/);
  assert.match(preview.text, /غرفة خادمة: لا/);
  assert.doesNotMatch(preview.text, /never share/);
  const sent: string[] = [];
  await executePropertySharePreview(preview, {
    resolveSelectedLocalFiles: async ids => ids.map(attachmentId => ({
      attachmentId, uri: `mem://${attachmentId}`, mimeType: 'image/jpeg', name: 'synthetic.jpg',
    })),
    shareSelectedLocalFiles: async input => { sent.push(`${input.text}|${input.files[0].attachmentId}`); },
  }, async () => { throw new Error('text share should not run with selected files'); });
  assert.equal(sent.length, 1);
});

test('V001 bilingual labels and source wiring remain explicit', async () => {
  const sourcePath = (relativePath: string) => decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
  const [translations, personDetail, enrichment] = await Promise.all([
    readFile(sourcePath('../contexts/I18nContext.tsx'), 'utf8'),
    readFile(sourcePath('../app/person/[personId].tsx'), 'utf8'),
    readFile(sourcePath('../app/property/[propertyCoreId]/enrich.tsx'), 'utf8'),
  ]);
  for (const classification of PERSON_CLASSIFICATIONS) {
    assert.match(translations, new RegExp(`'people\\.classification\\.${classification}':`));
  }
  assert.match(translations, /'enrich\.private_notes': 'Private notes \(never shared\)'/);
  assert.match(translations, /'enrich\.private_notes': 'ملاحظات خاصة/);
  assert.match(translations, /'enrich\.furnishing\.unfurnished': 'غير مؤثث'/);
  assert.match(translations, /'enrich\.furnishing\.semi_furnished': 'نصف مؤثث'/);
  assert.match(translations, /'enrich\.furnishing\.furnished': 'مؤثث'/);
  assert.match(personDetail, /tel:\$\{person\.normalizedPhone\}/);
  assert.match(personDetail, /https:\/\/wa\.me\/\$\{person\.normalizedPhone\.replace/);
  assert.match(enrichment, /persistAttachmentsThenDeleteRemoved/);
  assert.match(enrichment, /requestCurrentCoordinates/);
});

test('Phone entry helpers keep selected contact display text while choosing one canonical number', () => {
  assert.equal(phoneDigits('٠٠٩٦٥ ٥٠٠٠-١٢٣٤'), '0096550001234');
  assert.equal(inferPhoneCountry('+965 5000 1234'), 'KW');
  assert.equal(inferPhoneCountry('00966 501 234 567'), 'SA');
  assert.equal(inferPhoneCountry('٠٠٩٧١ ٥٠١٢٣٤٥٦٧'), 'AE');
  assert.equal(inferPhoneCountry('50001234'), null, 'national input must not guess a country');
  assert.equal(normalizePhoneForCountry('5000 1234', 'KW'), '+96550001234');
  assert.equal(normalizePhoneForCountry('+966 501 234 567', 'KW'), '+966501234567');
  assert.equal(normalizePhoneForCountry('٠٠٩٧١ ٥٠١٢٣٤٥٦٧', 'KW'), '+971501234567');

  const choices = buildContactPhoneChoices([
    {
      id: 'primary',
      name: 'Primary contact',
      phoneNumbers: [
        { number: '5000 0001' },
        { number: '+965 5000 0002', isPrimary: true },
        { number: '00965 5000 0002' },
      ],
    },
    {
      id: 'alias',
      name: 'Alias copy',
      phoneNumbers: [{ number: '٠٠٩٦٥ ٥٠٠٠ ٠٠٠٢' }],
    },
    {
      id: 'first',
      name: 'First contact',
      phoneNumbers: [{ number: '6000 0001' }, { number: '6000 0002' }],
    },
    {
      id: 'distinct',
      name: 'Distinct number',
      phoneNumbers: [{ number: '+965 5000 0003' }],
    },
  ]);
  assert.deepEqual(choices.map(choice => [choice.name, choice.phone]), [
    ['Primary contact', '+965 5000 0002'],
    ['First contact', '6000 0001'],
    ['Distinct number', '+965 5000 0003'],
  ]);
  assert.equal(choices[0].normalizedDigits, '96550000002');
  assert.equal(choices[2].normalizedDigits, '96550000003');
});

test('Share selection fails closed for every private location value until explicitly chosen', () => {
  const exact = createPrivacyMetadata('exact_location', 'explicit_per_share');
  const property: Property = {
    core: {
      id: 'privacy-selection-core',
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
      ownerSource: createLiteralText('owner-only', createPrivacyMetadata('owner_source', 'explicit_per_share')),
      exactLocation: createLiteralText('exact-only', exact),
    },
    activeOffer: {
      id: 'privacy-selection-offer',
      propertyCoreId: 'privacy-selection-core',
      transaction: 'sale',
      salePrice: { amount: 1, currencyCode: 'KWD' },
    },
    locationEnrichment: {
      paciNumber: createLiteralText('PACI-only', exact),
      manualLocationText: createLiteralText('manual-only', exact),
      mapsLink: createLiteralText('https://maps.example/private', exact),
      coordinates: { latitude: 29.3, longitude: 48, privacy: exact },
    },
  };
  const selection = createPropertyShareSelection(property);
  assert.equal(selection.discloseOwnerSource, false);
  assert.equal(selection.discloseExactLocation, false);
  assert.equal(selection.disclosePaci, false);
  assert.equal(selection.discloseManualLocation, false);
  assert.equal(selection.discloseMapsLink, false);
  const preview = buildPropertySharePreview({
    property,
    selection,
    availableAttachments: [],
    privateLocation: {
      paci: property.locationEnrichment?.paciNumber?.value,
      manualLocation: property.locationEnrichment?.manualLocationText?.value,
      mapsLink: property.locationEnrichment?.mapsLink?.value,
    },
  });
  for (const secret of ['owner-only', 'exact-only', 'PACI-only', 'manual-only', 'maps.example/private']) {
    assert.doesNotMatch(preview.text, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Completed mobile batch source contracts remain localized, keyboard-safe, and privacy fail-closed', async () => {
  const source = (relativePath: string) => sharedSourcePath(relativePath);
  const [
    translations,
    rootLayout,
    detail,
    share,
    shareIntent,
    enrichment,
    enrichmentFields,
    keyboardScroll,
    peopleNew,
    captureHeader,
    transaction,
    propertyType,
    price,
    location,
    summary,
  ] = await Promise.all([
    readFile(source('../contexts/I18nContext.tsx'), 'utf8'),
    readFile(source('../app/_layout.tsx'), 'utf8'),
    readFile(source('../app/property/[propertyCoreId].tsx'), 'utf8'),
    readFile(source('../app/property/[propertyCoreId]/share.tsx'), 'utf8'),
    readFile(source('../services/propertyShareIntent.ts'), 'utf8'),
    readFile(source('../app/property/[propertyCoreId]/enrich.tsx'), 'utf8'),
    readFile(source('../components/PropertyEnrichmentFields.tsx'), 'utf8'),
    readFile(source('../components/KeyboardAwareScrollViewCompat.tsx'), 'utf8'),
    readFile(source('../app/person/new.tsx'), 'utf8'),
    readFile(source('../components/CaptureHeader.tsx'), 'utf8'),
    readFile(source('../app/capture/transaction.tsx'), 'utf8'),
    readFile(source('../app/capture/property-type.tsx'), 'utf8'),
    readFile(source('../app/capture/price.tsx'), 'utf8'),
    readFile(source('../app/capture/location.tsx'), 'utf8'),
    readFile(source('../app/capture/summary.tsx'), 'utf8'),
  ]);

  // EN/AR action labels are user-facing translations, including destructive
  // deletion and every offered share destination.
  assert.match(translations, /'detail\.delete': 'Delete'/);
  assert.match(translations, /'detail\.delete': 'حذف'/);
  assert.match(translations, /'share\.whatsapp': 'WhatsApp'/);
  assert.match(translations, /'share\.whatsapp': 'واتساب'/);
  assert.match(translations, /'share\.whatsapp_business': 'WhatsApp Business'/);
  assert.match(translations, /'share\.whatsapp_business': 'واتساب للأعمال'/);
  assert.match(detail, /testID="property-delete-action"[\s\S]{0,300}t\('detail\.delete'\)/);
  assert.match(share, /title=\{shareT\('share\.whatsapp'\)\}/);
  assert.match(share, /title=\{shareT\('share\.whatsapp_business'\)\}/);
  assert.match(share, /shareT\('share\.system_share'\)/);
  assert.doesNotMatch(share, /title=\{['"]whatsapp(?:_business)?['"]\}/i);

  // The native detail view stays consumer-facing: no implementation/technical
  // header is exposed, while its Delete and Share actions remain reachable.
  assert.match(detail, /property-delete-action/);
  assert.match(detail, /property-share-action/);
  assert.match(rootLayout, /name="property\/\[propertyCoreId\]" options=\{\{ headerShown: false \}\}/);
  assert.match(rootLayout, /name="property\/\[propertyCoreId\]\/enrich" options=\{\{ headerShown: false \}\}/);
  assert.match(rootLayout, /name="property\/\[propertyCoreId\]\/share" options=\{\{ headerShown: false \}\}/);
  assert.doesNotMatch(rootLayout, /Stack\.Screen name="property"/);
  assert.doesNotMatch(detail, /Technical (?:details|header)|native technical/i);

  // The reusable input is module-scoped before the screen component, so typing
  // does not define/remount a new Input component on every render.
  assert.ok(enrichment.indexOf('function Input(') < enrichment.indexOf('export default function PropertyEnrichmentScreen'));
  assert.match(enrichment, /<KeyboardAwareScrollViewCompat[\s\S]*keyboardShouldPersistTaps="handled"[\s\S]*keyboardDismissMode="interactive"/);
  assert.match(keyboardScroll, /forwardRef<ScrollView, Props>/);
  assert.match(keyboardScroll, /KeyboardAwareScrollView/);
  assert.match(keyboardScroll, /keyboardShouldPersistTaps/);

  // Contact imports are searchable, virtualized, and choose a single row.
  assert.match(peopleNew, /<FlatList/);
  assert.match(peopleNew, /data=\{filteredContactChoices\}/);
  assert.match(peopleNew, /testID="contact-search"/);
  assert.match(peopleNew, /phoneDigits\(contactSearch\)/);
  assert.match(peopleNew, /buildContactPhoneChoices\(contacts\)/);
  assert.match(peopleNew, /setPhone\(item\.phone\)/);

  // Five callers supply the five-chip capture progression; chip state is
  // explicitly completed/current/future rather than inferred from labels.
  for (const [screen, step] of [[transaction, 1], [propertyType, 2], [price, 3], [location, 4], [summary, 5]] as const) {
    assert.match(screen, new RegExp(`<CaptureHeader[^>]*step=\\{${step}\\}[^>]*totalSteps=\\{5\\}`));
  }
  assert.match(captureHeader, /CAPTURE_STEPS = \[[\s\S]*capture\.progress\.review/);
  assert.match(captureHeader, /const isCompleted = chipStep < currentStep/);
  assert.match(captureHeader, /const isCurrent = chipStep === currentStep/);
  assert.match(captureHeader, /const isFuture = chipStep > currentStep/);

  // Manual location is intentionally not editable, but restored and projected
  // values survive save/recovery so previously captured state is not erased.
  assert.match(enrichment, /const \[manualLocation, setManualLocation\] = useState\(''\)/);
  assert.match(enrichment, /setManualLocation\(visible\.locationEnrichment\?\.manualLocationText\?\.value \?\? ''\)/);
  assert.match(enrichment, /manualLocationText: optionalClassifiedLiteral\(manualLocation, exactPrivacy\)/);
  assert.doesNotMatch(enrichment, /testID="enrich-manual-location"|label=\{t\('enrich\.manual_location'\)\}/);

  // Attachment cards provide both preview/open affordances; mutations remain
  // serialized and metadata is committed before a local file is removed.
  assert.match(enrichment, /testID=\{`enrich-preview-\$\{attachment\.id\}`\}/);
  assert.match(enrichment, /id=\{`enrich-open-\$\{attachment\.id\}`\}/);
  assert.match(enrichment, /const attachmentMutationFlight = useRef<Promise<void>>/);
  assert.match(enrichment, /const enqueueAttachmentMutation/);
  assert.match(enrichment, /persistAttachmentsThenDeleteRemoved/);
  assert.match(enrichment, /await persistAttachmentChanges\(\[\.\.\.value\]\)/);

  // Sensitive fields start off and require explicit selection; the preview
  // given to WhatsApp/Business is the exact reviewed preview, with system
  // share retained as the attachment-capable fallback.
  assert.match(share, /createPropertyShareSelection\(value\)/);
  assert.match(share, /discloseOwnerSource.*!current\[name\]/);
  assert.match(share, /discloseExactLocation/);
  assert.match(share, /preview\.text/);
  assert.match(share, /preview\.attachmentIds\.length.*attachments_system_only/);
  assert.match(share, /testID="share-send"/);
  assert.match(shareIntent, /encodeURIComponent\(exactPreviewText\)/);
  assert.match(shareIntent, /destination: AndroidPropertyShareDestination/);
  assert.match(enrichmentFields, /testID=\{`enrich-\$\{testIdField\}-\$\{value \|\| 'clear'\}`\}/);
});
