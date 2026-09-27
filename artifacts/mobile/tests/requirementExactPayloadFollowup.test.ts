import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSeekerRequirement,
  type SeekerRequirement,
} from '@workspace/property-domain';
import {
  getApplicablePropertyFormFieldsForMode,
} from '../services/propertyFormCatalog.ts';
import { buildPersonRequirement } from '../services/personRequirementWorkflow.ts';
import {
  requirementSaveStageDiagnostic,
  savePersonRequirement,
} from '../services/requirementSaveOutcome.ts';
import { requirementSaveIssueCode } from '../services/requirementIssueMessage.ts';
import {
  NATIVE_REQUIREMENT_CHRONOLOGY_TABLE,
  NATIVE_REQUIREMENTS_TABLE,
  SQLiteRequirementStore,
  WEB_REQUIREMENTS_KEY,
  WebRequirementStore,
} from '../services/requirementPersistence.ts';
import { createPerson } from '../services/people.ts';
import type { SQLiteBindParams } from 'expo-sqlite';

const requirementId = '11111111-1111-4111-8111-111111111111';
const personId = 'person-seeker-company';

class MemoryStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

class InMemorySQLiteRequirementDatabase {
  readonly requirements = new Map<string, string>();
  readonly chronology = new Map<string, number>();
  requirementInsertAttempts = 0;
  successfulRequirementInserts = 0;
  chronologyInsertAttempts = 0;
  failBeforeNextRequirementInsert = false;
  failBeforeNextChronologyInsert = false;
  failAfterNextCommit = false;

  async getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null> {
    assert.ok(Array.isArray(params));
    const id = String(params[0]);
    if (!source.includes(NATIVE_REQUIREMENTS_TABLE)) {
      throw new Error(`Unexpected SQLite read: ${source}`);
    }
    const data = this.requirements.get(id);
    return (data === undefined ? null : { id, data }) as T | null;
  }

  async getAllAsync<T>(source: string, _params?: SQLiteBindParams): Promise<T[]> {
    if (source.includes(NATIVE_REQUIREMENT_CHRONOLOGY_TABLE)) {
      return [...this.chronology].map(([id, created_at]) => ({
        id,
        created_at,
      })) as T[];
    }
    if (source.includes(NATIVE_REQUIREMENTS_TABLE)) {
      return [...this.requirements].map(([id, data]) => ({ id, data })) as T[];
    }
    throw new Error(`Unexpected SQLite read: ${source}`);
  }

  async runAsync(source: string, params: SQLiteBindParams): Promise<unknown> {
    assert.ok(Array.isArray(params));
    const sql = source.replace(/\s+/g, ' ').trim();
    if (sql.startsWith(`INSERT INTO ${NATIVE_REQUIREMENTS_TABLE}`)) {
      this.requirementInsertAttempts += 1;
      if (this.failBeforeNextRequirementInsert) {
        this.failBeforeNextRequirementInsert = false;
        throw new Error('TRANSIENT_BEFORE_INSERT');
      }
      const [id, data] = params.map(String);
      this.requirements.set(id, data);
      this.successfulRequirementInserts += 1;
      return { changes: 1 };
    }
    if (sql.startsWith(`INSERT OR IGNORE INTO ${NATIVE_REQUIREMENT_CHRONOLOGY_TABLE}`)) {
      this.chronologyInsertAttempts += 1;
      if (this.failBeforeNextChronologyInsert) {
        this.failBeforeNextChronologyInsert = false;
        throw new Error('TRANSIENT_AFTER_REQUIREMENT_INSERT');
      }
      const [id, createdAt] = params;
      if (!this.chronology.has(String(id))) {
        this.chronology.set(String(id), Number(createdAt));
      }
      return { changes: 1 };
    }
    if (sql.startsWith(`UPDATE ${NATIVE_REQUIREMENTS_TABLE} SET data`)) {
      const [replacement, id, expected] = params.map(String);
      if (this.requirements.get(id) !== expected) return { changes: 0 };
      this.requirements.set(id, replacement);
      return { changes: 1 };
    }
    throw new Error(`Unexpected SQLite write: ${source}`);
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    const requirementsBefore = new Map(this.requirements);
    const chronologyBefore = new Map(this.chronology);
    try {
      await task();
    } catch (error) {
      this.requirements.clear();
      for (const [id, data] of requirementsBefore) this.requirements.set(id, data);
      this.chronology.clear();
      for (const [id, createdAt] of chronologyBefore) this.chronology.set(id, createdAt);
      throw error;
    }

    // Simulate a lost acknowledgement after the transaction committed. A
    // callback error above instead exercises rollback of both tables.
    if (this.failAfterNextCommit) {
      this.failAfterNextCommit = false;
      throw new Error('TRANSIENT_AFTER_COMMIT');
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

function uiDerivedCandidate(): SeekerRequirement {
  const applicable = getApplicablePropertyFormFieldsForMode(
    'wanted',
    'apartment',
    undefined,
    'standard_apartment',
  );
  const visibleFields = new Set(applicable.map(field => field.field));
  const wantedMapping = new Map(applicable.map(field => [field.field, field.wanted]));
  for (const field of [
    'apartmentSubtype',
    'furnishing',
    'livingRoomCount',
    'parkingSpaceCount',
    'builtUpAreaSquareMeters',
    'hasBBQArea',
    'hasSecurityGuard',
    'hasElevator',
    'hasCentralAC',
  ] as const) {
    assert.ok(visibleFields.has(field), `${field} is visible for a standard apartment Requirement`);
  }
  assert.deepEqual(wantedMapping.get('bedroomCount'), {
    kind: 'limit', storage: 'native', field: 'bedroomsMinimum', comparison: 'minimum', presentation: 'core',
  });
  assert.deepEqual(wantedMapping.get('bathroomCount'), {
    kind: 'limit', storage: 'native', field: 'bathroomsMinimum', comparison: 'minimum', presentation: 'core',
  });
  assert.deepEqual(wantedMapping.get('livingRoomCount'), {
    kind: 'limit', storage: 'catalogPreference', field: 'livingRoomCount',
    preferenceKind: 'number', comparison: 'minimum', presentation: 'core',
  });
  assert.deepEqual(wantedMapping.get('parkingSpaceCount'), {
    kind: 'limit', storage: 'catalogPreference', field: 'parkingSpaceCount',
    preferenceKind: 'number', comparison: 'minimum', presentation: 'core',
  });
  assert.deepEqual(wantedMapping.get('builtUpAreaSquareMeters'), {
    kind: 'limit', storage: 'catalogPreference', field: 'builtUpAreaSquareMeters',
    preferenceKind: 'number', comparison: 'minimum', presentation: 'core',
  });
  assert.deepEqual(wantedMapping.get('furnishing'), {
    kind: 'preference', storage: 'catalogPreference', field: 'furnishing',
    preferenceKind: 'choice', presentation: 'leading',
  });
  assert.deepEqual(wantedMapping.get('hasCentralAC'), {
    kind: 'preference', storage: 'native', field: 'centralAC',
    valueType: 'boolean', presentation: 'core',
  });
  for (const [propertyField, amenity] of [
    ['hasBBQArea', 'bbq_area'],
    ['hasSecurityGuard', 'security_guard'],
    ['hasElevator', 'elevator'],
  ] as const) {
    assert.deepEqual(wantedMapping.get(propertyField), {
      kind: 'preference',
      storage: 'native',
      field: 'preferredAmenities',
      value: amenity,
      presentation: 'none',
    });
  }

  const result = buildPersonRequirement(requirementId, personId, {
    purpose: 'rent',
    propertyType: 'apartment',
    preferredAreaMode: 'all_kuwait',
    preferredAreaIds: [],
    minimumBudget: 730,
    maximumBudget: 830,
    currencyCode: 'KWD',
    notes: '',
    bedroomsMinimum: 3,
    masterBedroomsMinimum: 1,
    bathroomsMinimum: 2,
    occupancy: 'bachelor',
    gym: true,
    centralAC: true,
    preferredAmenities: ['bbq_area', 'security_guard', 'elevator'],
    catalogPreferences: [
      { field: 'apartmentSubtype', kind: 'choice', value: 'standard_apartment' },
      { field: 'furnishing', kind: 'choice', value: 'unfurnished' },
      { field: 'livingRoomCount', kind: 'number', comparison: 'minimum', value: 1 },
      { field: 'parkingSpaceCount', kind: 'number', comparison: 'minimum', value: 1 },
      { field: 'builtUpAreaSquareMeters', kind: 'number', comparison: 'minimum', value: 90 },
    ],
  });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues));
  if (!result.ok) throw new Error('UI-derived Requirement was rejected');
  return result.value;
}

function nativeRequirementSaveFacade(
  database: InMemorySQLiteRequirementDatabase,
  person: ReturnType<typeof createPerson>,
) {
  const persistence = new SQLiteRequirementStore(
    () => database,
    { getPerson: async id => id === person.id ? person : null },
  );
  return {
    persistence,
    store: {
      getPerson: async (id: string) => id === person.id ? person : null,
      getRequirement: (id: string) => persistence.getRequirement(id),
      saveRequirement: (requirement: SeekerRequirement) => persistence.saveRequirement(requirement),
      updateRequirement: (expected: SeekerRequirement, replacement: SeekerRequirement) =>
        persistence.updateRequirement(expected, replacement),
    },
  };
}

test('exact Person Requirement payload validates, persists, reads by ID, and navigates', async () => {
  const candidate = uiDerivedCandidate();
  if (candidate.purpose !== 'rent') throw new Error('Expected Rent Requirement');
  const validation = validateSeekerRequirement(candidate);
  assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.issues));

  assert.deepEqual(candidate.preferredAreaIds, []);
  assert.equal(candidate.preferredAreaMode, 'all_kuwait');
  assert.equal(candidate.floorUse, undefined);
  assert.equal(candidate.bedroomsMinimum, 3);
  assert.equal(candidate.masterBedroomsMinimum, 1);
  assert.equal(candidate.bathroomsMinimum, 2);
  assert.equal(candidate.occupancy, 'bachelor');
  assert.equal(candidate.gym, true);
  assert.equal(candidate.centralAC, true);
  assert.deepEqual(candidate.preferredAmenities, ['elevator', 'security_guard', 'bbq_area']);
  assert.deepEqual(candidate.catalogPreferences, [
    { field: 'apartmentSubtype', kind: 'choice', value: 'standard_apartment' },
    { field: 'furnishing', kind: 'choice', value: 'unfurnished' },
    { field: 'livingRoomCount', kind: 'number', comparison: 'minimum', value: 1 },
    { field: 'parkingSpaceCount', kind: 'number', comparison: 'minimum', value: 1 },
    { field: 'builtUpAreaSquareMeters', kind: 'number', comparison: 'minimum', value: 90 },
  ]);

  const storage = new MemoryStorage();
  const person = createPerson({
    id: personId,
    classifications: ['seeker', 'real_estate_company'],
    name: 'Test Person',
    displayPhone: '50000000',
    notes: '',
  });
  const persistence = new WebRequirementStore(
    storage,
    () => locks,
    { getPerson: async id => id === personId ? person : null },
  );
  const store = {
    getPerson: async (id: string) => id === personId ? person : null,
    getRequirement: (id: string) => persistence.getRequirement(id),
    saveRequirement: (requirement: SeekerRequirement) => persistence.saveRequirement(requirement),
    updateRequirement: (expected: SeekerRequirement, replacement: SeekerRequirement) =>
      persistence.updateRequirement(expected, replacement),
  };
  let navigations = 0;
  const outcome = await savePersonRequirement({
    candidate,
    baseline: null,
    store,
    navigate: () => { navigations += 1; },
  });

  assert.deepEqual(outcome, { status: 'saved' }, JSON.stringify([...storage.values.keys()]));
  const serialized = JSON.parse(storage.values.get(WEB_REQUIREMENTS_KEY) ?? '[]') as SeekerRequirement[];
  assert.equal(serialized.length, 1);
  assert.deepEqual(serialized[0], candidate);
  assert.deepEqual(await persistence.getRequirement(requirementId), candidate);
  assert.equal(navigations, 1);
});

test('exact Person Requirement payload persists and edits through SQLite by the same ID', async () => {
  const candidate = uiDerivedCandidate();
  const person = createPerson({
    id: personId,
    classifications: ['seeker', 'real_estate_company'],
    name: 'Test Person',
    displayPhone: '50000000',
    notes: '',
  });
  const database = new InMemorySQLiteRequirementDatabase();
  const { persistence, store } = nativeRequirementSaveFacade(database, person);
  let navigations = 0;

  assert.equal(candidate.preferredAreaMode, 'all_kuwait');
  assert.deepEqual(candidate.preferredAreaIds, [], 'All Kuwait must not invent a nonempty Area ID');
  const saved = await savePersonRequirement({
    candidate,
    baseline: null,
    store,
    navigate: () => { navigations += 1; },
  });
  assert.deepEqual(saved, { status: 'saved' });
  assert.deepEqual(await persistence.getRequirement(requirementId), candidate);
  assert.equal(database.requirementInsertAttempts, 1);
  assert.equal(database.successfulRequirementInserts, 1);
  assert.equal(database.requirements.size, 1);
  assert.equal(database.chronologyInsertAttempts, 1);
  assert.equal(database.chronology.size, 1);

  const createdAt = database.chronology.get(requirementId);
  const editedCandidate = { ...candidate, notes: 'Native adapter edit keeps identity.' };
  const edited = await savePersonRequirement({
    candidate: editedCandidate,
    baseline: candidate,
    store,
    navigate: () => { navigations += 1; },
  });
  assert.deepEqual(edited, { status: 'saved' });
  assert.equal(editedCandidate.id, candidate.id, 'Edit must retain the draft Requirement ID');
  assert.deepEqual(await persistence.getRequirement(requirementId), editedCandidate);
  assert.equal(database.requirementInsertAttempts, 1, 'Editing updates, never inserts a replacement ID');
  assert.equal(database.requirements.size, 1);
  assert.equal(database.chronology.size, 1);
  assert.equal(database.chronology.get(requirementId), createdAt, 'Edit preserves the original chronology row');
  assert.equal(navigations, 2);
});

test('SQLite exact-ID readback recovers committed writes and same-ID retries after transient failures', async () => {
  const candidate = uiDerivedCandidate();
  const person = createPerson({
    id: personId,
    classifications: ['seeker', 'real_estate_company'],
    name: 'Test Person',
    displayPhone: '50000000',
    notes: '',
  });

  const committedDatabase = new InMemorySQLiteRequirementDatabase();
  committedDatabase.failAfterNextCommit = true;
  const committed = nativeRequirementSaveFacade(committedDatabase, person);
  let navigations = 0;
  const recovered = await savePersonRequirement({
    candidate,
    baseline: null,
    store: committed.store,
    navigate: () => { navigations += 1; },
  });
  assert.deepEqual(recovered, { status: 'saved' });
  assert.deepEqual(await committed.persistence.getRequirement(requirementId), candidate);
  assert.equal(committedDatabase.requirementInsertAttempts, 1);
  assert.equal(committedDatabase.requirements.size, 1);
  assert.equal(committedDatabase.chronology.size, 1);
  assert.equal(navigations, 1, 'Confirmed commit navigates exactly once');

  const beforeInsertDatabase = new InMemorySQLiteRequirementDatabase();
  beforeInsertDatabase.failBeforeNextRequirementInsert = true;
  const beforeInsert = nativeRequirementSaveFacade(beforeInsertDatabase, person);
  const uncertain = await savePersonRequirement({
    candidate,
    baseline: null,
    store: beforeInsert.store,
    navigate: () => assert.fail('An uncommitted draft must not navigate'),
  });
  assert.deepEqual(uncertain, {
    status: 'storage_failure',
    retryAllowed: true,
    diagnostic: { stage: 'write', code: 'storage_failure', location: ['requirement'] },
  });
  assert.equal(beforeInsertDatabase.requirements.size, 0);
  assert.equal(beforeInsertDatabase.chronology.size, 0);
  const retried = await savePersonRequirement({
    candidate,
    baseline: null,
    store: beforeInsert.store,
    navigate: () => { navigations += 1; },
  });
  assert.deepEqual(retried, { status: 'saved' });
  assert.equal(candidate.id, requirementId, 'Retry reuses the same draft ID');
  assert.equal(beforeInsertDatabase.requirementInsertAttempts, 2);
  assert.equal(beforeInsertDatabase.requirements.size, 1);
  assert.equal(beforeInsertDatabase.chronology.size, 1);
  assert.deepEqual(await beforeInsert.persistence.getRequirement(requirementId), candidate);

  const rollbackDatabase = new InMemorySQLiteRequirementDatabase();
  rollbackDatabase.failBeforeNextChronologyInsert = true;
  const rollback = nativeRequirementSaveFacade(rollbackDatabase, person);
  const rolledBack = await savePersonRequirement({
    candidate,
    baseline: null,
    store: rollback.store,
    navigate: () => assert.fail('A transaction rolled back after insert must not navigate'),
  });
  assert.deepEqual(rolledBack, {
    status: 'storage_failure',
    retryAllowed: true,
    diagnostic: { stage: 'write', code: 'storage_failure', location: ['requirement'] },
  });
  assert.equal(rollbackDatabase.requirementInsertAttempts, 1);
  assert.equal(rollbackDatabase.requirements.size, 0, 'Transaction failure rolls back the requirement insert');
  assert.equal(rollbackDatabase.chronology.size, 0, 'Transaction failure rolls back chronology too');
});

test('SQLite conflicting existing Requirement ID fails closed without overwrite', async () => {
  const candidate = uiDerivedCandidate();
  const person = createPerson({
    id: personId,
    classifications: ['seeker', 'real_estate_company'],
    name: 'Test Person',
    displayPhone: '50000000',
    notes: '',
  });
  const database = new InMemorySQLiteRequirementDatabase();
  const existing = { ...candidate, notes: 'different persisted payload' };
  database.requirements.set(candidate.id, JSON.stringify(existing));
  database.chronology.set(candidate.id, 1700000000000);
  const { persistence, store } = nativeRequirementSaveFacade(database, person);
  const outcome = await savePersonRequirement({
    candidate,
    baseline: null,
    store,
    navigate: () => assert.fail('Conflicting exact ID cannot navigate'),
  });

  assert.deepEqual(outcome, {
    status: 'storage_failure',
    retryAllowed: false,
    conflict: true,
    diagnostic: { stage: 'readback', code: 'readback_failed', location: ['requirement', 'id'] },
  });
  assert.equal(database.requirementInsertAttempts, 0, 'Pre-existing ID must not be inserted over');
  assert.deepEqual(await persistence.getRequirement(candidate.id), existing);
  assert.deepEqual([...database.requirements.keys()], [candidate.id]);
  assert.deepEqual([...database.chronology.keys()], [candidate.id]);
});

test('a Person without seeker classification is rejected before a Requirement write', async () => {
  const candidate = uiDerivedCandidate();
  const storage = new MemoryStorage();
  const person = createPerson({
    id: personId,
    classifications: ['real_estate_company'],
    name: 'Test Person',
    displayPhone: '50000000',
    notes: '',
  });
  const persistence = new WebRequirementStore(
    storage,
    () => locks,
    { getPerson: async id => id === personId ? person : null },
  );
  const store = {
    getPerson: async (id: string) => id === personId ? person : null,
    getRequirement: (id: string) => persistence.getRequirement(id),
    saveRequirement: (requirement: SeekerRequirement) => persistence.saveRequirement(requirement),
    updateRequirement: (expected: SeekerRequirement, replacement: SeekerRequirement) =>
      persistence.updateRequirement(expected, replacement),
  };
  let navigations = 0;
  const outcome = await savePersonRequirement({
    candidate,
    baseline: null,
    store,
    navigate: () => { navigations += 1; },
  });

  assert.deepEqual(outcome, { status: 'non_seeker' });
  assert.deepEqual(requirementSaveStageDiagnostic(outcome), {
    stage: 'ownership',
    code: 'person_not_seeker',
    location: ['person', 'classifications'],
  });
  assert.equal(requirementSaveIssueCode(outcome), 'save_non_seeker');
  assert.doesNotMatch(JSON.stringify(requirementSaveStageDiagnostic(outcome)), /person-seeker-company|real_estate_company/);
  assert.equal(storage.values.get(WEB_REQUIREMENTS_KEY), undefined);
  assert.equal(navigations, 0);
});

test('ownership lookup diagnostics expose only safe stage, code, and location', async () => {
  const candidate = uiDerivedCandidate();
  let writes = 0;
  const outcome = await savePersonRequirement({
    candidate,
    baseline: null,
    store: {
      getPerson: async () => { throw new Error('private Person data'); },
      getRequirement: async () => null,
      saveRequirement: async () => { writes += 1; },
      updateRequirement: async () => true,
    },
    navigate: () => assert.fail('lookup failure must not navigate'),
  });
  assert.deepEqual(outcome, {
    status: 'storage_failure',
    retryAllowed: true,
    diagnostic: { stage: 'ownership', code: 'storage_failure', location: ['person'] },
  });
  assert.deepEqual(requirementSaveStageDiagnostic(outcome), outcome.diagnostic);
  assert.equal(requirementSaveIssueCode(outcome), 'save_storage_failure');
  assert.doesNotMatch(JSON.stringify(outcome), /private Person data|person-seeker-company/);
  assert.equal(writes, 0);
});

test('an ambiguous write is confirmed by exact ID without a duplicate and conflicts fail closed', async () => {
  const candidate = uiDerivedCandidate();
  const written = new Map<string, SeekerRequirement>();
  let writes = 0;
  let navigations = 0;
  const store = {
    getPerson: async () => ({ id: personId, classifications: ['seeker'] }),
    getRequirement: async (id: string) => written.get(id) ?? null,
    saveRequirement: async (requirement: SeekerRequirement) => {
      writes += 1;
      written.set(requirement.id, requirement);
      throw new Error('ambiguous private storage detail');
    },
    updateRequirement: async () => true,
  };
  const recovered = await savePersonRequirement({
    candidate,
    baseline: null,
    store,
    navigate: () => { navigations += 1; },
  });
  assert.deepEqual(recovered, { status: 'saved' });
  assert.equal(writes, 1);
  assert.equal(navigations, 1);

  const conflictStore = {
    ...store,
    saveRequirement: async () => {
      writes += 1;
      throw new Error('REQUIREMENT_CHANGED');
    },
  };
  const conflict = await savePersonRequirement({
    candidate: { ...candidate, id: '22222222-2222-4222-8222-222222222222' },
    baseline: null,
    store: conflictStore,
    navigate: () => assert.fail('a conflicting ID cannot navigate'),
  });
  assert.deepEqual(conflict, {
    status: 'storage_failure',
    retryAllowed: false,
    conflict: true,
    diagnostic: { stage: 'write', code: 'edit_conflict', location: ['requirement', 'id'] },
  });
  assert.equal(writes, 2);
  assert.equal(requirementSaveIssueCode(conflict), 'save_conflict');
});