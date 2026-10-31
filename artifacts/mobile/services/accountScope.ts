/** Immutable local-data boundary. Never select an owner from editable profile data. */
export interface AccountStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export class AccountScopeClosedError extends Error {
  constructor() { super('ACCOUNT_SCOPE_CLOSED'); this.name = 'AccountScopeClosedError'; }
}
export function assertAccountId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('INVALID_ACCOUNT_ID');
  }
}
export function createAccountScope(userId: string) {
  assertAccountId(userId);
  const owner = userId.toLowerCase();
  const prefix = `@viewstate_user_v1:${owner}:`;
  let active = true;
  const assertActive = () => { if (!active) throw new AccountScopeClosedError(); };
  return {
    userId: owner,
    databaseName: `viewstate-user-${owner}.db`,
    mediaDatabaseName: `viewstate-user-media-${owner}`,
    mediaDirectory: `viewstate-users/${owner}`,
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
        getItem: key => run(() => source.getItem(prefix + key)),
        setItem: (key, value) => run(() => source.setItem(prefix + key, value)),
        removeItem: key => run(() => source.removeItem(prefix + key)),
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
export type AccountScope = ReturnType<typeof createAccountScope>;
