import test from 'node:test';
import assert from 'node:assert/strict';
import type { SQLiteBindParams } from 'expo-sqlite';

import './platformModuleStubs.ts';
import {
  normalizeSeekerRequirement,
  validateSeekerRequirement,
  type BuySeekerRequirement,
  type RentSeekerRequirement,
  type SeekerRequirement,
} from '@workspace/property-domain';
import type { Person } from '../services/people.ts';
import { createPerson } from '../services/people.ts';
import {
  NATIVE_REQUIREMENT_CHRONOLOGY_TABLE,
  NATIVE_REQUIREMENTS_TABLE,
  SQLiteRequirementStore,
  WEB_REQUIREMENTS_KEY,
  WebRequirementStore,
} from '../services/requirementPersistence.ts';
import {
  STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID,
  WEB_REQUIREMENT_CHRONOLOGY_KEY,
  migrateWebStoreChronology,
} from '../services/chronology.ts';

const ids = {
  rent: '11111111-1111-4111-8111-111111111111',
  buy: '22222222-2222-4222-8222-222222222222',
  other: '33333333-3333-4333-8333-333333333333',
};

const seeker = (id: string): Person => createPerson({
  id,
  classifications: ['seeker'],
  name: `Seeker ${id}`,
  displayPhone: '50000000',
  notes: '',
});

const owner = (id: string): Person => createPerson({
  id,
  classifications: ['owner'],
  name: `Owner ${id}`,
  displayPhone: '51111111',
  notes: '',
});

const rentRequirement = (
  id = ids.rent,
  seekerId = 'seeker-1',
): RentSeekerRequirement => ({
  id,
  seekerId,
  purpose: 'rent',
  propertyType: 'apartment',
  preferredAreaIds: ['salmiya', 'hawalli', 'jabriya'],
  budget: {
    minimum: 450,
    maximum: 800,
    currencyCode: 'KWD',
  },
  notes: '  keep literally\nلا تستنتج أي شيء  ',
  bedroomsMinimum: 2,
  bathroomsMinimum: 1,
  occupancy: 'any',
  swimmingPool: true,
  gym: false,
  seaView: true,
  centralAC: true,
});

const buyRequirement = (
  id = ids.buy,
  seekerId = 'seeker-1',
): BuySeekerRequirement => ({
  id,
  seekerId,
  purpose: 'buy',
  propertyType: 'villa',
  preferredAreaIds: ['adailiya', 'faiha'],
  budget: {
    minimum: 250_000,
    maximum: 400_000,
    currencyCode: 'KWD',
  },
  notes: '',
});

test('SeekerRequirement validates canonical structure without Matching semantics', async () => {
  const { generateDomainId } = await import('../services/identity.ts');
  const generatedId = generateDomainId();
  assert.match(
    generatedId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  const rent = rentRequirement(generatedId);
  const normalized = normalizeSeekerRequirement(rent, {
    isCanonicalAreaId: areaId =>
      ['salmiya', 'hawalli', 'jabriya'].includes(areaId),
  });
  assert.equal(normalized.ok, true);
  if (!normalized.ok || normalized.value.purpose !== 'rent') return;
  assert.deepEqual(normalized.value.preferredAreaIds, [
    'salmiya',
    'hawalli',
    'jabriya',
  ]);
  assert.equal(normalized.value.notes, rent.notes);
  assert.equal(normalized.value.occupancy, 'any');

  const missingOccupancy = normalizeSeekerRequirement({
    ...rent,
    occupancy: undefined,
    bedroomsMinimum: undefined,
  });
  assert.equal(missingOccupancy.ok, true);
  if (!missingOccupancy.ok || missingOccupancy.value.purpose !== 'rent') return;
  assert.equal('occupancy' in missingOccupancy.value, false);
  assert.equal('bedroomsMinimum' in missingOccupancy.value, false);

  const invalidArea = validateSeekerRequirement(rent, {
    isCanonicalAreaId: areaId => areaId !== 'hawalli',
  });
  assert.equal(invalidArea.ok, false);
  if (!invalidArea.ok) {
    assert.ok(invalidArea.issues.some(issue => issue.code === 'invalid_area_id'));
  }

  const invalidBudget = validateSeekerRequirement({
    ...rent,
    budget: { minimum: 900, maximum: 800, currencyCode: 'KWD' },
  });
  assert.equal(invalidBudget.ok, false);
  const budgetWithUnknownField = validateSeekerRequirement({
    ...rent,
    budget: {
      minimum: 450,
      maximum: 800,
      currencyCode: 'KWD',
      scoreWeight: 50,
    },
  });
  assert.equal(budgetWithUnknownField.ok, false);

  const buyWithRentField = validateSeekerRequirement({
    ...buyRequirement(),
    bedroomsMinimum: 2,
  });
  assert.equal(buyWithRentField.ok, false);
  if (!buyWithRentField.ok) {
    assert.ok(buyWithRentField.issues.some(
      issue => issue.code === 'buy_rent_field_not_allowed',
    ));
  }

  const rentalPeriod = validateSeekerRequirement({
    ...rent,
    rentalPeriodId: 'monthly',
  });
  assert.equal(rentalPeriod.ok, false);
  if (!rentalPeriod.ok) {
    assert.ok(rentalPeriod.issues.some(issue =>
      issue.code === 'invalid_requirement'
      && issue.path.join('.') === 'rentalPeriodId'
    ));
  }
});

class MemoryStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

const locks = {
  async request<T>(
    _name: string,
    _options: { mode: 'exclusive' },
    callback: () => Promise<T>,
  ): Promise<T> {
    return callback();
  },
};

test('Web Requirement persistence survives recreation and isolates Seekers', async () => {
  const people = new Map<string, Person>([
    ['seeker-1', seeker('seeker-1')],
    ['seeker-2', seeker('seeker-2')],
    ['owner-1', owner('owner-1')],
  ]);
  const peopleReader = {
    getPerson: async (id: string) => people.get(id) ?? null,
  };
  const storage = new MemoryStorage();
  const first = new WebRequirementStore(storage, () => locks, peopleReader);

  await first.saveRequirement(rentRequirement());
  await first.saveRequirement(buyRequirement());
  await first.saveRequirement(rentRequirement(ids.other, 'seeker-2'));

  assert.deepEqual(
    (await first.getRequirementsForSeeker('seeker-1')).map(item => item.id).sort(),
    [ids.buy, ids.rent].sort(),
  );
  assert.deepEqual(
    (await first.getRequirementsForSeeker('seeker-2')).map(item => item.id),
    [ids.other],
  );

  const requirementsBytes = storage.values.get(WEB_REQUIREMENTS_KEY);
  const chronologyBytes = storage.values.get(WEB_REQUIREMENT_CHRONOLOGY_KEY);
  assert.ok(requirementsBytes);
  assert.ok(chronologyBytes);

  const restarted = new WebRequirementStore(storage, () => locks, peopleReader);
  const reloaded = await restarted.getRequirement(ids.rent);
  assert.deepEqual(reloaded, rentRequirement());
  assert.equal(reloaded?.id, ids.rent);
  assert.equal(reloaded?.seekerId, 'seeker-1');
  assert.deepEqual(reloaded?.preferredAreaIds, ['salmiya', 'hawalli', 'jabriya']);
  assert.equal(reloaded?.budget.currencyCode, 'KWD');
  assert.equal(reloaded?.notes, '  keep literally\nلا تستنتج أي شيء  ');

  const replacement: RentSeekerRequirement = {
    ...rentRequirement(),
    budget: { minimum: 500, maximum: 850, currencyCode: 'KWD' },
  };
  assert.equal(await restarted.updateRequirement(rentRequirement(), replacement), true);
  assert.equal((await restarted.getRequirement(ids.rent))?.id, ids.rent);
  assert.equal(storage.values.get(WEB_REQUIREMENT_CHRONOLOGY_KEY), chronologyBytes);

  await assert.rejects(
    first.saveRequirement(rentRequirement(
      '44444444-4444-4444-8444-444444444444',
      'missing-seeker',
    )),
    /REQUIREMENT_SEEKER_NOT_FOUND/,
  );
  await assert.rejects(
    first.saveRequirement(rentRequirement(
      '55555555-5555-4555-8555-555555555555',
      'owner-1',
    )),
    /REQUIREMENT_SEEKER_CLASSIFICATION_REQUIRED/,
  );
});

class RequirementDatabase {
  readonly requirements = new Map<string, string>();
  readonly chronology = new Map<string, number>();

  async getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null> {
    if (!source.includes(NATIVE_REQUIREMENTS_TABLE)) {
      throw new Error(`Unexpected read: ${source}`);
    }
    assert.ok(Array.isArray(params));
    const id = String(params[0]);
    const data = this.requirements.get(id);
    return (data === undefined ? null : { id, data }) as T | null;
  }

  async getAllAsync<T>(source: string): Promise<T[]> {
    if (source.includes(NATIVE_REQUIREMENT_CHRONOLOGY_TABLE)) {
      return [...this.chronology].map(([id, created_at]) => ({
        id,
        created_at,
      })) as T[];
    }
    if (source.includes(NATIVE_REQUIREMENTS_TABLE)) {
      return [...this.requirements].map(([id, data]) => ({ id, data })) as T[];
    }
    throw new Error(`Unexpected read: ${source}`);
  }

  async runAsync(source: string, params: SQLiteBindParams): Promise<unknown> {
    assert.ok(Array.isArray(params));
    const sql = source.replace(/\s+/g, ' ').trim();
    if (sql.startsWith(`INSERT INTO ${NATIVE_REQUIREMENTS_TABLE}`)) {
      this.requirements.set(String(params[0]), String(params[1]));
      return { changes: 1 };
    }
    if (sql.startsWith(`INSERT OR IGNORE INTO ${NATIVE_REQUIREMENT_CHRONOLOGY_TABLE}`)) {
      const id = String(params[0]);
      if (!this.chronology.has(id)) this.chronology.set(id, Number(params[1]));
      return { changes: 1 };
    }
    if (sql.startsWith(`UPDATE ${NATIVE_REQUIREMENTS_TABLE}`)) {
      const [replacement, id, expected] = params.map(String);
      if (this.requirements.get(id) !== expected) return { changes: 0 };
      this.requirements.set(id, replacement);
      return { changes: 1 };
    }
    throw new Error(`Unexpected write: ${source}`);
  }

  async withTransactionAsync(callback: () => Promise<void>): Promise<void> {
    await callback();
  }
}

test('Native Requirement persistence survives store recreation without lifecycle cleanup', async () => {
  const db = new RequirementDatabase();
  const people = new Map<string, Person>([['seeker-1', seeker('seeker-1')]]);
  const peopleReader = {
    getPerson: async (id: string) => people.get(id) ?? null,
  };
  const first = new SQLiteRequirementStore(() => db, peopleReader);
  await first.saveRequirement(rentRequirement());
  await first.saveRequirement(buyRequirement());

  const savedBytes = db.requirements.get(ids.rent);
  const createdAt = db.chronology.get(ids.rent);
  assert.ok(savedBytes);
  assert.ok(createdAt);

  const restarted = new SQLiteRequirementStore(() => db, peopleReader);
  assert.deepEqual(await restarted.getRequirement(ids.rent), rentRequirement());
  assert.deepEqual(
    (await restarted.getRequirementsForSeeker('seeker-1')).map(item => item.id).sort(),
    [ids.buy, ids.rent].sort(),
  );

  people.delete('seeker-1');
  assert.deepEqual(await restarted.getRequirement(ids.rent), rentRequirement());
  assert.equal(db.requirements.get(ids.rent), savedBytes);
  assert.equal(db.chronology.get(ids.rent), createdAt);
});

test('Requirement updates preserve immutable identity and reject stale snapshots', async () => {
  const peopleReader = {
    getPerson: async (id: string) => id === 'seeker-1' ? seeker(id) : null,
  };
  const storage = new MemoryStorage();
  const store = new WebRequirementStore(storage, () => locks, peopleReader);
  const original = rentRequirement();
  await store.saveRequirement(original);

  const changedId: SeekerRequirement = {
    ...original,
    id: '66666666-6666-4666-8666-666666666666',
  };
  assert.equal(await store.updateRequirement(original, changedId), false);

  const replacement: RentSeekerRequirement = {
    ...original,
    notes: 'updated literally',
  };
  assert.equal(await store.updateRequirement(original, replacement), true);
  assert.equal(await store.updateRequirement(original, {
    ...replacement,
    notes: 'stale write',
  }), false);
  assert.equal((await store.getRequirement(original.id))?.notes, 'updated literally');
});

test('Malformed Requirement rows remain unchanged while valid peers remain readable', async () => {
  const peopleReader = {
    getPerson: async (id: string) => id === 'seeker-1' ? seeker(id) : null,
  };
  const db = new RequirementDatabase();
  const nativeWarnings: Array<{ type: string; id: string }> = [];
  const native = new SQLiteRequirementStore(
    () => db,
    peopleReader,
    warning => nativeWarnings.push(warning),
  );
  await native.saveRequirement(rentRequirement());
  const malformedNativeBytes = '{"id":';
  db.requirements.set(ids.other, malformedNativeBytes);

  assert.deepEqual((await native.getRequirements()).map(item => item.id), [ids.rent]);
  assert.equal(db.requirements.get(ids.other), malformedNativeBytes);
  assert.deepEqual(nativeWarnings, [{ type: 'requirement', id: ids.other }]);

  const storage = new MemoryStorage();
  const malformedWebValue = {
    ...buyRequirement(ids.other),
    preferredAreaIds: ['not_a_canonical_area'],
  };
  const originalWebBytes = JSON.stringify([rentRequirement(), malformedWebValue]);
  storage.values.set(WEB_REQUIREMENTS_KEY, originalWebBytes);
  const webWarnings: Array<{ type: string; id: string }> = [];
  const web = new WebRequirementStore(
    storage,
    () => locks,
    peopleReader,
    warning => webWarnings.push(warning),
  );

  assert.deepEqual((await web.getRequirements()).map(item => item.id), [ids.rent]);
  assert.equal(storage.values.get(WEB_REQUIREMENTS_KEY), originalWebBytes);
  assert.deepEqual(webWarnings, [{ type: 'requirement', id: ids.other }]);
  await assert.rejects(
    web.saveRequirement(buyRequirement()),
    /UNREADABLE_REQUIREMENT_STORAGE/,
  );
  assert.equal(storage.values.get(WEB_REQUIREMENTS_KEY), originalWebBytes);
});

test('Requirement chronology migration does not complete for invalid canonical Areas', async () => {
  const storage = new MemoryStorage();
  storage.values.set('@properties-test', '[]');
  storage.values.set('@people-test', '[]');
  storage.values.set(WEB_REQUIREMENTS_KEY, JSON.stringify([{
    ...rentRequirement(),
    preferredAreaIds: ['not_a_canonical_area'],
  }]));

  await migrateWebStoreChronology({
    storage,
    propertiesKey: '@properties-test',
    peopleKey: '@people-test',
    requirementsKey: WEB_REQUIREMENTS_KEY,
  });

  assert.equal(
    storage.values.has(STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID),
    false,
  );
  assert.equal(storage.values.has(WEB_REQUIREMENT_CHRONOLOGY_KEY), false);
});