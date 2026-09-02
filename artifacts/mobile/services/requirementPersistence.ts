import type { SQLiteBindParams } from 'expo-sqlite';
import {
  getAreaById,
} from '@/constants/kuwait-areas';
import {
  addWebChronology,
  createCreationTimestamp,
  getWebChronology,
  sortByChronology,
  UNKNOWN_CREATION_TIMESTAMP,
} from '@/services/chronology';
import type { Person } from '@/services/people';
import type { UnreadableRecord } from '@/services/localRecordParser';
import {
  normalizeSeekerRequirement,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { SerialTaskQueue } from '@/services/serialTaskQueue';

export const WEB_REQUIREMENTS_KEY = '@viewstate_seeker_requirements_v1';
export const NATIVE_REQUIREMENTS_TABLE = 'seeker_requirements';
export const NATIVE_REQUIREMENT_CHRONOLOGY_TABLE =
  'requirement_creation_chronology';
export const PERSON_REQUIREMENT_MUTATION_LOCK =
  'viewstate-person-requirement-mutation';

export interface RequirementPersistenceOptions {
  readonly requirementsEnabled?: boolean;
}

export interface RequirementStore {
  saveRequirement(requirement: SeekerRequirement): Promise<void>;
  getRequirement(id: string): Promise<SeekerRequirement | null>;
  getRequirements(): Promise<SeekerRequirement[]>;
  getRequirementsForSeeker(seekerId: string): Promise<SeekerRequirement[]>;
  updateRequirement(
    expected: SeekerRequirement,
    replacement: SeekerRequirement,
  ): Promise<boolean>;
}

export interface RequirementOwnershipReader {
  getPerson(id: string): Promise<Person | null>;
}

interface SQLiteRequirementDatabase {
  getFirstAsync<T>(
    source: string,
    params: SQLiteBindParams,
  ): Promise<T | null>;
  getAllAsync<T>(
    source: string,
    params?: SQLiteBindParams,
  ): Promise<T[]>;
  runAsync(source: string, params: SQLiteBindParams): Promise<unknown>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

interface RequirementLockManager {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<T>,
  ): Promise<T>;
}

interface RequirementKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function canonicalAreaId(id: string): boolean {
  return getAreaById(id) !== undefined;
}

function invalidRequirementError(
  issues: readonly { code: string; path: readonly string[] }[],
): Error {
  const details = issues
    .map(item => `${item.code}:${item.path.join('.')}`)
    .join(',');
  return new Error(`INVALID_REQUIREMENT${details ? `:${details}` : ''}`);
}

function normalizeForStorage(value: unknown): SeekerRequirement {
  const result = normalizeSeekerRequirement(value, {
    isCanonicalAreaId: canonicalAreaId,
  });
  if (!result.ok) throw invalidRequirementError(result.issues);
  return result.value;
}

async function assertSeekerOwnership(
  personStore: RequirementOwnershipReader,
  seekerId: string,
): Promise<void> {
  const person = await personStore.getPerson(seekerId);
  if (!person) throw new Error('REQUIREMENT_SEEKER_NOT_FOUND');
  if (!person.classifications.includes('seeker')) {
    throw new Error('REQUIREMENT_SEEKER_CLASSIFICATION_REQUIRED');
  }
}

function parseRequirement(raw: string): SeekerRequirement {
  try {
    return normalizeForStorage(JSON.parse(raw));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('INVALID_REQUIREMENT')) {
      throw new Error('UNREADABLE_REQUIREMENT');
    }
    throw new Error('UNREADABLE_REQUIREMENT');
  }
}

function parseRequirementRow(row: { id: string; data: string }): SeekerRequirement {
  const requirement = parseRequirement(row.data);
  if (requirement.id !== row.id) throw new Error('UNREADABLE_REQUIREMENT');
  return requirement;
}

function resultChanges(result: unknown): number {
  return typeof result === 'object'
    && result !== null
    && typeof (result as { changes?: unknown }).changes === 'number'
    ? (result as { changes: number }).changes
    : 0;
}

export class SQLiteRequirementStore implements RequirementStore {
  private readonly requirementsEnabled: boolean;

  constructor(
    private readonly database: () => SQLiteRequirementDatabase,
    private readonly personStore: RequirementOwnershipReader,
    private readonly reportUnreadable: (warning: UnreadableRecord) => void = () => undefined,
    private readonly mutations: SerialTaskQueue = new SerialTaskQueue(),
    options: RequirementPersistenceOptions = {},
  ) {
    this.requirementsEnabled = options.requirementsEnabled ?? true;
  }

  private parseRow(row: { id: string; data: string }): SeekerRequirement | null {
    try {
      return parseRequirementRow(row);
    } catch {
      this.reportUnreadable({ type: 'requirement', id: row.id });
      return null;
    }
  }

  async saveRequirement(requirement: SeekerRequirement): Promise<void> {
    if (!this.requirementsEnabled) throw new Error('REQUIREMENT_FEATURE_DISABLED');
    const normalized = normalizeForStorage(requirement);
    const serialized = JSON.stringify(normalized);
    await this.mutations.enqueue(async () => {
      await assertSeekerOwnership(this.personStore, normalized.seekerId);
      const db = this.database();
      const existing = await db.getFirstAsync<{ data: string }>(
        `SELECT data FROM ${NATIVE_REQUIREMENTS_TABLE} WHERE id = ?`,
        [normalized.id],
      );
      if (existing) {
        if (existing.data !== serialized) {
          throw new Error('REQUIREMENT_ID_ALREADY_EXISTS');
        }
        return;
      }
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO ${NATIVE_REQUIREMENTS_TABLE} (id, data) VALUES (?, ?)`,
          [normalized.id, serialized],
        );
        await db.runAsync(
          `INSERT OR IGNORE INTO ${NATIVE_REQUIREMENT_CHRONOLOGY_TABLE} (id, created_at) VALUES (?, ?)`,
          [normalized.id, createCreationTimestamp()],
        );
      });
    });
  }

  async getRequirement(id: string): Promise<SeekerRequirement | null> {
    if (!this.requirementsEnabled) return null;
    const row = await this.database().getFirstAsync<{ id: string; data: string }>(
      `SELECT id, data FROM ${NATIVE_REQUIREMENTS_TABLE} WHERE id = ?`,
      [id],
    );
    return row ? this.parseRow(row) : null;
  }

  async getRequirements(): Promise<SeekerRequirement[]> {
    if (!this.requirementsEnabled) return [];
    const db = this.database();
    const [rows, chronology] = await Promise.all([
      db.getAllAsync<{ id: string; data: string }>(
        `SELECT id, data FROM ${NATIVE_REQUIREMENTS_TABLE}`,
        [],
      ),
      db.getAllAsync<{ id: string; created_at: number }>(
        `SELECT id, created_at FROM ${NATIVE_REQUIREMENT_CHRONOLOGY_TABLE}`,
        [],
      ),
    ]);
    const chronologyById = new Map(chronology.map(row => [row.id, row.created_at]));
    return sortByChronology(
      rows.flatMap(row => {
        const requirement = this.parseRow(row);
        return requirement
          ? [{
            requirement,
            entry: {
              id: row.id,
              createdAt: chronologyById.get(row.id) ?? UNKNOWN_CREATION_TIMESTAMP,
            },
          }]
          : [];
      }),
      item => item.entry,
    ).map(item => item.requirement);
  }

  async getRequirementsForSeeker(seekerId: string): Promise<SeekerRequirement[]> {
    return (await this.getRequirements()).filter(
      requirement => requirement.seekerId === seekerId,
    );
  }

  async updateRequirement(
    expected: SeekerRequirement,
    replacement: SeekerRequirement,
  ): Promise<boolean> {
    if (!this.requirementsEnabled) throw new Error('REQUIREMENT_FEATURE_DISABLED');
    if (expected.id !== replacement.id) return false;
    const normalized = normalizeForStorage(replacement);
    let updated = false;
    await this.mutations.enqueue(async () => {
      await assertSeekerOwnership(this.personStore, normalized.seekerId);
      const result = await this.database().runAsync(
        `UPDATE ${NATIVE_REQUIREMENTS_TABLE} SET data = ? WHERE id = ? AND data = ?`,
        [JSON.stringify(normalized), normalized.id, JSON.stringify(expected)],
      );
      updated = resultChanges(result) === 1;
    });
    return updated;
  }
}

export class WebRequirementStore implements RequirementStore {
  private readonly requirementsEnabled: boolean;

  constructor(
    private readonly storage: RequirementKeyValueStorage,
    private readonly getLocks: () => RequirementLockManager | null,
    private readonly personStore: RequirementOwnershipReader,
    private readonly reportUnreadable: (warning: UnreadableRecord) => void = () => undefined,
    options: RequirementPersistenceOptions = {},
  ) {
    this.requirementsEnabled = options.requirementsEnabled ?? true;
  }

  private async withMutationLock<T>(work: () => Promise<T>): Promise<T> {
    const locks = this.getLocks();
    if (!locks) throw new Error('SAFE_WEB_MUTATION_UNSUPPORTED');
    return locks.request(PERSON_REQUIREMENT_MUTATION_LOCK, { mode: 'exclusive' }, work);
  }

  private async withChronologyMutationLock<T>(work: () => Promise<T>): Promise<T> {
    const locks = this.getLocks();
    if (!locks) return work();
    return locks.request('viewstate-chronology-mutation', { mode: 'exclusive' }, work);
  }

  private async getAllRaw(): Promise<{
    readonly requirements: SeekerRequirement[];
    readonly hasUnreadable: boolean;
  }> {
    if (!this.requirementsEnabled) return { requirements: [], hasUnreadable: false };
    const raw = await this.storage.getItem(WEB_REQUIREMENTS_KEY);
    if (raw === null) return { requirements: [], hasUnreadable: false };
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) throw new Error('not-array');
      let hasUnreadable = false;
      const requirements = parsed.flatMap((value, index) => {
        try {
          return [parseRequirementValue(value)];
        } catch {
          hasUnreadable = true;
          const id = typeof value === 'object'
            && value !== null
            && typeof (value as { id?: unknown }).id === 'string'
            ? (value as { id: string }).id
            : `index-${index}`;
          this.reportUnreadable({ type: 'requirement', id });
          return [];
        }
      });
      return { requirements, hasUnreadable };
    } catch {
      this.reportUnreadable({ type: 'requirement', id: 'storage' });
      throw new Error('UNREADABLE_REQUIREMENT_STORAGE');
    }
  }

  async saveRequirement(requirement: SeekerRequirement): Promise<void> {
    if (!this.requirementsEnabled) throw new Error('REQUIREMENT_FEATURE_DISABLED');
    const normalized = normalizeForStorage(requirement);
    await this.withChronologyMutationLock(() =>
      this.withMutationLock(async () => {
        await assertSeekerOwnership(this.personStore, normalized.seekerId);
        const current = await this.getAllRaw();
        if (current.hasUnreadable) throw new Error('UNREADABLE_REQUIREMENT_STORAGE');
        const all = current.requirements;
        const existing = all.find(item => item.id === normalized.id);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
            throw new Error('REQUIREMENT_ID_ALREADY_EXISTS');
          }
          const chronology = await getWebChronology(this.storage, 'requirement');
          await addWebChronology(
            this.storage,
            'requirement',
            normalized.id,
            chronology.get(normalized.id) ?? UNKNOWN_CREATION_TIMESTAMP,
          );
          return;
        }
        await addWebChronology(
          this.storage,
          'requirement',
          normalized.id,
          createCreationTimestamp(),
        );
        all.unshift(normalized);
        await this.storage.setItem(WEB_REQUIREMENTS_KEY, JSON.stringify(all));
      }));
  }

  async getRequirement(id: string): Promise<SeekerRequirement | null> {
    if (!this.requirementsEnabled) return null;
    const matching = (await this.getAllRaw()).requirements.filter(item => item.id === id);
    if (matching.length > 1) throw new Error('DUPLICATE_REQUIREMENT');
    return matching[0] ?? null;
  }

  async getRequirements(): Promise<SeekerRequirement[]> {
    if (!this.requirementsEnabled) return [];
    const [requirements, chronology] = await Promise.all([
      this.getAllRaw(),
      getWebChronology(this.storage, 'requirement'),
    ]);
    return sortByChronology(requirements.requirements, requirement => ({
      id: requirement.id,
      createdAt: chronology.get(requirement.id) ?? UNKNOWN_CREATION_TIMESTAMP,
    }));
  }

  async getRequirementsForSeeker(seekerId: string): Promise<SeekerRequirement[]> {
    return (await this.getRequirements()).filter(
      requirement => requirement.seekerId === seekerId,
    );
  }

  async updateRequirement(
    expected: SeekerRequirement,
    replacement: SeekerRequirement,
  ): Promise<boolean> {
    if (!this.requirementsEnabled) throw new Error('REQUIREMENT_FEATURE_DISABLED');
    if (expected.id !== replacement.id) return false;
    const normalized = normalizeForStorage(replacement);
    return this.withMutationLock(async () => {
      await assertSeekerOwnership(this.personStore, normalized.seekerId);
      const current = await this.getAllRaw();
      if (current.hasUnreadable) throw new Error('UNREADABLE_REQUIREMENT_STORAGE');
      const all = current.requirements;
      const matching = all
        .map((requirement, index) => ({ requirement, index }))
        .filter(item => item.requirement.id === expected.id);
      if (
        matching.length !== 1
        || JSON.stringify(matching[0].requirement) !== JSON.stringify(expected)
      ) return false;
      all[matching[0].index] = normalized;
      await this.storage.setItem(WEB_REQUIREMENTS_KEY, JSON.stringify(all));
      return true;
    });
  }
}

function parseRequirementValue(value: unknown): SeekerRequirement {
  return normalizeForStorage(value);
}