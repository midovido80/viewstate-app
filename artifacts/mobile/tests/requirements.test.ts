import test from 'node:test';
import assert from 'node:assert/strict';
import type { SQLiteBindParams, SQLiteDatabase } from 'expo-sqlite';

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
  WEB_REQUIREMENTS_RECOVERY_KEY,
  WebRequirementStore,
} from '../services/requirementPersistence.ts';
import {
  STAGE_01B_UUID_CHRONOLOGY_MIGRATION_ID,
  WEB_REQUIREMENT_CHRONOLOGY_KEY,
  migrateWebStoreChronology,
} from '../services/chronology.ts';
import {
  SQLiteStore,
  WebStore,
} from '../services/persistence.ts';

const ids = {
  rent: '11111111-1111-4111-8111-111111111111',
  buy: '22222222-2222-4222-8222-222222222222',
  other: '33333333-3333-4333-8333-333333333333',
};

interface AsyncGate {
  readonly started: Promise<void>;
  readonly waitForRelease: Promise<void>;
  markStarted(): void;
  release(): void;
}

function createGate(): AsyncGate {
  let markStarted!: () => void;
  let release!: () => void;
  return {
    started: new Promise<void>(resolve => {
      markStarted = resolve;
    }),
    waitForRelease: new Promise<void>(resolve => {
      release = resolve;
    }),
    markStarted,
    release,
  };
}

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

  const buyWithCommonSpecs = validateSeekerRequirement({
    ...buyRequirement(),
    bedroomsMinimum: 2,
    bathroomsMinimum: 1,
    centralAC: true,
  });
  assert.equal(buyWithCommonSpecs.ok, true);
  const buyWithRentField = validateSeekerRequirement({
    ...buyRequirement(),
    occupancy: 'family',
  });
  assert.equal(buyWithRentField.ok, false);

  const yearly = normalizeSeekerRequirement({
    ...rent,
    rentalPeriodId: 'yearly',
  });
  assert.equal(yearly.ok, true);
  if (yearly.ok && yearly.value.purpose === 'rent') {
    assert.equal(yearly.value.rentalPeriodId, 'yearly');
  }

  const invalidRentalPeriod = validateSeekerRequirement({
    ...rent,
    rentalPeriodId: 'weekly',
  });
  assert.equal(invalidRentalPeriod.ok, false);

  const buyWithRentalPeriod = validateSeekerRequirement({
    ...buyRequirement(),
    rentalPeriodId: 'monthly',
  });
  assert.equal(buyWithRentalPeriod.ok, false);
  if (!buyWithRentalPeriod.ok) {
    assert.ok(buyWithRentalPeriod.issues.some(issue =>
      issue.code === 'buy_rent_field_not_allowed'
      && issue.path.join('.') === 'rentalPeriodId'
    ));
  }
});

test('catalog preferences validate applicability and preserve zero and false', () => {
  const requirement = {
    ...rentRequirement(),
    catalogPreferences: [
      { field: 'livingRoomCount', kind: 'number', comparison: 'minimum', value: 0 },
      { field: 'hasHeating', kind: 'feature', value: false },
      { field: 'furnishing', kind: 'choice', value: 'furnished' },
    ],
  };
  const normalized = normalizeSeekerRequirement(requirement);
  assert.equal(normalized.ok, true);
  if (normalized.ok) {
    assert.deepEqual(normalized.value.catalogPreferences, [
      { field: 'livingRoomCount', kind: 'number', comparison: 'minimum', value: 0 },
      { field: 'furnishing', kind: 'choice', value: 'furnished' },
    ]);
    assert.deepEqual(normalized.value.preferredAmenityExclusions, ['heating']);
  }

  const invalid = validateSeekerRequirement({
    ...rentRequirement(),
    catalogPreferences: [
      { field: 'livingRoomCount', kind: 'number', comparison: 'minimum', value: 1.5 },
      { field: 'hasPool', kind: 'feature', value: true },
    ],
  });
  assert.equal(invalid.ok, false);

  const floorWithoutUse = validateSeekerRequirement({
    ...rentRequirement(),
    propertyType: 'floor',
    catalogPreferences: [
      { field: 'bedroomCount', kind: 'number', comparison: 'minimum', value: 2 },
    ],
  });
  assert.equal(floorWithoutUse.ok, false);
});

test('Requirement area scope and typed Founder fields have one authoritative contract', () => {
  const base = rentRequirement();
  const allKuwait = normalizeSeekerRequirement({
    ...base,
    preferredAreaMode: 'all_kuwait',
    preferredAreaIds: [],
    masterBedroomsMinimum: 1,
    driverRoom: true,
  });
  assert.equal(allKuwait.ok, true);
  if (allKuwait.ok) {
    assert.equal(allKuwait.value.preferredAreaMode, 'all_kuwait');
    assert.deepEqual(allKuwait.value.preferredAreaIds, []);
    assert.equal(allKuwait.value.masterBedroomsMinimum, 1);
    assert.equal(allKuwait.value.driverRoom, true);
  }
  const legacyEmpty = validateSeekerRequirement({ ...base, preferredAreaIds: [] });
  assert.equal(legacyEmpty.ok, false);
  const readableLegacyEmpty = normalizeSeekerRequirement({ ...base, preferredAreaIds: [] });
  assert.equal(readableLegacyEmpty.ok, true);
  const invalidAll = validateSeekerRequirement({
    ...base,
    preferredAreaMode: 'all_kuwait',
    preferredAreaIds: ['salmiya'],
  });
  assert.equal(invalidAll.ok, false);
  const invalidMaster = validateSeekerRequirement({
    ...base,
    masterBedroomsMinimum: 3,
  });
  assert.equal(invalidMaster.ok, false);
  const canonicalAlias = validateSeekerRequirement({
    ...base,
    catalogPreferences: [{ field: 'bedroomCount', kind: 'number', comparison: 'minimum', value: 2 }],
  });
  assert.equal(canonicalAlias.ok, false);
});

test('Requirement catalog numeric and choice allowlists reject unsafe or opaque values', () => {
  const base = rentRequirement();
  const invalidNumber = validateSeekerRequirement({
    ...base,
    catalogPreferences: [{ field: 'floorNumber', kind: 'number', comparison: 'minimum', value: 2 }],
  });
  assert.equal(invalidNumber.ok, false);
  const invalidChoice = validateSeekerRequirement({
    ...base,
    catalogPreferences: [{ field: 'commercialActivity', kind: 'choice', value: 'Retail' }],
  });
  assert.equal(invalidChoice.ok, false);
});

test('Requirement residential core and Driver room fields reject commercial or non-residential use', () => {
  const base = rentRequirement();
  const commercialFloor = {
    ...base,
    propertyType: 'floor' as const,
    floorUse: 'commercial' as const,
    bedroomsMinimum: 2,
    bathroomsMinimum: 1,
    masterBedroomsMinimum: 1,
    driverRoom: true,
  };
  const invalid = validateSeekerRequirement(commercialFloor);
  assert.equal(invalid.ok, false);
  const commercialDriver = validateSeekerRequirement({
    ...base,
    propertyType: 'office' as const,
    driverRoom: true,
  });
  assert.equal(commercialDriver.ok, false);
  const residential = normalizeSeekerRequirement({
    ...base,
    propertyType: 'floor' as const,
    floorUse: 'residential' as const,
    bedroomsMinimum: 3,
    bathroomsMinimum: 2,
    masterBedroomsMinimum: 1,
    driverRoom: true,
  });
  assert.equal(residential.ok, true);
  if (residential.ok) {
    assert.equal(residential.value.driverRoom, true);
    assert.equal(residential.value.masterBedroomsMinimum, 1);
  }
  const residentialAmenities = validateSeekerRequirement({
    ...base,
    propertyType: 'floor' as const,
    floorUse: 'residential' as const,
    preferredAmenities: ['heating'],
    preferredAmenityExclusions: ['balcony'],
  });
  assert.equal(residentialAmenities.ok, true);
  const commercialAmenities = validateSeekerRequirement({
    ...base,
    propertyType: 'floor' as const,
    floorUse: 'commercial' as const,
    preferredAmenities: ['heating'],
  });
  assert.equal(commercialAmenities.ok, false);
});

test('canonical amenity aliases reject new candidates but legacy true aliases migrate safely', () => {
  const base = rentRequirement();
  const alias = {
    ...base,
    catalogPreferences: [{ field: 'hasHeating', kind: 'feature' as const, value: true }],
  };
  assert.equal(validateSeekerRequirement(alias).ok, false);
  const restored = normalizeSeekerRequirement(alias);
  assert.equal(restored.ok, true);
  if (restored.ok) {
    assert.deepEqual(restored.value.preferredAmenities, ['heating']);
    assert.deepEqual(restored.value.catalogPreferences, undefined);
  }
  const explicitFalse = normalizeSeekerRequirement({
    ...base,
    catalogPreferences: [{ field: 'hasHeating', kind: 'feature' as const, value: false }],
  });
  assert.equal(explicitFalse.ok, true);
  if (explicitFalse.ok) {
    assert.deepEqual(explicitFalse.value.catalogPreferences, undefined);
    assert.deepEqual(explicitFalse.value.preferredAmenityExclusions, ['heating']);
  }
  const conflict = normalizeSeekerRequirement({
    ...base,
    preferredAmenities: ['heating'],
    catalogPreferences: [{ field: 'hasHeating', kind: 'feature' as const, value: false }],
  });
  assert.equal(conflict.ok, false);
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

class BlockingMemoryStorage extends MemoryStorage {
  private peopleWriteGate: AsyncGate | null = null;

  blockNextPeopleWrite(): AsyncGate {
    const gate = createGate();
    this.peopleWriteGate = gate;
    return gate;
  }

  override async setItem(key: string, value: string): Promise<void> {
    const gate = key === '@viewstate_people_v1'
      ? this.peopleWriteGate
      : null;
    if (gate) {
      this.peopleWriteGate = null;
      gate.markStarted();
      await gate.waitForRelease;
    }
    await super.setItem(key, value);
  }
}

class SerializedLocks {
  private readonly tails = new Map<string, Promise<void>>();

  async request<T>(
    name: string,
    _options: { mode: 'exclusive' },
    callback: () => Promise<T>,
  ): Promise<T> {
    const previous = this.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    this.tails.set(name, previous.then(() => current));
    await previous;
    try {
      return await callback();
    } finally {
      release();
    }
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
  const ownerRequirement = rentRequirement(
    '55555555-5555-4555-8555-555555555555',
    'owner-1',
  );
  await first.saveRequirement(ownerRequirement);
  assert.deepEqual(await first.getRequirement(ownerRequirement.id), ownerRequirement);
});

test('legacy media-bearing local rows hydrate cleanly and become clean only when edited', async () => {
  const peopleReader = {
    getPerson: async (id: string) => id === 'seeker-1' ? seeker(id) : null,
  };
  const legacyFirst = {
    ...rentRequirement(),
    studioMapsLink: 'https://www.google.com/maps/place/Salmiya/@29.3,48.0,15z',
    attachments: [{
      id: 'legacy-image',
      kind: 'image',
      originalName: 'room.jpg',
      mimeType: 'image/jpeg',
      order: 0,
      managedUri: `file:///requirements/${ids.rent}/attachments/legacy-image.jpg`,
      privacy: { classification: 'normal', disclosurePolicy: 'normal' },
    }],
  };
  const peerId = ids.other;
  const legacyPeer = {
    ...rentRequirement(peerId),
    studioMapsLink: 'https://maps.google.com/?q=29.3,48.0',
    attachments: [{ id: 'peer-file', kind: 'pdf', originalName: 'old.pdf' }],
  };

  const storage = new MemoryStorage();
  const originalWebBytes = JSON.stringify([legacyFirst, legacyPeer]);
  storage.values.set(WEB_REQUIREMENTS_KEY, originalWebBytes);
  const web = new WebRequirementStore(storage, () => locks, peopleReader);
  const hydrated = await web.getRequirement(ids.rent);
  assert.equal(hydrated?.id, ids.rent);
  assert.equal(hydrated?.seekerId, 'seeker-1');
  assert.equal('studioMapsLink' in (hydrated ?? {}), false);
  assert.equal('attachments' in (hydrated ?? {}), false);
  assert.equal(hydrated?.notes, rentRequirement().notes);
  assert.equal(storage.values.get(WEB_REQUIREMENTS_KEY), originalWebBytes, 'Hydration must not rewrite prior bytes');

  const attemptedNewSave = {
    ...rentRequirement('66666666-6666-4666-8666-666666666666'),
    attachments: legacyFirst.attachments,
    studioMapsLink: legacyFirst.studioMapsLink,
  } as unknown as SeekerRequirement;
  await assert.rejects(web.saveRequirement(attemptedNewSave), /INVALID_REQUIREMENT/);
  assert.equal(storage.values.get(WEB_REQUIREMENTS_KEY), originalWebBytes, 'Rejected save must leave rows unchanged');

  const replacement = { ...hydrated!, notes: 'edited after hydration' };
  assert.equal(await web.updateRequirement(hydrated!, replacement), true, 'Clean UI snapshot can edit legacy row');
  const persistedAfterEdit = JSON.parse(storage.values.get(WEB_REQUIREMENTS_KEY) ?? '[]') as Record<string, unknown>[];
  assert.equal('studioMapsLink' in persistedAfterEdit[0], false, 'Edited row transitions to clean contract');
  assert.equal('attachments' in persistedAfterEdit[0], false, 'Edited row drops old media metadata');
  assert.equal('studioMapsLink' in persistedAfterEdit[1], true, 'Untouched legacy peer remains intact');
  assert.equal('attachments' in persistedAfterEdit[1], true, 'Unedited files are not discarded');
  assert.equal(persistedAfterEdit[0].id, ids.rent, 'Edit preserves row identity');
  assert.equal(persistedAfterEdit[0].seekerId, 'seeker-1', 'Edit preserves ownership');

  const db = new RequirementDatabase();
  db.requirements.set(ids.rent, JSON.stringify(legacyFirst));
  db.chronology.set(ids.rent, 123456);
  const native = new SQLiteRequirementStore(() => db, peopleReader);
  const nativeHydrated = await native.getRequirement(ids.rent);
  assert.equal(nativeHydrated?.id, ids.rent);
  assert.equal('studioMapsLink' in (nativeHydrated ?? {}), false);
  assert.equal('attachments' in (nativeHydrated ?? {}), false);
  assert.equal(db.requirements.get(ids.rent), JSON.stringify(legacyFirst), 'SQLite hydration must not rewrite bytes');
  assert.equal(await native.updateRequirement(nativeHydrated!, {
    ...nativeHydrated!,
    notes: 'native edit',
  }), true, 'Clean snapshot can transition a native legacy row');
  const nativeAfterEdit = JSON.parse(db.requirements.get(ids.rent) ?? '{}') as Record<string, unknown>;
  assert.equal('studioMapsLink' in nativeAfterEdit, false);
  assert.equal('attachments' in nativeAfterEdit, false);
  assert.equal(db.chronology.get(ids.rent), 123456, 'Edit preserves existing chronology');
});

class RequirementDatabase {
  readonly requirements = new Map<string, string>();
  readonly chronology = new Map<string, number>();
  readonly people = new Map<string, string>();
  readonly personChronology = new Map<string, number>();
  readonly migrations = new Set<string>();
  private personDeleteGate: AsyncGate | null = null;
  private personUpdateGate: AsyncGate | null = null;

  blockNextPersonDelete(): AsyncGate {
    const gate = createGate();
    this.personDeleteGate = gate;
    return gate;
  }

  blockNextPersonUpdate(): AsyncGate {
    const gate = createGate();
    this.personUpdateGate = gate;
    return gate;
  }

  async execAsync(): Promise<void> {}

  async getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null> {
    assert.ok(Array.isArray(params));
    const id = String(params[0]);
    if (source.includes('FROM app_migrations')) {
      return (this.migrations.has(id) ? { id } : null) as T | null;
    }
    if (source.includes('FROM people')) {
      const data = this.people.get(id);
      return (data === undefined ? null : { id, data }) as T | null;
    }
    if (!source.includes(NATIVE_REQUIREMENTS_TABLE)) {
      throw new Error(`Unexpected read: ${source}`);
    }
    const data = this.requirements.get(id);
    return (data === undefined ? null : { id, data }) as T | null;
  }

  async getAllAsync<T>(source: string): Promise<T[]> {
    if (source.includes('FROM property_creation_chronology')) return [];
    if (source.includes('FROM person_creation_chronology')) {
      return [...this.personChronology].map(([id, created_at]) => ({
        id,
        created_at,
      })) as T[];
    }
    if (source.includes('FROM properties')) return [];
    if (source.includes('FROM people')) {
      return [...this.people].map(([id, data]) => ({ id, data })) as T[];
    }
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
    if (sql.startsWith('INSERT INTO app_migrations')) {
      this.migrations.add(String(params[0]));
      return { changes: 1 };
    }
    if (sql.startsWith('INSERT INTO people')) {
      this.people.set(String(params[0]), String(params[1]));
      return { changes: 1 };
    }
    if (sql.startsWith('INSERT OR IGNORE INTO person_creation_chronology')) {
      const id = String(params[0]);
      if (!this.personChronology.has(id)) {
        this.personChronology.set(id, Number(params[1]));
      }
      return { changes: 1 };
    }
    if (sql.startsWith('UPDATE people SET data')) {
      const gate = this.personUpdateGate;
      if (gate) {
        this.personUpdateGate = null;
        gate.markStarted();
        await gate.waitForRelease;
      }
      const [replacement, , id, expected] = params.map(String);
      if (this.people.get(id) !== expected) return { changes: 0 };
      this.people.set(id, replacement);
      return { changes: 1 };
    }
    if (
      sql.startsWith('DELETE FROM person_property_links')
      || sql.startsWith('DELETE FROM property_sources')
    ) {
      return { changes: 0 };
    }
    if (sql.startsWith('DELETE FROM people')) {
      const gate = this.personDeleteGate;
      if (gate) {
        this.personDeleteGate = null;
        gate.markStarted();
        await gate.waitForRelease;
      }
      return { changes: this.people.delete(String(params[0])) ? 1 : 0 };
    }
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

const sqliteStoreFor = (db: RequirementDatabase, requirementsEnabled = true) =>
  new SQLiteStore(
    async () => db as unknown as SQLiteDatabase,
    { requirementsEnabled },
  );

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

test('All Kuwait mode survives native and web store recreation without a fake area ID', async () => {
  const personReader = { getPerson: async (id: string) => id === 'seeker-1' ? seeker(id) : null };
  const allKuwait: RentSeekerRequirement = {
    ...rentRequirement(),
    preferredAreaMode: 'all_kuwait',
    preferredAreaIds: [],
  };
  const db = new RequirementDatabase();
  await new SQLiteRequirementStore(() => db, personReader).saveRequirement(allKuwait);
  assert.deepEqual(await new SQLiteRequirementStore(() => db, personReader).getRequirement(allKuwait.id), allKuwait);

  const storage = new MemoryStorage();
  await new WebRequirementStore(storage, () => locks, personReader).saveRequirement(allKuwait);
  assert.deepEqual(await new WebRequirementStore(storage, () => locks, personReader).getRequirement(allKuwait.id), allKuwait);
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
  await web.saveRequirement(buyRequirement());
  assert.equal((await web.getRequirement(ids.buy))?.id, ids.buy);
  assert.deepEqual(web.getRecoveryReport().quarantined, [{
    index: 1, id: ids.other, reason: 'invalid_requirement',
  }]);
  assert.equal(storage.values.get(WEB_REQUIREMENTS_KEY), originalWebBytes);
});

test('mixed Web Requirements atomically isolate two unreadable rows and keep canonical records usable', async () => {
  const storage = new MemoryStorage();
  const current = rentRequirement();
  const invalidArea = { ...buyRequirement(ids.other), preferredAreaIds: ['unknown_kuwait_area'] };
  const opaque = { id: 'legacy-unknown', seekerId: 'seeker-1', purpose: 'rent', unknown: true };
  const original = JSON.stringify([current, invalidArea, opaque]);
  storage.values.set(WEB_REQUIREMENTS_KEY, original);
  const reader = { getPerson: async (id: string) => id === 'seeker-1' ? seeker(id) : null };
  const store = new WebRequirementStore(storage, () => locks, reader);
  const standard = rentRequirement(ids.buy);
  const studio = { ...rentRequirement('44444444-4444-4444-8444-444444444444'),
    preferredAreaIds: ['salmiya'], catalogPreferences: [
      { field: 'apartmentSubtype', kind: 'choice', value: 'studio' },
    ] } as unknown as RentSeekerRequirement;
  const building = { ...buyRequirement('55555555-5555-4555-8555-555555555555'),
    propertyType: 'whole_building', preferredAreaIds: [],
    preferredAreaMode: 'all_kuwait',
  } as BuySeekerRequirement;
  for (const record of [standard, studio, building]) await store.saveRequirement(record);
  for (const record of [current, standard, studio, building]) {
    assert.equal((await store.getRequirement(record.id))?.id, record.id);
  }
  assert.equal(storage.values.get(WEB_REQUIREMENTS_KEY), original, 'Original source remains recoverable');
  const recovery = JSON.parse(storage.values.get(WEB_REQUIREMENTS_RECOVERY_KEY)!) as {
    requirements: SeekerRequirement[];
    quarantine: Array<{ raw: unknown; sourceIndex: number; reason: string }>;
  };
  assert.equal((recovery as typeof recovery & { version: number }).version, 2);
  assert.deepEqual(recovery.quarantine.map(item => item.raw), [invalidArea, opaque]);
  assert.deepEqual(recovery.quarantine.map(item => item.sourceIndex), [1, 2]);
  assert.deepEqual(store.getRecoveryReport().quarantined.map(item => item.reason), [
    'invalid_requirement', 'unknown_fields',
  ]);
  const reopened = new WebRequirementStore(storage, () => locks, reader);
  assert.equal((await reopened.getRequirementsForSeeker('seeker-1')).length, 4);
  const activeIds = (await reopened.getRequirements()).map(item => item.id);
  assert.equal(activeIds.includes(ids.other), false, 'Unreadable legacy entry stays out of active reads');
  assert.equal(activeIds.includes('legacy-unknown'), false, 'Quarantined entry stays out of Matching input');
  const beforeView = new Map(storage.values);
  assert.equal((await reopened.getRequirement(standard.id))?.id, standard.id);
  assert.deepEqual(storage.values, beforeView, 'Viewing an exact ID does not write Requirement or chronology storage');
  await reopened.saveRequirement(standard); // same literal ID is an idempotent no-op
  assert.equal((await reopened.getRequirements()).filter(item => item.id === standard.id).length, 1);
  assert.equal(await reopened.updateRequirement(standard, { ...standard, notes: 'edited once' }), true);
  assert.equal((await reopened.getRequirement(standard.id))?.notes, 'edited once');
  assert.equal((await reopened.getRequirements()).filter(item => item.id === standard.id).length, 1);
});

test('failed recovery envelope write leaves original mixed collection and recovery untouched', async () => {
  class FailingRecoveryStorage extends MemoryStorage {
    failNext = true;
    override async setItem(key: string, value: string): Promise<void> {
      if (key === WEB_REQUIREMENTS_RECOVERY_KEY && this.failNext) {
        this.failNext = false;
        throw new Error('STORAGE_WRITE_FAILED');
      }
      await super.setItem(key, value);
    }
  }
  const storage = new FailingRecoveryStorage();
  const legacy = JSON.stringify([rentRequirement(), { id: 'unreadable', unknown: true }]);
  storage.values.set(WEB_REQUIREMENTS_KEY, legacy);
  const store = new WebRequirementStore(storage, () => locks, {
    getPerson: async () => seeker('seeker-1'),
  });
  await assert.rejects(store.saveRequirement(buyRequirement()), /STORAGE_WRITE_FAILED/);
  assert.equal(storage.values.get(WEB_REQUIREMENTS_KEY), legacy);
  assert.equal(storage.values.get(WEB_REQUIREMENTS_RECOVERY_KEY), undefined);
  await store.saveRequirement(buyRequirement());
  assert.equal((await store.getRequirements()).length, 2);
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

test('Integrated Native store serializes Requirement ownership against Person mutations', async () => {
  const db = new RequirementDatabase();
  const store = sqliteStoreFor(db);
  await store.init();

  const deletedSeeker = seeker('native-delete-seeker');
  await store.savePerson(deletedSeeker);
  const deleteGate = db.blockNextPersonDelete();
  const deleting = store.deletePerson(deletedSeeker.id);
  await deleteGate.started;
  const rejectedSave = assert.rejects(
    store.saveRequirement(rentRequirement(
      '77777777-7777-4777-8777-777777777777',
      deletedSeeker.id,
    )),
    /REQUIREMENT_SEEKER_NOT_FOUND/,
  );
  deleteGate.release();
  assert.equal(await deleting, true);
  await rejectedSave;
  assert.equal(
    await store.getRequirement('77777777-7777-4777-8777-777777777777'),
    null,
  );

  const reclassifiedSeeker = seeker('native-reclassified-seeker');
  await store.savePerson(reclassifiedSeeker);
  const original = rentRequirement(
    '88888888-8888-4888-8888-888888888888',
    reclassifiedSeeker.id,
  );
  await store.saveRequirement(original);
  const replacement = {
    ...original,
    notes: 'must not persist after seeker removal',
  };
  const updateGate = db.blockNextPersonUpdate();
  const reclassifying = store.updatePerson(
    reclassifiedSeeker,
    owner(reclassifiedSeeker.id),
  );
  await updateGate.started;
  const acceptedUpdate = store.updateRequirement(original, replacement);
  updateGate.release();
  assert.equal(await reclassifying, true);
  assert.equal(await acceptedUpdate, true);
  assert.deepEqual(await store.getRequirement(original.id), replacement);
});

test('Integrated Web store serializes Requirement ownership against Person mutations', async () => {
  const storage = new BlockingMemoryStorage();
  const sharedLocks = new SerializedLocks();
  const store = new WebStore(storage, sharedLocks);
  await store.init();

  const deletedSeeker = seeker('web-delete-seeker');
  await store.savePerson(deletedSeeker);
  const deleteGate = storage.blockNextPeopleWrite();
  const deleting = store.deletePerson(deletedSeeker.id);
  await deleteGate.started;
  const rejectedSave = assert.rejects(
    store.saveRequirement(rentRequirement(
      '99999999-9999-4999-8999-999999999999',
      deletedSeeker.id,
    )),
    /REQUIREMENT_SEEKER_NOT_FOUND/,
  );
  deleteGate.release();
  assert.equal(await deleting, true);
  await rejectedSave;
  assert.equal(
    await store.getRequirement('99999999-9999-4999-8999-999999999999'),
    null,
  );

  const reclassifiedSeeker = seeker('web-reclassified-seeker');
  await store.savePerson(reclassifiedSeeker);
  const original = rentRequirement(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    reclassifiedSeeker.id,
  );
  await store.saveRequirement(original);
  const replacement = {
    ...original,
    notes: 'must not persist after seeker removal',
  };
  const updateGate = storage.blockNextPeopleWrite();
  const reclassifying = store.updatePerson(
    reclassifiedSeeker,
    owner(reclassifiedSeeker.id),
  );
  await updateGate.started;
  const acceptedUpdate = store.updateRequirement(original, replacement);
  updateGate.release();
  assert.equal(await reclassifying, true);
  assert.equal(await acceptedUpdate, true);
  assert.deepEqual(await store.getRequirement(original.id), replacement);
});

test('Integrated Native and Web stores preserve Requirement data while disabled and re-enable it', async () => {
  const nativeDb = new RequirementDatabase();
  const native = sqliteStoreFor(nativeDb);
  await native.init();
  const nativeSeeker = seeker('native-rollback-seeker');
  const nativeRequirement = rentRequirement(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    nativeSeeker.id,
  );
  await native.savePerson(nativeSeeker);
  await native.saveRequirement(nativeRequirement);
  const nativeBytes = nativeDb.requirements.get(nativeRequirement.id);

  const disabledNative = sqliteStoreFor(nativeDb, false);
  await disabledNative.init();
  assert.equal(await disabledNative.getRequirement(nativeRequirement.id), null);
  assert.deepEqual(await disabledNative.getRequirements(), []);
  await assert.rejects(
    disabledNative.saveRequirement(nativeRequirement),
    /REQUIREMENT_FEATURE_DISABLED/,
  );
  assert.equal(nativeDb.requirements.get(nativeRequirement.id), nativeBytes);

  const reenabledNative = sqliteStoreFor(nativeDb);
  await reenabledNative.init();
  assert.deepEqual(
    await reenabledNative.getRequirement(nativeRequirement.id),
    nativeRequirement,
  );

  const webStorage = new MemoryStorage();
  const webLocks = new SerializedLocks();
  const web = new WebStore(webStorage, webLocks);
  await web.init();
  const webSeeker = seeker('web-rollback-seeker');
  const webRequirement = rentRequirement(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    webSeeker.id,
  );
  await web.savePerson(webSeeker);
  await web.saveRequirement(webRequirement);
  const webBytes = webStorage.values.get(WEB_REQUIREMENTS_KEY);

  const disabledWeb = new WebStore(
    webStorage,
    webLocks,
    { requirementsEnabled: false },
  );
  await disabledWeb.init();
  assert.equal(await disabledWeb.getRequirement(webRequirement.id), null);
  assert.deepEqual(await disabledWeb.getRequirements(), []);
  await assert.rejects(
    disabledWeb.updateRequirement(webRequirement, {
      ...webRequirement,
      notes: 'must not persist while disabled',
    }),
    /REQUIREMENT_FEATURE_DISABLED/,
  );
  assert.equal(webStorage.values.get(WEB_REQUIREMENTS_KEY), webBytes);

  const reenabledWeb = new WebStore(webStorage, webLocks);
  await reenabledWeb.init();
  assert.deepEqual(
    await reenabledWeb.getRequirement(webRequirement.id),
    webRequirement,
  );
});