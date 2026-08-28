import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { projectDraftToProperty, PropertyDraft, Property } from '@workspace/property-domain';
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
  normalizeDraftCurrency,
  normalizePropertyCurrency,
} from '../constants/market.ts';
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
    rentalPrice: { amount: 1500, currencyCode: MARKET_CONFIG.currencyCode },
    rentalPeriodId: 'yearly',
    locationAreaId: 'approved-area-id'
  };

  const result = projectDraftToProperty(draft);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.activeOffer.transaction, 'rent');
    assert.equal(result.value.activeOffer.rentalPrice?.currencyCode, 'KWD');
  }
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

test('Task 6 executable validation simulation: Sale to Rent is out of four-field scope even with caller-injected period', () => {
  const sale = recoveryProperty;
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

test('Task 6 static/source assertions: detail, missing handling, accessibility, back/discard and localized RTL-safe editing are wired', async () => {
  const sourcePath = (relativePath: string) => decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
  const [detail, home, i18n] = await Promise.all([
    readFile(sourcePath('../app/property/[propertyCoreId].tsx'), 'utf8'),
    readFile(sourcePath('../app/(tabs)/index.tsx'), 'utf8'),
    readFile(sourcePath('../contexts/I18nContext.tsx'), 'utf8'),
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
  assert.doesNotMatch(detail, /'yearly'/);
  assert.match(detail, /edit\.transaction_scope/);
  assert.match(detail, /capture\.keep_editing/);
  assert.match(detail, /discardPropertyEditDraft/);
  assert.match(detail, /searchAreas\(areaSearch\)/);
  assert.match(detail, /isRTL \? 'right' : 'left'/);
  assert.match(i18n, /'edit\.not_found': 'This property could not be found/);
  assert.match(i18n, /'edit\.not_found': 'تعذر العثور/);
  assert.match(i18n, /'edit\.transaction_scope': 'Changing a Sale to Rent/);
  assert.match(i18n, /'edit\.retry_update': 'إعادة محاولة تحديث العقار'/);
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
