import {
  WorkspaceValidationError,
  type WorkspaceValidationIssue,
} from "./workspaceValidation";
/** Deterministic three-way merge. Local data itself is the durable pending queue. */
export type SyncRecords = Record<string, unknown>;
export interface CloudWorkspace {
  revision: number;
  records: SyncRecords;
}
export interface SyncConflict {
  key: string;
  base: unknown;
  local: unknown;
  remote: unknown;
  validationIssues?: WorkspaceValidationIssue[];
}
export function stableSync(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "[" + value.map(stableSync).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            stableSync((value as Record<string, unknown>)[key]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

function mergeRecordValue(
  base: unknown,
  local: unknown,
  remote: unknown,
): { value: unknown; conflict: boolean } {
  if (stableSync(local) === stableSync(remote))
    return { value: local, conflict: false };
  if (stableSync(local) === stableSync(base))
    return { value: remote, conflict: false };
  if (stableSync(remote) === stableSync(base))
    return { value: local, conflict: false };
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  // Arrays, concurrent creations and delete-versus-edit need an explicit decision.
  if (!object(base) || !object(local) || !object(remote))
    return { value: local, conflict: true };
  const entries: [string, unknown][] = [];
  for (const field of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const next = mergeRecordValue(base[field], local[field], remote[field]);
    if (next.conflict) return { value: local, conflict: true };
    if (next.value !== undefined) entries.push([field, next.value]);
  }
  return { value: Object.fromEntries(entries), conflict: false };
}
export function mergeWorkspace(
  base: SyncRecords,
  local: SyncRecords,
  remote: SyncRecords,
) {
  // Permanent deletion is monotonic across devices, including a stale remote edit
  // or a first sync with no local base. Keep ID-only fences in the private workspace.
  const deleted = new Set(
    [...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]
      .filter(
        (key) =>
          key.startsWith("property/") &&
          [base, local, remote].some((records) => {
            const value = records[key] as
              { deleted?: unknown; version?: unknown } | undefined;
            return (
              value?.deleted === true &&
              value.version === 1 &&
              Object.keys(value).length === 2
            );
          }),
      )
      .map((key) => key.slice("property/".length)),
  );
  const clean = (input: SyncRecords): SyncRecords => {
    const next = { ...input };
    for (const id of deleted) {
      delete next[`property/${id}`];
      delete next[`source/${id}`];
      delete next[`availability/${id}`];
      next[`property/${id}`] = { version: 1, deleted: true };
    }
    const removedTasks = new Set(
      Object.entries(input)
        .filter(
          ([key, value]) =>
            key.startsWith("task/") &&
            deleted.has((value as { propertyId?: string })?.propertyId ?? ""),
        )
        .map(([key]) => key.slice("task/".length)),
    );
    for (const [key, value] of Object.entries(next)) {
      const record = value as {
        propertyId?: string;
        propertyCoreId?: string;
        taskId?: string;
      } | null;
      if (
        (key.startsWith("link/") &&
          deleted.has(record?.propertyCoreId ?? "")) ||
        (key.startsWith("task/") && deleted.has(record?.propertyId ?? "")) ||
        (key.startsWith("contact/") && removedTasks.has(record?.taskId ?? ""))
      )
        delete next[key];
    }
    return next;
  };
  base = clean(base);
  local = clean(local);
  remote = clean(remote);
  const records: SyncRecords = {},
    conflicts: SyncConflict[] = [];
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const b = base[key],
      l = local[key],
      r = remote[key];
    const result = mergeRecordValue(b, l, r);
    const chosen = result.value;
    if (result.conflict) {
      conflicts.push({ key, base: b, local: l, remote: r });
    }
    if (chosen !== undefined) records[key] = chosen;
  }
  return { records, conflicts };
}
export interface SyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export const SYNC_STATE_KEY = "@viewstate_sync_state_v1";
export const SYNC_RECOVERY_KEY = "@viewstate_sync_damaged_recovery_v1";
export interface SyncState {
  version: 1;
  base: CloudWorkspace;
  conflicts: SyncConflict[];
  resolutions: Record<
    string,
    { remote: unknown; local: unknown } & (
      | { choice: "local" | "remote" }
      | {
          choice: "repair_missing_person";
          replacement: unknown;
          missingPersonId: string;
        }
    )
  >;
  lastSuccess?: string;
  recovering?: true;
}
export interface SyncLocal {
  read(): Promise<SyncRecords>;
  validate?(records: SyncRecords): Promise<void>;
  /** Must compare all expected records while excluding application writers. */
  apply(expected: SyncRecords, next: SyncRecords): Promise<void>;
}
export interface SyncCloud {
  read(): Promise<CloudWorkspace>;
  write(
    expectedRevision: number,
    records: SyncRecords,
  ): Promise<{ accepted: boolean; workspace: CloudWorkspace }>;
}
function prepareMerge(
  state: SyncState,
  snapshot: SyncRecords,
  remote: CloudWorkspace,
) {
  const effective = { ...snapshot },
    base = { ...state.base.records };
  for (const [key, resolution] of Object.entries(state.resolutions)) {
    if (resolution.choice === "repair_missing_person") continue;
    if (
      stableSync(snapshot[key]) === stableSync(resolution.local) &&
      stableSync(remote.records[key]) === stableSync(resolution.remote)
    ) {
      base[key] = remote.records[key];
      if (resolution.choice === "remote") {
        if (remote.records[key] === undefined) delete effective[key];
        else effective[key] = remote.records[key];
      }
    }
  }
  const unassignedCheck = mergeWorkspace(base, effective, remote.records);
  for (const [key, resolution] of Object.entries(state.resolutions)) {
    if (resolution.choice !== "repair_missing_person") continue;
    // Retry a cloud-acknowledged repair after an interrupted local apply as the same operation.
    const remoteMatches =
      stableSync(remote.records[key]) === stableSync(resolution.remote) ||
      stableSync(remote.records[key]) === stableSync(resolution.replacement);
    if (
      stableSync(snapshot[key]) !== stableSync(resolution.local) ||
      !remoteMatches ||
      unassignedCheck.records[`person/${resolution.missingPersonId}`] !==
        undefined
    )
      continue;
    base[key] = remote.records[key];
    effective[key] = resolution.replacement;
  }
  return { ...mergeWorkspace(base, effective, remote.records), base };
}
export function createWorkspaceSync(
  storage: SyncStorage,
  local: SyncLocal,
  cloud: SyncCloud,
  assertActive: () => void,
) {
  let running: Promise<SyncState> | undefined;
  const readState = async (): Promise<SyncState> => {
    const raw = await storage.getItem(SYNC_STATE_KEY);
    if (!raw)
      return {
        version: 1,
        base: { revision: 0, records: {} },
        conflicts: [],
        resolutions: {},
      };
    let s: SyncState;
    try {
      s = JSON.parse(raw) as SyncState;
    } catch {
      throw new Error("SYNC_STATE_DAMAGED");
    }
    const object = (value: unknown): value is Record<string, unknown> =>
      !!value && typeof value === "object" && !Array.isArray(value);
    if (
      !object(s) ||
      s.version !== 1 ||
      !Number.isSafeInteger(s.base?.revision) ||
      s.base.revision < 0 ||
      !object(s.base.records) ||
      !Array.isArray(s.conflicts) ||
      !s.conflicts.every((c) => object(c) && typeof c.key === "string") ||
      !object(s.resolutions) ||
      !Object.values(s.resolutions).every(
        (r) =>
          object(r) &&
          ["local", "remote", "repair_missing_person"].includes(
            r.choice as string,
          ),
      ) ||
      (s.recovering !== undefined && s.recovering !== true)
    )
      throw new Error("SYNC_STATE_DAMAGED");
    return s;
  };
  const save = async (s: SyncState) => {
    assertActive();
    const raw = JSON.stringify(s);
    await storage.setItem(SYNC_STATE_KEY, raw);
    assertActive();
    if ((await storage.getItem(SYNC_STATE_KEY)) !== raw)
      throw new Error("SYNC_STATE_WRITE_FAILED");
  };
  async function run() {
    let state = await readState();
    assertActive();
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await local.read();
      assertActive();
      const remote = await cloud.read();
      assertActive();
      if (state.recovering) {
        state.conflicts = [
          ...new Set([
            ...Object.keys(snapshot),
            ...Object.keys(remote.records),
          ]),
        ]
          .filter(
            (key) =>
              stableSync(snapshot[key]) !== stableSync(remote.records[key]),
          )
          .filter((key) => {
            const resolution = state.resolutions[key];
            return (
              !resolution ||
              stableSync(resolution.local) !== stableSync(snapshot[key]) ||
              stableSync(resolution.remote) !== stableSync(remote.records[key])
            );
          })
          .map((key) => ({
            key,
            base: undefined,
            local: snapshot[key],
            remote: remote.records[key],
          }));
        if (state.conflicts.length) {
          await save(state);
          return state;
        }
      }
      const merged = prepareMerge(state, snapshot, remote),
        base = merged.base;
      if (merged.conflicts.length) {
        state = { ...state, conflicts: merged.conflicts };
        await save(state);
        return state;
      }
      try {
        await local.validate?.(merged.records);
      } catch (error) {
        if (
          /SYNC_(INVALID_(REQUIREMENT|PROPERTY|SOURCE|LINK|WORKSPACE|DELETION)|CONTACT_CONFLICT)/.test(
            (error as Error).message,
          )
        ) {
          state = {
            ...state,
            conflicts: (error instanceof WorkspaceValidationError
              ? [...new Set(error.issues.flatMap((issue) => issue.keys))]
              : [
                  ...new Set([
                    ...Object.keys(snapshot),
                    ...Object.keys(remote.records),
                  ]),
                ]
            )
              .filter((key) =>
                error instanceof WorkspaceValidationError
                  ? snapshot[key] !== undefined ||
                    remote.records[key] !== undefined
                  : stableSync(snapshot[key]) !==
                    stableSync(remote.records[key]),
              )
              .map((key) => ({
                key,
                base: base[key],
                local: snapshot[key],
                remote: remote.records[key],
                ...(error instanceof WorkspaceValidationError
                  ? {
                      validationIssues: error.issues.filter((issue) =>
                        issue.keys.includes(key),
                      ),
                    }
                  : {}),
              })),
          };
          if (state.conflicts.length) {
            await save(state);
            return state;
          }
        }
        throw error;
      }
      assertActive();
      if (stableSync(await local.read()) !== stableSync(snapshot)) continue;
      const outcome =
        stableSync(merged.records) === stableSync(remote.records)
          ? { accepted: true, workspace: remote }
          : await cloud.write(remote.revision, merged.records);
      assertActive();
      if (!outcome.accepted) continue;
      // The accepted cloud version is durable. A crash/local race before apply re-merges from the old base next time.
      await local.apply(snapshot, merged.records);
      assertActive();
      state = {
        version: 1,
        base: outcome.workspace,
        conflicts: [],
        resolutions: {},
        lastSuccess: new Date().toISOString(),
      };
      await save(state);
      return state;
    }
    throw new Error("SYNC_RETRY_AFTER_CONCURRENT_EDIT");
  }
  return {
    readState,
    async recoverDamagedState() {
      if (running) await running.catch(() => undefined);
      try {
        return await readState();
      } catch (error) {
        if ((error as Error).message !== "SYNC_STATE_DAMAGED") throw error;
      }
      const raw = await storage.getItem(SYNC_STATE_KEY);
      const snapshot = await local.read();
      assertActive();
      const remote = await cloud.read();
      assertActive();
      const backup = JSON.stringify({
        version: 1,
        damaged: raw,
        local: snapshot,
        remote,
      });
      // Keep the first evidence intact if recovery is interrupted and retried.
      const backupKey = SYNC_RECOVERY_KEY + ":" + new Date().toISOString();
      await storage.setItem(backupKey, backup);
      assertActive();
      if ((await storage.getItem(backupKey)) !== backup)
        throw new Error("SYNC_STATE_WRITE_FAILED");
      if (
        (await storage.getItem(SYNC_STATE_KEY)) !== raw ||
        stableSync(await local.read()) !== stableSync(snapshot)
      )
        throw new Error("SYNC_CONFLICT_CHANGED");
      const state: SyncState = {
        version: 1,
        base: remote,
        resolutions: {},
        recovering: true,
        conflicts: [
          ...new Set([
            ...Object.keys(snapshot),
            ...Object.keys(remote.records),
          ]),
        ]
          .filter(
            (key) =>
              stableSync(snapshot[key]) !== stableSync(remote.records[key]),
          )
          .map((key) => ({
            key,
            base: undefined,
            local: snapshot[key],
            remote: remote.records[key],
          })),
      };
      await save(state);
      return state;
    },
    sync() {
      if (!running)
        running = run().finally(() => {
          running = undefined;
        });
      return running;
    },
    async repairMissingRequirementPerson(key: string) {
      if (running) await running;
      const state = await readState();
      const conflict = state.conflicts.find((item) => item.key === key);
      if (
        !key.startsWith("requirement/") ||
        !conflict?.validationIssues?.some(
          (issue) => issue.code === "missing_requirement_person",
        )
      )
        throw new Error("SYNC_CONFLICT_CHANGED");
      const snapshot = await local.read();
      assertActive();
      const remote = await cloud.read();
      assertActive();
      if (
        stableSync(snapshot[key]) !== stableSync(conflict.local) ||
        stableSync(remote.records[key]) !== stableSync(conflict.remote)
      )
        throw new Error("SYNC_CONFLICT_CHANGED");
      const merged = prepareMerge(state, snapshot, remote);
      const request = merged.records[key] as
        Record<string, unknown> | undefined;
      if (
        merged.conflicts.length ||
        !request ||
        typeof request.seekerId !== "string" ||
        merged.records[`person/${request.seekerId}`] !== undefined
      )
        throw new Error("SYNC_CONFLICT_CHANGED");
      const replacement = { ...request };
      delete replacement.seekerId;
      state.resolutions[key] = {
        local: snapshot[key],
        remote: remote.records[key],
        choice: "repair_missing_person",
        replacement,
        missingPersonId: request.seekerId,
      };
      await save(state);
    },
    async resolve(key: string, choice: "local" | "remote") {
      if (running) await running;
      const state = await readState(),
        conflict = state.conflicts.find((c) => c.key === key);
      if (!conflict) throw new Error("SYNC_CONFLICT_CHANGED");
      state.resolutions[key] = {
        remote: conflict.remote,
        local: conflict.local,
        choice,
      };
      state.conflicts = state.conflicts.filter((c) => c.key !== key);
      await save(state);
    },
  };
}
