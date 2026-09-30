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
  normalizeLegacySeekerRequirementForRead,
  normalizeSeekerRequirement,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { SerialTaskQueue } from '@/services/serialTaskQueue';

export const WEB_REQUIREMENTS_KEY = '@viewstate_seeker_requirements_v1';
/** A single atomic envelope: valid records and exact raw recovery copies commit together. */
export const WEB_REQUIREMENTS_RECOVERY_KEY = '@viewstate_seeker_requirements_v2';
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

type RecoveryReason = 'invalid_requirement' | 'unknown_fields' | 'duplicate_id' | 'invalid_collection';
interface QuarantinedRequirement {
  readonly raw: unknown;
  readonly sourceIndex: number;
  readonly identity: string | null;
  readonly reason: RecoveryReason;
  readonly timestamp: number;
}
interface RequirementRecoveryCollection {
  readonly version: 2;
  /** Legacy readable rows may carry metadata; preserve their literal shape until edited. */
  readonly requirements: unknown[];
  readonly quarantine: QuarantinedRequirement[];
}
export interface RequirementRecoveryReport {
  readonly migrated: number;
  readonly quarantined: readonly { index: number; id: string | null; reason: RecoveryReason }[];
}

const knownRequirementKeys = new Set([
  'id', 'seekerId', 'purpose', 'propertyType', 'preferredAreaIds', 'preferredAreaMode',
  'budget', 'notes', 'bedroomsMinimum', 'bathroomsMinimum', 'centralAC',
  'preferredAmenities', 'preferredAmenityExclusions', 'catalogPreferences',
  'floorUse', 'masterBedroomsMinimum', 'driverRoom', 'rentalPeriodId',
  'occupancy', 'swimmingPool', 'gym', 'seaView',
]);

function classifyLegacyRecord(value: unknown): { value?: SeekerRequirement; reason?: RecoveryReason } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { reason: 'invalid_requirement' };
  const record = value as Record<string, unknown>;
  // Do not silently drop unknown fields or retired media/location metadata.
  if (Object.keys(record).some(key => !knownRequirementKeys.has(key))) return { reason: 'unknown_fields' };
  try {
    return { value: normalizeForStorage(value) };
  } catch {
    return { reason: 'invalid_requirement' };
  }
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

function normalizeForRead(value: unknown): SeekerRequirement {
  const result = normalizeLegacySeekerRequirementForRead(value, {
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
}

function parseRequirement(raw: string): SeekerRequirement {
  try {
    return normalizeForRead(JSON.parse(raw));
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
      if (normalized.seekerId) await assertSeekerOwnership(this.personStore, normalized.seekerId);
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
    const normalizedExpected = normalizeForStorage(expected);
    const normalized = normalizeForStorage(replacement);
    let updated = false;
    await this.mutations.enqueue(async () => {
      if (normalized.seekerId) await assertSeekerOwnership(this.personStore, normalized.seekerId);
      const db = this.database();
      const row = await db.getFirstAsync<{ data: string }>(
        `SELECT data FROM ${NATIVE_REQUIREMENTS_TABLE} WHERE id = ?`,
        [normalized.id],
      );
      if (!row) return;
      let matches = false;
      try {
        matches = JSON.stringify(parseRequirement(row.data)) === JSON.stringify(normalizedExpected);
      } catch {
        return;
      }
      if (!matches) return;
      const result = await this.database().runAsync(
        `UPDATE ${NATIVE_REQUIREMENTS_TABLE} SET data = ? WHERE id = ? AND data = ?`,
        [JSON.stringify(normalized), normalized.id, row.data],
      );
      updated = resultChanges(result) === 1;
    });
    return updated;
  }
}

export class WebRequirementStore implements RequirementStore {
  private readonly requirementsEnabled: boolean;
  private lastRecoveryReport: RequirementRecoveryReport = { migrated: 0, quarantined: [] };

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

  /** Metadata only: raw recovery entries never leave storage through this API. */
  getRecoveryReport(): RequirementRecoveryReport {
    return this.lastRecoveryReport;
  }

  private parseRecoveryCollection(raw: string): RequirementRecoveryCollection {
    try {
      const parsed = JSON.parse(raw) as RequirementRecoveryCollection;
      if (parsed?.version !== 2 || !Array.isArray(parsed.requirements)
        || !Array.isArray(parsed.quarantine)
        || parsed.requirements.some(item => {
          try { parseRequirementValue(item); return false; } catch { return true; }
        })
        || parsed.quarantine.some(item => !item || !('raw' in item)
          || !Number.isInteger(item.sourceIndex)
          || !['invalid_requirement', 'unknown_fields', 'duplicate_id', 'invalid_collection'].includes(item.reason))) {
        throw new Error('UNREADABLE_REQUIREMENT_RECOVERY');
      }
      return parsed;
    } catch {
      throw new Error('UNREADABLE_REQUIREMENT_RECOVERY');
    }
  }

  private async getAllRaw(): Promise<{
    readonly requirements: SeekerRequirement[];
    readonly hasUnreadable: boolean;
    readonly rawValues: unknown[];
    readonly recovery: RequirementRecoveryCollection | null;
  }> {
    if (!this.requirementsEnabled) return { requirements: [], hasUnreadable: false, rawValues: [], recovery: null };
    const recoveryRaw = await this.storage.getItem(WEB_REQUIREMENTS_RECOVERY_KEY);
    if (recoveryRaw !== null) {
      const recovery = this.parseRecoveryCollection(recoveryRaw);
      this.lastRecoveryReport = {
        migrated: 0,
        quarantined: recovery.quarantine.map(item => ({
          index: item.sourceIndex, id: item.identity, reason: item.reason,
        })),
      };
      return { requirements: recovery.requirements.map(parseRequirementValue), hasUnreadable: false, rawValues: recovery.requirements, recovery };
    }
    const raw = await this.storage.getItem(WEB_REQUIREMENTS_KEY);
    if (raw === null) return { requirements: [], hasUnreadable: false, rawValues: [], recovery: null };
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) throw new Error('not-array');
      let hasUnreadable = false;
      const seen = new Set<string>();
      const requirements = parsed.flatMap((value, index) => {
        let normalized: SeekerRequirement | null = null;
        try { normalized = parseRequirementValue(value); } catch { /* preserve unreadable source */ }
        if (!normalized || seen.has(normalized.id)) {
          hasUnreadable = true;
          const id = typeof value === 'object'
            && value !== null
            && typeof (value as { id?: unknown }).id === 'string'
            ? (value as { id: string }).id
            : `index-${index}`;
          this.reportUnreadable({ type: 'requirement', id });
          return [];
        }
        seen.add(normalized.id);
        return [normalized];
      });
      return { requirements, hasUnreadable, rawValues: parsed, recovery: null };
    } catch {
      this.reportUnreadable({ type: 'requirement', id: 'storage' });
      throw new Error('UNREADABLE_REQUIREMENT_STORAGE');
    }
  }

  private planRecovery(rawValues: readonly unknown[]): RequirementRecoveryCollection {
    const requirements: unknown[] = [];
    const quarantine: QuarantinedRequirement[] = [];
    const seen = new Set<string>();
    rawValues.forEach((raw, sourceIndex) => {
      let read: SeekerRequirement | null = null;
      try { read = parseRequirementValue(raw); } catch { /* preserve in quarantine */ }
      const reason = read && seen.has(read.id) ? 'duplicate_id' : read ? undefined : classifyLegacyRecord(raw).reason;
      if (read && !reason) {
        // Keep readable legacy metadata intact, and migrate canonicalizable rows only.
        const canonical = classifyLegacyRecord(raw);
        requirements.push(canonical.value ?? raw);
        seen.add(read.id);
      } else {
        quarantine.push({
          raw, sourceIndex,
          identity: typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string'
            ? (raw as { id: string }).id : null,
          reason: reason ?? 'invalid_requirement',
          timestamp: Date.now(),
        });
      }
    });
    return { version: 2, requirements, quarantine };
  }

  private async commitRecovery(collection: RequirementRecoveryCollection): Promise<void> {
    await this.storage.setItem(WEB_REQUIREMENTS_RECOVERY_KEY, JSON.stringify(collection));
    this.lastRecoveryReport = {
      migrated: collection.requirements.length,
      quarantined: collection.quarantine.map(item => ({
        index: item.sourceIndex, id: item.identity, reason: item.reason,
      })),
    };
  }

  async saveRequirement(requirement: SeekerRequirement): Promise<void> {
    if (!this.requirementsEnabled) throw new Error('REQUIREMENT_FEATURE_DISABLED');
    const normalized = normalizeForStorage(requirement);
    await this.withChronologyMutationLock(() =>
      this.withMutationLock(async () => {
        if (normalized.seekerId) await assertSeekerOwnership(this.personStore, normalized.seekerId);
        const current = await this.getAllRaw();
        const all = current.requirements;
        const existing = all.find(item => item.id === normalized.id);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
            throw new Error('REQUIREMENT_ID_ALREADY_EXISTS');
          }
          if (current.recovery || current.hasUnreadable) {
            if (current.hasUnreadable) await this.commitRecovery(this.planRecovery(current.rawValues));
            return;
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
        if (current.recovery || current.hasUnreadable) {
          const collection = current.recovery ?? this.planRecovery(current.rawValues);
          await this.commitRecovery({
            ...collection,
            requirements: [normalized, ...collection.requirements],
          });
          return;
        }
        current.rawValues.unshift(normalized);
        await this.storage.setItem(WEB_REQUIREMENTS_KEY, JSON.stringify(current.rawValues));
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
    const normalizedExpected = normalizeForStorage(expected);
    const normalized = normalizeForStorage(replacement);
    return this.withMutationLock(async () => {
      if (normalized.seekerId) await assertSeekerOwnership(this.personStore, normalized.seekerId);
      const current = await this.getAllRaw();
      const all = current.requirements;
      const matching = all
        .map((requirement, index) => ({ requirement, index }))
        .filter(item => item.requirement.id === expected.id);
      if (
        matching.length !== 1
        || JSON.stringify(matching[0].requirement) !== JSON.stringify(normalizedExpected)
      ) return false;
      if (current.recovery || current.hasUnreadable) {
        const collection = current.recovery ?? this.planRecovery(current.rawValues);
        await this.commitRecovery({
          ...collection,
          requirements: collection.requirements.map(item =>
            parseRequirementValue(item).id === normalized.id ? normalized : item),
        });
        return true;
      }
       current.rawValues[matching[0].index] = normalized;
       await this.storage.setItem(WEB_REQUIREMENTS_KEY, JSON.stringify(current.rawValues));
      return true;
    });
  }
}

function parseRequirementValue(value: unknown): SeekerRequirement {
  return normalizeForRead(value);
}