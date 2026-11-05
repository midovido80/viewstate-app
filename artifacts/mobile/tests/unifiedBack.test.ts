import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createFormSession } from "../services/formSession.ts";
import { createAccountScope } from "../services/accountScope.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (k: string) => values.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: async (k: string) => {
      values.delete(k);
    },
  };
}
test("local form drafts survive reopening, isolate account and form, and never create records", async () => {
  const disk = storage(),
    a = createAccountScope("179f829a-eb0d-44ad-8e64-e64a87900c41"),
    b = createAccountScope("29f45c92-1f5e-472b-b59c-06f24ba60eba");
  const sa = a.storage(disk),
    sb = b.storage(disk);
  await createFormSession(sa, "requirement:new").write({
    step: 4,
    notes: "غير مكتمل",
    bedrooms: "",
  });
  assert.deepEqual(await createFormSession(sa, "requirement:new").read(), {
    step: 4,
    notes: "غير مكتمل",
    bedrooms: "",
  });
  assert.equal(await createFormSession(sb, "requirement:new").read(), null);
  assert.equal(await createFormSession(sa, "person:new").read(), null);
  await createFormSession(sb, "requirement:new").write({ step: 3 });
  await createFormSession(sa, "requirement:new").clear();
  assert.deepEqual(await createFormSession(sb, "requirement:new").read(), {
    step: 3,
  });
  a.revoke();
  await assert.rejects(
    createFormSession(sa, "requirement:new").write({ step: 1 }),
    /ACCOUNT_SCOPE_CLOSED/,
  );
});
test("draft readback detects silent loss, corrupt data is retained, and queued writes cannot resurrect a discarded draft", async () => {
  const disk = storage(),
    repo = createFormSession(disk, "studio");
  disk.values.set(repo.key, "{broken");
  await assert.rejects(repo.read());
  assert.equal(disk.values.get(repo.key), "{broken");
  const one = repo.write({ name: "first" }),
    two = repo.write({ name: "second" }),
    clear = repo.clear();
  await Promise.all([one, two, clear]);
  assert.equal(await repo.read(), null);
  await assert.rejects(
    createFormSession({ ...disk, setItem: async () => {} }, "loss").write({
      name: "x",
    }),
    /UNCONFIRMED/,
  );
  await repo.write({ name: "retained" });
  await assert.rejects(
    createFormSession(
      { ...disk, removeItem: async () => {} },
      "studio",
    ).clear(),
    /CLEAR_UNCONFIRMED/,
  );
  assert.deepEqual(await repo.read(), { name: "retained" });
});

// Execute the production hooks against a deterministic hook scheduler. No duplicated Back policy.
function harness() {
  const cells: any[] = [],
    effects: Array<() => void> = [],
    calls: unknown[] = [],
    disk = storage();
  let cursor = 0,
    dirty = false,
    focused = true,
    output: any,
    renderHook: () => unknown,
    prevent: { enabled: boolean; callback: Function },
    hardware: (() => boolean) | undefined;
  const equal = (a: any[], b: any[]) =>
    a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useRef: (value: any) => {
      const i = cursor++;
      return cells[i] ?? (cells[i] = { current: value });
    },
    useState: (value: any) => {
      const i = cursor++;
      if (!cells[i])
        cells[i] = { value: typeof value === "function" ? value() : value };
      return [
        cells[i].value,
        (v: any) => {
          const next = typeof v === "function" ? v(cells[i].value) : v;
          if (!Object.is(next, cells[i].value)) {
            cells[i].value = next;
            dirty = true;
          }
        },
      ];
    },
    useMemo: (fn: Function, deps: any[]) => {
      const i = cursor++;
      if (!cells[i] || !equal(cells[i].deps, deps))
        cells[i] = { deps, value: fn() };
      return cells[i].value;
    },
    useEffect: (fn: Function, deps: any[]) => {
      const i = cursor++;
      if (!cells[i] || !equal(cells[i].deps, deps)) {
        const previous = cells[i];
        cells[i] = { deps, cleanup: previous?.cleanup };
        effects.push(() => {
          previous?.cleanup?.();
          cells[i].cleanup = fn();
        });
      }
    },
    useCallback: (fn: Function, deps: any[]) => react.useMemo(() => fn, deps),
  };
  const navigation = { dispatch: (a: any) => calls.push(a) };
  const router = {
    canGoBack: () => true,
    back: () => calls.push("back"),
    replace: (p: any) => calls.push(p),
  };
  const requireMock = (id: string): any =>
    id === "react"
      ? react
      : id === "react-native"
        ? {
            Platform: { OS: "android" },
            Alert: { alert: (...a: any[]) => calls.push(["alert", ...a]) },
            BackHandler: {
              addEventListener: (_: string, fn: () => boolean) => {
                hardware = fn;
                return {
                  remove: () => {
                    hardware = undefined;
                  },
                };
              },
            },
          }
        : id === "expo-router"
          ? {
              useNavigation: () => navigation,
              useRouter: () => router,
              useFocusEffect: (cb: Function) =>
                react.useEffect(
                  () => (focused ? cb() : undefined),
                  [focused, cb],
                ),
            }
          : id === "@react-navigation/native"
            ? {
                useIsFocused: () => focused,
                usePreventRemove: (enabled: boolean, callback: Function) => {
                  prevent = { enabled, callback };
                },
              }
            : id.includes("UserDataContext")
              ? { useUserData: () => ({ storage: disk }) }
              : id.includes("I18nContext")
                ? { useI18n: () => ({ language: "ar" }) }
                : id.includes("formSession")
                  ? { createFormSession }
                  : (() => {
                      throw Error(id);
                    })();
  const compiled = ts.transpileModule(
    readFileSync("hooks/useDraftBack.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const mod = { exports: {} as any };
  new Function("require", "module", "exports", compiled)(
    requireMock,
    mod,
    mod.exports,
  );
  const flush = () => {
    let limit = 20;
    do {
      dirty = false;
      cursor = 0;
      output = renderHook();
      while (effects.length) effects.shift()!();
      if (--limit === 0) throw Error("render loop");
    } while (dirty);
    return output;
  };
  return {
    hooks: mod.exports,
    calls,
    disk,
    router,
    render(fn?: () => unknown) {
      if (fn) renderHook = fn;
      return flush();
    },
    async settle() {
      for (let i = 0; i < 12; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        flush();
      }
      return output;
    },
    native() {
      assert.ok(prevent!.enabled);
      prevent!.callback({ data: { action: { type: "GO_BACK" } } });
    },
    hardware() {
      assert.ok(hardware);
      return hardware!();
    },
    focus(value: boolean) {
      focused = value;
      flush();
    },
    get blocked() {
      return prevent!.enabled;
    },
    get hasHardware() {
      return !!hardware;
    },
  };
}
test("header, Android and native gesture Back each consume one wizard step without saving or navigating", async () => {
  for (const input of ["header", "hardware", "gesture"]) {
    const h = harness();
    let step = 3,
      writes = 0;
    const api = h.render(() =>
      h.hooks.useDraftBack({
        persist: async () => {
          writes++;
        },
        step: () => {
          if (step > 1) {
            step--;
            return true;
          }
          return false;
        },
      }),
    );
    if (input === "header") api.back();
    else if (input === "hardware") assert.equal(h.hardware(), true);
    else h.native();
    await h.settle();
    assert.equal(step, 2);
    assert.equal(writes, 0);
    assert.deepEqual(h.calls, []);
  }
});
test("first-step Back waits for durable save, ignores repeated taps, then replays exact native action", async () => {
  const h = harness();
  let release!: () => void,
    writes = 0;
  h.render(() =>
    h.hooks.useDraftBack({
      persist: () => {
        writes++;
        return new Promise<void>((r) => (release = r));
      },
    }),
  );
  h.native();
  h.hardware();
  assert.equal(writes, 1);
  assert.deepEqual(h.calls, []);
  assert.equal(h.blocked, true);
  release();
  await h.settle();
  assert.deepEqual(h.calls, [{ type: "GO_BACK" }]);
  assert.equal(h.blocked, false);
});
test("failed local save keeps the editor, blocks navigation and allows retry", async () => {
  const h = harness();
  let fail = true;
  let api = h.render(() =>
    h.hooks.useDraftBack({
      persist: async () => {
        if (fail) throw Error("disk full");
      },
    }),
  );
  api.back();
  api = await h.settle();
  assert.equal(h.blocked, true);
  assert.equal((h.calls[0] as any)[0], "alert");
  assert.equal(h.calls.length, 1);
  fail = false;
  api.back();
  await h.settle();
  assert.equal(h.calls[1], "back");
});
test("hidden screens release Android Back and a late save cannot navigate from another screen", async () => {
  const h = harness();
  let release!: () => void;
  const api = h.render(() =>
    h.hooks.useDraftBack({
      persist: () => new Promise<void>((r) => (release = r)),
    }),
  );
  api.back();
  h.focus(false);
  assert.equal(h.hasHardware, false);
  assert.equal(h.blocked, false);
  release();
  await h.settle();
  assert.deepEqual(h.calls, []);
});
test("explicit exit bypasses steps; committed forms do not return to old capture steps; no-history uses fallback", async () => {
  const h = harness();
  h.router.canGoBack = () => false;
  let steps = 0;
  let api = h.render(() =>
    h.hooks.useDraftBack({
      persist: async () => true,
      step: () => {
        steps++;
        return true;
      },
      completed: () => true,
      fallback: "/people",
    }),
  );
  api.back();
  await h.settle();
  assert.deepEqual(h.calls, ["/people"]);
  assert.equal(steps, 0);
  h.focus(false);
  h.focus(true);
  api = h.render();
  api.exit(() => h.calls.push("home"));
  await h.settle();
  assert.deepEqual(h.calls, ["/people", "home"]);
});
test("reopening inline editor resets guard; local Back closes edit without changing detail history", async () => {
  const h = harness();
  let enabled = true;
  let api = h.render(() =>
    h.hooks.useDraftBack({
      persist: async () => true,
      enabled,
      localExit: () => {
        enabled = false;
        h.calls.push("detail");
      },
    }),
  );
  api.back();
  await h.settle();
  enabled = true;
  api = h.render();
  assert.equal(h.blocked, true);
  api.back();
  await h.settle();
  assert.deepEqual(h.calls, ["detail", "detail"]);
});
test("immediate Back during hydration retains existing draft rather than overwriting with defaults", async () => {
  const h = harness();
  let value = { name: "" };
  await createFormSession(h.disk, "person").write({ name: "مسودة سابقة" });
  const persist = h.render(() =>
    h.hooks.useLocalFormDraft({
      identity: "person",
      value,
      restore: (saved: any) => {
        value = saved;
      },
    }),
  );
  await persist();
  assert.equal(value.name, "مسودة سابقة");
  assert.deepEqual(await createFormSession(h.disk, "person").read(), {
    name: "مسودة سابقة",
  });
});
test("typing during hydration wins; corrupt draft blocks exit; completed or explicit discard clears only its form", async () => {
  const h = harness();
  let value = { name: "draft" };
  let completed = false;
  let persist = h.render(() =>
    h.hooks.useLocalFormDraft({
      identity: "person",
      value,
      restore: (v: any) => {
        value = v;
      },
      completed: () => completed,
    }),
  );
  await h.settle();
  await persist();
  value = { name: "changed" };
  persist = h.render();
  await persist();
  assert.deepEqual(await createFormSession(h.disk, "person").read(), value);
  completed = true;
  await persist();
  assert.equal(await createFormSession(h.disk, "person").read(), null);
  const corrupt = harness(),
    repo = createFormSession(corrupt.disk, "bad");
  corrupt.disk.values.set(repo.key, "broken");
  const bad = corrupt.render(() =>
    corrupt.hooks.useLocalFormDraft({
      identity: "bad",
      value: { name: "" },
      restore: () => {},
    }),
  );
  await corrupt.settle();
  await assert.rejects(bad(), /UNREADABLE/);
  assert.equal(corrupt.disk.values.get(repo.key), "broken");
  await bad.discard();
  await bad();
  assert.equal(await repo.read(), null);
});
test("typing before draft hydration completes wins over the stored snapshot", async () => {
  const h = harness(),
    repo = createFormSession(h.disk, "slow");
  await repo.write({ name: "old" });
  const read = h.disk.getItem;
  let release!: () => void,
    first = true;
  h.disk.getItem = async (k) => {
    if (first) {
      first = false;
      await new Promise<void>((r) => (release = r));
    }
    return read(k);
  };
  let value = { name: "" };
  let persist = h.render(() =>
    h.hooks.useLocalFormDraft({
      identity: "slow",
      value,
      restore: (v: any) => {
        value = v;
      },
    }),
  );
  await new Promise<void>((r) => setImmediate(r));
  value = { name: "typed" };
  persist = h.render();
  release();
  await h.settle();
  await persist();
  assert.deepEqual(await repo.read(), { name: "typed" });
});
test("explicit destination takes precedence over saved-flow Back fallback", async () => {
  const h = harness();
  const api = h.render(() =>
    h.hooks.useDraftBack({
      persist: async () => true,
      localExit: () => h.calls.push("detail"),
    }),
  );
  api.exit(() => h.calls.push("matching"));
  await h.settle();
  assert.deepEqual(h.calls, ["matching"]);
});
test("a structurally invalid draft is kept for recovery and cannot replace form inputs", async () => {
  const h = harness(),
    repo = createFormSession(h.disk, "shape");
  await repo.write({ name: [], choices: "wrong" });
  let restored = false;
  const persist = h.render(() =>
    h.hooks.useLocalFormDraft({
      identity: "shape",
      value: { name: "", choices: [] },
      restore: () => {
        restored = true;
      },
    }),
  );
  await h.settle();
  await assert.rejects(persist(), /UNREADABLE/);
  assert.equal(restored, false);
  assert.ok(await repo.read());
});
