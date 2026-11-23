export interface PushBinding {
  owner: string;
  token: string;
  secret?: string;
}
interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export function createPushRevocations(storage: Storage) {
  const key = "circle_push_revocations_v1";
  type State = { active: Record<string, PushBinding>; pending: PushBinding[] };
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(work: (state: State) => Promise<T>): Promise<T> {
    const result = tail
      .catch(() => undefined)
      .then(async () => {
        const raw = await storage.getItem(key);
        const state: State = raw
          ? JSON.parse(raw)
          : { active: {}, pending: [] };
        if (
          !state ||
          !state.active ||
          Array.isArray(state.active) ||
          !Array.isArray(state.pending) ||
          [...Object.values(state.active), ...state.pending].some(
            (binding) =>
              !binding ||
              typeof binding.owner !== "string" ||
              typeof binding.token !== "string" ||
              (binding.secret !== undefined &&
                !/^[a-f0-9]{64}$/.test(binding.secret)),
          )
        )
          throw Error("CIRCLE_PUSH_REVOCATIONS_DAMAGED");
        return work(state);
      });
    tail = result;
    return result;
  }
  const same = (left: PushBinding, right: PushBinding) =>
    left.owner === right.owner &&
    left.token === right.token &&
    left.secret === right.secret;
  const save = async (state: State) => {
    const raw = JSON.stringify(state);
    await storage.setItem(key, raw);
    if ((await storage.getItem(key)) !== raw)
      throw Error("CIRCLE_PUSH_REVOCATIONS_WRITE_FAILED");
  };
  const append = (state: State, binding: PushBinding) => {
    if (!state.pending.some((item) => same(item, binding)))
      state.pending.push(binding);
  };
  return {
    read: (owner: string) => exclusive(async (state) => state.active[owner]),
    assertReady: (token: string, owner?: string) =>
      exclusive(async (state) => {
        if (
          state.pending.some(
            (binding) =>
              binding.token === token &&
              (binding.secret || binding.owner === owner),
          )
        )
          throw Error("CIRCLE_PUSH_REVOCATION_PENDING");
      }),
    remember: (binding: PushBinding, legacyToken?: string | null) =>
      exclusive(async (state) => {
        const previous =
          state.active[binding.owner] ??
          (legacyToken
            ? { owner: binding.owner, token: legacyToken }
            : undefined);
        if (previous && !same(previous, binding)) append(state, previous);
        for (const [owner, active] of Object.entries(state.active)) {
          if (active.token === binding.token && !same(active, binding)) {
            append(state, active);
            delete state.active[owner];
          }
        }
        state.active[binding.owner] = binding;
        await save(state);
      }),
    prepare: (owner: string, legacyToken?: string | null) =>
      exclusive(async (state) => {
        const binding =
          state.active[owner] ??
          (legacyToken ? { owner, token: legacyToken } : undefined);
        if (binding) append(state, binding);
        delete state.active[owner];
        await save(state);
      }),
    async retry(
      revoke: (binding: PushBinding) => Promise<void>,
      legacyOwner?: string,
    ) {
      const pending = await exclusive(async (state) =>
        state.pending.filter(
          (binding) => binding.secret || binding.owner === legacyOwner,
        ),
      );
      for (const binding of pending) {
        try {
          await revoke(binding);
        } catch {
          continue;
        }
        await exclusive(async (state) => {
          state.pending = state.pending.filter((item) => !same(item, binding));
          await save(state);
        });
      }
    },
  };
}
