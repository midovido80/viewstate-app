/** Immutable local-data boundary. Never select an owner from editable profile data. */
export interface AccountStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
  withExclusiveLock?<T>(name: string, work: () => Promise<T>): Promise<T>;
}
export class AccountScopeClosedError extends Error {
  constructor() { super('ACCOUNT_SCOPE_CLOSED'); this.name = 'AccountScopeClosedError'; }
}
export function assertAccountId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('INVALID_ACCOUNT_ID');
  }
}
function createLocalScope(userId: string, guest: boolean) {
  assertAccountId(userId);
  const owner = userId.toLowerCase();
  const prefix = `@viewstate_${guest ? 'guest' : 'user'}_v1:${owner}:`;
  let active = true;
  const assertActive = () => { if (!active) throw new AccountScopeClosedError(); };
  return {
    userId: owner,
    kind: guest ? 'guest' as const : 'google' as const,
    databaseName: `viewstate-${guest ? 'guest' : 'user'}-${owner}.db`,
    mediaDatabaseName: `viewstate-${guest ? 'guest' : 'user'}-media-${owner}`,
    mediaDirectory: `viewstate-${guest ? 'guests' : 'users'}/${owner}`,
    assertActive,
    revoke() { active = false; },
    /** Captures this owner forever, even if a different user signs in mid-operation. */
    storage(source: AccountStorage): AccountStorage {
      const run = async <T>(operation: () => Promise<T>) => {
        assertActive();
        const result = await operation();
        assertActive();
        return result;
      };
      return {
        ...(source.getAllKeys ? { getAllKeys: () => run(async () => (await source.getAllKeys!()).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length))) } : {}),
        getItem: key => run(() => source.getItem(prefix + key)),
        setItem: (key, value) => run(() => source.setItem(prefix + key, value)),
        removeItem: key => run(() => source.removeItem(prefix + key)),
        ...(source.withExclusiveLock ? { withExclusiveLock: <T>(name: string, work: () => Promise<T>) => run(() => source.withExclusiveLock!(prefix + name, async () => { assertActive(); return work(); })) } : {}),
      };
    },
    /** Use on immutable per-account store instances, not a mutable global store. */
    guard<T extends object>(repository: T): T {
      const methods = new Map<PropertyKey, unknown>();
      return new Proxy(repository, {
        get(target, key, receiver) {
          assertActive();
          const value: unknown = Reflect.get(target, key, receiver);
          if (typeof value !== 'function') return value;
          if (!methods.has(key)) methods.set(key, (...args: unknown[]) => {
            assertActive();
            const result: unknown = Reflect.apply(value, target, args);
            if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
              return Promise.resolve(result).then(output => { assertActive(); return output; });
            }
            assertActive();
            return result;
          });
          return methods.get(key);
        },
      });
    },
  };
}
export function createAccountScope(userId: string) { return createLocalScope(userId, false); }
/** Local identity only: never a Supabase anonymous user or authentication credential. */
export function createGuestScope(localId: string) { return createLocalScope(localId, true); }
export type AccountScope = ReturnType<typeof createLocalScope>;
