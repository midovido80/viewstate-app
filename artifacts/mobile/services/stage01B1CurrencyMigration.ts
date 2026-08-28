import type { Property, PropertyDraft } from '@workspace/property-domain';
import {
  normalizeDraftCurrency,
  normalizePropertyCurrency,
} from '@/constants/market';

export const STAGE_01B1_PROPERTY_MIGRATION_ID =
  'stage-01b1-pre-release-sar-to-kwd-v1';
export const STAGE_01B1_WEB_MIGRATION_KEY =
  '@viewstate_migration_stage01b1_sar_to_kwd_v1';
export const STAGE_01B1_DRAFT_MIGRATION_KEY =
  '@viewstate_migration_stage01b1_draft_sar_to_kwd_v1';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function normalizeEligibleProperty(
  latest: Property,
  legacy: Property,
): Property {
  if (latest.activeOffer.transaction !== legacy.activeOffer.transaction) {
    return latest;
  }

  const latestPrice = latest.activeOffer.transaction === 'sale'
    ? latest.activeOffer.salePrice
    : latest.activeOffer.rentalPrice;
  const legacyPrice = legacy.activeOffer.transaction === 'sale'
    ? legacy.activeOffer.salePrice
    : legacy.activeOffer.rentalPrice;
  if (
    legacyPrice.currencyCode !== 'SAR' ||
    latestPrice.currencyCode !== 'SAR' ||
    latestPrice.amount !== legacyPrice.amount
  ) {
    return latest;
  }

  return normalizePropertyCurrency(latest).property;
}

function normalizeEligibleDraft(
  latest: PropertyDraft,
  legacy: PropertyDraft,
): PropertyDraft {
  const shouldNormalizeSale =
    legacy.salePrice?.currencyCode === 'SAR' &&
    latest.salePrice?.currencyCode === 'SAR' &&
    latest.salePrice.amount === legacy.salePrice.amount;
  const shouldNormalizeRent =
    legacy.rentalPrice?.currencyCode === 'SAR' &&
    latest.rentalPrice?.currencyCode === 'SAR' &&
    latest.rentalPrice.amount === legacy.rentalPrice.amount;

  if (!shouldNormalizeSale && !shouldNormalizeRent) return latest;
  return {
    ...latest,
    salePrice: shouldNormalizeSale
      ? { ...latest.salePrice!, currencyCode: 'KWD' }
      : latest.salePrice,
    rentalPrice: shouldNormalizeRent
      ? { ...latest.rentalPrice!, currencyCode: 'KWD' }
      : latest.rentalPrice,
  };
}

const propertyMigrations = new WeakMap<
  KeyValueStorage,
  Map<string, Promise<boolean>>
>();
const draftMigrations = new WeakMap<
  KeyValueStorage,
  Map<string, Promise<boolean>>
>();

function singleFlight(
  registry: WeakMap<KeyValueStorage, Map<string, Promise<boolean>>>,
  storage: KeyValueStorage,
  key: string,
  operation: () => Promise<boolean>,
): Promise<boolean> {
  let operations = registry.get(storage);
  if (!operations) {
    operations = new Map();
    registry.set(storage, operations);
  }
  const existing = operations.get(key);
  if (existing) return existing;

  const promise = operation().finally(() => {
    operations?.delete(key);
  });
  operations.set(key, promise);
  return promise;
}

export function migrateStage01B1WebProperties(
  storage: KeyValueStorage,
  propertiesKey: string,
): Promise<boolean> {
  return singleFlight(
    propertyMigrations,
    storage,
    propertiesKey,
    () => runStage01B1WebPropertiesMigration(storage, propertiesKey),
  );
}

async function runStage01B1WebPropertiesMigration(
  storage: KeyValueStorage,
  propertiesKey: string,
): Promise<boolean> {
  if (await storage.getItem(STAGE_01B1_WEB_MIGRATION_KEY)) return false;

  const raw = await storage.getItem(propertiesKey);
  let changed = false;
  if (raw) {
    const properties = JSON.parse(raw) as Property[];
    const eligibleById = new Map<string, Property>();
    properties.forEach(property => {
      const result = normalizePropertyCurrency(property);
      changed ||= result.changed;
      if (result.changed) eligibleById.set(property.core.id, property);
    });
    if (changed) {
      const latestRaw = await storage.getItem(propertiesKey);
      const latest = latestRaw ? JSON.parse(latestRaw) as Property[] : [];
      const merged = latest.map(property => {
        const legacy = eligibleById.get(property.core.id);
        return legacy ? normalizeEligibleProperty(property, legacy) : property;
      });
      await storage.setItem(propertiesKey, JSON.stringify(merged));
    }
  }

  await storage.setItem(STAGE_01B1_WEB_MIGRATION_KEY, 'complete');
  return changed;
}

export function migrateStage01B1Draft(
  storage: KeyValueStorage,
  draftKey: string,
): Promise<boolean> {
  return singleFlight(
    draftMigrations,
    storage,
    draftKey,
    () => runStage01B1DraftMigration(storage, draftKey),
  );
}

async function runStage01B1DraftMigration(
  storage: KeyValueStorage,
  draftKey: string,
): Promise<boolean> {
  if (await storage.getItem(STAGE_01B1_DRAFT_MIGRATION_KEY)) return false;

  const raw = await storage.getItem(draftKey);
  let changed = false;
  if (raw) {
    const legacy = JSON.parse(raw) as PropertyDraft;
    const normalized = normalizeDraftCurrency(legacy);
    changed = normalized.changed;
    if (changed) {
      const latestRaw = await storage.getItem(draftKey);
      const latest = latestRaw ? JSON.parse(latestRaw) as PropertyDraft : legacy;
      await storage.setItem(
        draftKey,
        JSON.stringify(normalizeEligibleDraft(latest, legacy)),
      );
    }
  }

  await storage.setItem(STAGE_01B1_DRAFT_MIGRATION_KEY, 'complete');
  return changed;
}