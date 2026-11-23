import test from "node:test";
import assert from "node:assert/strict";
import { refreshPushRegistration } from "../services/pushRegistrationRefresh";
test("refresh follows a renewed device token and retires the old registration only after storing the replacement", async () => {
  const calls: string[] = [];
  let stored: string | null = "old";
  await refreshPushRegistration({
    read: async () => stored,
    permission: async () => true,
    deviceToken: async () => "new",
    register: async (token) => {
      calls.push("register:" + token);
    },
    write: async (token) => {
      calls.push("write:" + token);
      stored = token;
    },
    remove: async (token) => {
      calls.push("remove:" + token);
    },
  });
  assert.deepEqual(calls, ["register:new", "write:new", "remove:old"]);
  assert.equal(stored, "new");
});
test("disabled notifications never obtain or re-register a device token", async () => {
  for (const token of [null, "old"]) {
    let calls = 0;
    await refreshPushRegistration({
      read: async () => token,
      permission: async () => false,
      deviceToken: async () => {
        calls++;
        return "new";
      },
      register: async () => {
        calls++;
      },
      write: async () => {
        calls++;
      },
      remove: async () => {
        calls++;
      },
    });
    assert.equal(calls, 0);
  }
});
test("failed registration retains the previous usable token", async () => {
  let stored = "old";
  let removed = false;
  await assert.rejects(
    refreshPushRegistration({
      read: async () => stored,
      permission: async () => true,
      deviceToken: async () => "new",
      register: async () => {
        throw Error("offline");
      },
      write: async (token) => {
        stored = token;
      },
      remove: async () => {
        removed = true;
      },
    }),
    /offline/,
  );
  assert.equal(stored, "old");
  assert.equal(removed, false);
});
