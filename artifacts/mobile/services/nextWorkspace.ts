/** Account-scoped presentation state only. Never stores copied property/contact data. */
export type RecentKind = "property" | "person" | "requirement";
export interface RecentWork {
  kind: RecentKind;
  id: string;
  at: string;
}
export interface NextWorkspaceState {
  version: 1;
  introduced: boolean;
  recent: RecentWork[];
}
export const NEXT_WORKSPACE_KEY = "viewstate-next-workspace-v1";
export const emptyNextWorkspace = (): NextWorkspaceState => ({
  version: 1,
  introduced: false,
  recent: [],
});
export function recentFromPath(
  path: string,
): Pick<RecentWork, "kind" | "id"> | null {
  const parts = path.split("/").filter(Boolean);
  const kind = parts[0];
  if (!["property", "person", "requirement"].includes(kind)) return null;
  const id =
    kind === "requirement" && parts[1] === "view" ? parts[2] : parts[1];
  if (!id || ["new", "undefined", "null"].includes(id)) return null;
  return { kind: kind as RecentKind, id };
}
export function parseNextWorkspace(raw: string | null): NextWorkspaceState {
  if (raw === null) return emptyNextWorkspace();
  const value = JSON.parse(raw);
  if (
    value?.version !== 1 ||
    typeof value.introduced !== "boolean" ||
    !Array.isArray(value.recent) ||
    value.recent.some(
      (r: RecentWork) =>
        !r ||
        !["property", "person", "requirement"].includes(r.kind) ||
        typeof r.id !== "string" ||
        !r.id ||
        typeof r.at !== "string" ||
        !Number.isFinite(Date.parse(r.at)),
    )
  )
    throw Error("NEXT_WORKSPACE_UNREADABLE");
  return {
    version: 1,
    introduced: value.introduced,
    recent: value.recent.slice(0, 12),
  };
}
export function recordRecent(
  state: NextWorkspaceState,
  item: RecentWork,
): NextWorkspaceState {
  return {
    ...state,
    recent: [
      item,
      ...state.recent.filter((r) => r.kind !== item.kind || r.id !== item.id),
    ].slice(0, 12),
  };
}
const writeQueues = new WeakMap<object, Promise<unknown>>();
export function createNextWorkspaceRepository(storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
}) {
  const readRaw = async () =>
    parseNextWorkspace(await storage.getItem(NEXT_WORKSPACE_KEY));
  const read = async () => {
    await (writeQueues.get(storage) ?? Promise.resolve()).catch(
      () => undefined,
    );
    return readRaw();
  };
  const update = (
    change: (state: NextWorkspaceState) => NextWorkspaceState,
  ) => {
    const operation = (writeQueues.get(storage) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const next = change(await readRaw());
        const raw = JSON.stringify(next);
        await storage.setItem(NEXT_WORKSPACE_KEY, raw);
        if ((await storage.getItem(NEXT_WORKSPACE_KEY)) !== raw)
          throw Error("NEXT_WORKSPACE_SAVE_UNCONFIRMED");
        return next;
      });
    writeQueues.set(storage, operation);
    return operation;
  };
  return { read, update };
}
