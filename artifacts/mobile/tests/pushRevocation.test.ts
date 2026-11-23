import test from "node:test";
import assert from "node:assert/strict";
import { createPushRevocations } from "../services/pushRevocation";
import { registerHooks } from "node:module";

function storage() {
  let value: string | null = null;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => {
      value = next;
    },
  };
}
const a = {
  owner: "account-a",
  token: "ExpoPushToken[aaaaaaaa]",
  secret: "a".repeat(64),
};
const b = { owner: "account-b", token: a.token, secret: "b".repeat(64) };

test("offline logout survives restart and retries using a device capability without account B credentials", async () => {
  const disk = storage();
  const original = createPushRevocations(disk);
  await original.remember(a);
  await original.prepare(a.owner);
  await original.retry(async () => {
    throw Error("offline");
  });
  const restarted = createPushRevocations(disk);
  await restarted.remember(b);
  const revoked: unknown[] = [];
  await restarted.retry(async (binding) => {
    revoked.push(binding);
  });
  assert.deepEqual([...revoked], [a]);
  await restarted.prepare(b.owner);
  await restarted.retry(async (binding) => {
    revoked.push(binding);
  });
  assert.deepEqual(revoked, [a, b]);
});

test("late completion removes only its pending generation, retaining a newer logout", async () => {
  const queue = createPushRevocations(storage());
  await queue.remember(a);
  await queue.prepare(a.owner);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = queue.retry(async () => gate);
  await queue.remember({ ...a, secret: "c".repeat(64) });
  await queue.prepare(a.owner);
  release();
  await first;
  const remaining: unknown[] = [];
  await queue.retry(async (binding) => {
    remaining.push(binding);
  });
  assert.deepEqual(remaining, [{ ...a, secret: "c".repeat(64) }]);
});

test("implicit owner switch queues the previous active binding on the same token", async () => {
  const queue = createPushRevocations(storage());
  await queue.remember(a);
  await queue.remember(b);
  const pending: unknown[] = [];
  await queue.retry(async (binding) => {
    pending.push(binding);
  });
  assert.deepEqual(pending, [a]);
  assert.equal(await queue.read(a.owner), undefined);
});

test("legacy pending revoke waits for its original owner and failed storage prevents logout preparation", async () => {
  const disk = storage();
  const queue = createPushRevocations(disk);
  await queue.prepare(a.owner, a.token);
  const revoked: unknown[] = [];
  await queue.retry(async (binding) => {
    revoked.push(binding);
  }, b.owner);
  assert.deepEqual([...revoked], []);
  await queue.retry(async (binding) => {
    revoked.push(binding);
  }, a.owner);
  assert.deepEqual(revoked, [{ owner: a.owner, token: a.token }]);
  const broken = createPushRevocations({
    getItem: disk.getItem,
    setItem: async () => {
      throw Error("disk full");
    },
  });
  await assert.rejects(broken.prepare(a.owner, a.token), /disk full/);
});

test("native adapter keeps revocation after a lost registration reply and never sends account credentials for capability retry", async () => {
  const state = {
    local: new Map<string, string>(),
    secure: new Map<string, string>(),
    token: a.token,
  };
  (globalThis as any).__pushRevocationTest = state;
  const stubs = new Map([
    ["react-native", `export const Platform={OS:'android'};`],
    ["expo-updates", `export const isEnabled=false;`],
    ["expo-constants", `export default {easConfig:{projectId:'fixture'}};`],
    [
      "expo-crypto",
      `export {randomUUID} from 'node:crypto';import {randomBytes} from 'node:crypto';export const getRandomBytes=randomBytes;`,
    ],
    [
      "@react-native-async-storage/async-storage",
      `const s=globalThis.__pushRevocationTest;export default {getItem:async k=>s.local.get(k)??null,setItem:async(k,v)=>{s.local.set(k,v)},removeItem:async k=>{s.local.delete(k)}};`,
    ],
    [
      "expo-secure-store",
      `const s=globalThis.__pushRevocationTest;export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1;export const isAvailableAsync=async()=>true;export const getItemAsync=async k=>s.secure.get(k)??null;export const setItemAsync=async(k,v)=>{s.secure.set(k,v)};export const deleteItemAsync=async k=>{s.secure.delete(k)};`,
    ],
    [
      "expo-notifications",
      `export const AndroidImportance={HIGH:4};export const setNotificationChannelAsync=async()=>{};export const getPermissionsAsync=async()=>({granted:true});export const getExpoPushTokenAsync=async()=>({data:globalThis.__pushRevocationTest.token});export const setNotificationHandler=()=>{};`,
    ],
    [
      "./circleMatchingApi",
      `export const circleRpc=async(request,name,params)=>{const r=await request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(params)});return r.json()};`,
    ],
  ]);
  const hooks = registerHooks({
    resolve(s, c, next) {
      return stubs.has(s)
        ? { url: "push-stub:" + s, shortCircuit: true }
        : next(s, c);
    },
    load(u, c, next) {
      return u.startsWith("push-stub:")
        ? {
            format: "module",
            source: stubs.get(u.slice(10))!,
            shortCircuit: true,
          }
        : next(u, c);
    },
  });
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.EXPO_PUBLIC_SUPABASE_URL,
    previousKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fixture";
  let registered: { owner: string; secret: string } | undefined;
  let offline = true;
  let revokeCalls = 0;
  globalThis.fetch = async (_url, options) => {
    revokeCalls++;
    assert.equal(new Headers(options?.headers).get("Authorization"), null);
    if (offline) throw Error("offline");
    const params = JSON.parse(String(options?.body));
    if (params.p_secret === registered?.secret) registered = undefined;
    return new Response("null");
  };
  try {
    const push = await import("../services/circlePush");
    const request =
      (owner: string, loseReply: false | "prepare" | "activate" = false) =>
      async (path: string, options?: { body?: string | ArrayBuffer }) => {
        assert.ok(
          [
            "/rest/v1/rpc/vs_circle_prepare_push_device",
            "/rest/v1/rpc/vs_circle_register_push_device",
          ].includes(path),
        );
        const params = JSON.parse(String(options?.body));
        assert.match(params.p_secret, /^[a-f0-9]{64}$/);
        assert.equal(
          [...state.secure.values()].some((value) =>
            value.includes(params.p_secret),
          ),
          true,
          "capability is durable before server registration",
        );
        if (path.endsWith("vs_circle_prepare_push_device")) {
          if (loseReply === "prepare") throw Error("lost prepare response");
          return new Response("null");
        }
        registered = { owner, secret: params.p_secret };
        if (loseReply === "activate") throw Error("lost response");
        return new Response("null");
      };
    push.setCircleForegroundOwner(a.owner);
    await assert.rejects(
      push.setCirclePush(request(a.owner, "activate"), a.owner, true),
      /lost response/,
    );
    push.setCircleForegroundOwner(undefined);
    await push.prepareCirclePushSignOut(a.owner);
    await push.retryCirclePushRevocations();
    assert.equal(
      registered?.owner,
      a.owner,
      "offline cannot promise immediate server revocation",
    );
    assert.equal(state.local.has("@viewstate_circle_push_" + a.owner), false);
    push.setCircleForegroundOwner(b.owner);
    await assert.rejects(
      push.setCirclePush(request(b.owner), b.owner, true),
      /CIRCLE_PUSH_REVOCATION_PENDING/,
    );
    assert.equal(
      registered?.owner,
      a.owner,
      "replacement cannot bypass an unacknowledged revocation",
    );
    offline = false;
    await push.setCirclePush(request(b.owner), b.owner, true);
    assert.equal(
      registered?.owner,
      b.owner,
      "late A revoke preserves B on the same token",
    );
    offline = true;
    await assert.rejects(
      push.setCirclePush(request(b.owner), b.owner, false),
      /CIRCLE_PUSH_REVOCATION_PENDING/,
    );
    assert.equal(
      registered?.owner,
      b.owner,
      "offline disable retains durable remote cleanup instead of claiming completion",
    );
    offline = false;
    push.setCircleForegroundOwner(undefined);
    await push.prepareCirclePushSignOut(b.owner);
    await push.retryCirclePushRevocations();
    assert.equal(registered, undefined);
    push.setCircleForegroundOwner(a.owner);
    await assert.rejects(
      push.setCirclePush(request(a.owner, "prepare"), a.owner, true),
      /lost prepare response/,
    );
    assert.equal(
      registered,
      undefined,
      "an ambiguous preparation never sends activation",
    );
    push.setCircleForegroundOwner(undefined);
    await push.prepareCirclePushSignOut(a.owner);
    await push.retryCirclePushRevocations();
    assert.ok(revokeCalls >= 3);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined)
      delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
    hooks.deregister();
    delete (globalThis as any).__pushRevocationTest;
  }
});
