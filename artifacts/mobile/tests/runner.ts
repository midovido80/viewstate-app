import test from 'node:test';
import assert from 'node:assert/strict';

import { projectDraftToProperty, PropertyDraft, Property } from '@workspace/property-domain';
import appConfig from '../app.json';
import { SerialTaskQueue } from '../services/serialTaskQueue.ts';
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
