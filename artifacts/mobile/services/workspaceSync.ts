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
export function mergeWorkspace(
  base: SyncRecords,
  local: SyncRecords,
  remote: SyncRecords,
) {
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
    let chosen: unknown;
    if (stableSync(l) === stableSync(r)) chosen = l;
    else if (stableSync(l) === stableSync(b)) chosen = r;
    else if (stableSync(r) === stableSync(b)) chosen = l;
    else {
      conflicts.push({ key, base: b, local: l, remote: r });
      chosen = l;
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
export interface SyncState {
  version: 1;
  base: CloudWorkspace;
  conflicts: SyncConflict[];
  resolutions: Record<
    string,
    { remote: unknown; local: unknown; choice: "local" | "remote" }
  >;
  lastSuccess?: string;
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
    const s = JSON.parse(raw) as SyncState;
    if (
      s.version !== 1 ||
      !Number.isSafeInteger(s.base?.revision) ||
      !s.base.records ||
      !Array.isArray(s.conflicts) ||
      !s.resolutions
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
      const effective = { ...snapshot },
        base = { ...state.base.records };
      for (const [key, resolution] of Object.entries(state.resolutions)) {
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
      const merged = mergeWorkspace(base, effective, remote.records);
      if (merged.conflicts.length) {
        state = { ...state, conflicts: merged.conflicts };
        await save(state);
        return state;
      }
      try {
        await local.validate?.(merged.records);
      } catch (error) {
        if (
          /SYNC_(INVALID_(REQUIREMENT|SOURCE|LINK)|CONTACT_CONFLICT)/.test(
            (error as Error).message,
          )
        ) {
          state = {
            ...state,
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
                base: base[key],
                local: snapshot[key],
                remote: remote.records[key],
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
    sync() {
      if (!running)
        running = run().finally(() => {
          running = undefined;
        });
      return running;
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
