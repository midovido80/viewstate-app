import test from "node:test";
import assert from "node:assert/strict";
import {
  inviteRecipientsFromPeople,
  inviteRecipientsFromContacts,
  filterInviteRecipients,
} from "../services/circleInviteRecipients";
import type { Person } from "../services/people";
import { loadInviteContacts } from "../services/circleInviteContacts";
import { createCircleInviteBatch } from "../services/circleInviteBatch";

test("unresolved operations survive a different selection, while a fresh explicit send can retry a known completed outcome", async () => {
  const f = sessionFixture(),
    a = ["+96550001234"],
    b = ["+96550005678"];
  const session = createCircleInviteBatch(f.dependencies);
  await assert.rejects(session.sendApp("circle-a", a), /connection/);
  const operation = f.calls[0].params.p_operation;
  f.setLost(false);
  await session.sendApp("circle-a", b);
  await createCircleInviteBatch(f.dependencies).sendApp("circle-a", a, true);
  assert.equal(
    f.calls[2].params.p_operation,
    operation,
    "unknown outcomes replay their original operation even after a selection change",
  );
  await createCircleInviteBatch(f.dependencies).sendApp("circle-a", a, true);
  assert.notEqual(
    f.calls[3].params.p_operation,
    operation,
    "a deliberate later invitation is not suppressed forever",
  );
});

test("invitation storage transaction uses the account cross-tab lock around reads, network and confirmation", async () => {
  const f = sessionFixture();
  f.setLost(false);
  let locked = false,
    locks = 0;
  const storage = {
    ...f.dependencies.storage,
    async withExclusiveLock<T>(_name: string, work: () => Promise<T>) {
      locks++;
      locked = true;
      try {
        return await work();
      } finally {
        locked = false;
      }
    },
    getItem: async (key: string) => {
      assert.equal(locked, true);
      return f.dependencies.storage.getItem(key);
    },
  };
  await createCircleInviteBatch({ ...f.dependencies, storage }).sendApp(
    "circle-a",
    ["+96550001234"],
  );
  assert.equal(locks, 1);
});

test("unnamed native contacts never crash recipient rendering and a phone-only colleague remains selectable", async () => {
  const data = [
    { id: "blank" },
    { id: "number-only", phoneNumbers: [{ number: "+96550001234" }] },
    { name: "Named", phoneNumbers: [{ number: "+96550005678" }] },
  ];
  const result = await loadInviteContacts("ios", () => {}, {
    requestPermissionsAsync: async () => ({ status: "granted" }),
    readPage: async () => ({ data: data as any, hasNextPage: false }),
  });
  const rows = inviteRecipientsFromContacts(result.contacts);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.name.trim().length > 0));
  assert.equal(rows[0].phone, "+96550001234");
});

test("saved people of every classification and all contact numbers can be selected; normalized duplicates share one identity", () => {
  const people = inviteRecipientsFromPeople([
    {
      id: "a",
      name: "أحمد",
      displayPhone: "٥٠٠٠ ١٢٣٤",
      normalizedPhone: "50001234",
      classifications: ["rent_seeker"],
      notes: "PRIVATE",
    },
    {
      id: "b",
      name: "Duplicate",
      displayPhone: "0096550001234",
      normalizedPhone: "0096550001234",
      classifications: ["broker"],
      notes: "",
    },
  ] as Person[]);
  assert.equal(people.length, 1);
  assert.equal(people[0].phone, "+96550001234");
  const contacts = inviteRecipientsFromContacts([
    {
      id: "c",
      name: "أحمد",
      phoneNumbers: [{ number: "+965 50001234" }, { number: "+966501234567" }],
    },
  ]);
  assert.equal(contacts.length, 2, "both numbers remain explicit choices");
  assert.equal(
    contacts[0].key,
    people[0].key,
    "same number across sources is selected only once",
  );
  assert.deepEqual(
    filterInviteRecipients(contacts, "٥٠١٢٣٤٥٦٧").map((row) => row.phone),
    ["+966501234567"],
  );
  assert.equal(filterInviteRecipients(contacts, "أحمد").length, 2);
  assert.doesNotMatch(JSON.stringify(people), /PRIVATE|classifications|notes/);
});

function sessionFixture() {
  const values = new Map<string, string>();
  const calls: { name: string; params: any }[] = [];
  let count = 0,
    lostReply = true,
    active = true,
    diskFails = false;
  const dependencies = {
    owner: "account-a",
    storage: {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (diskFails) throw Error("disk");
        values.set(key, value);
      },
    },
    request: async (
      path: string,
      options?: { body?: string | ArrayBuffer },
    ) => {
      const params = JSON.parse(String(options?.body));
      calls.push({ name: path.split("/").at(-1)!, params });
      if (path.endsWith("vs_circle_invite_batch")) {
        assert.ok(
          [...values.values()].some((raw) => raw.includes(params.p_operation)),
          "intent is durable before send",
        );
        if (lostReply) throw Error("connection");
        return Response.json({
          results: params.p_phones.map((phone: string) => ({
            phone,
            status: "accepted",
          })),
        });
      }
      return new Response("null");
    },
    randomId: () => `operation-${++count}`,
    randomToken: () => (++count).toString(16).padStart(64, "0"),
    assertActive: () => {
      if (!active) throw Error("ACCOUNT_CHANGED");
    },
  };
  return {
    dependencies,
    calls,
    values,
    setLost: (value: boolean) => {
      lostReply = value;
    },
    deactivate: () => {
      active = false;
    },
    failDisk: () => {
      diskFails = true;
    },
  };
}

test("batch retries and reopened sessions reuse persisted intent; only selected unique phone numbers are sent", async () => {
  const f = sessionFixture(),
    circle = "circle-a";
  const phones = ["+96550001234", "+96550005678", "+96550001234"];
  await assert.rejects(
    createCircleInviteBatch(f.dependencies).sendApp(circle, phones),
    /connection/,
  );
  f.setLost(false);
  const session = createCircleInviteBatch(f.dependencies);
  const result = await session.sendApp(circle, [...phones].reverse());
  assert.equal(result.results.length, 2);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].params.p_operation, f.calls[1].params.p_operation);
  assert.deepEqual(f.calls[0].params.p_phones, [
    "+96550001234",
    "+96550005678",
  ]);
  await session.sendApp(circle, phones);
  assert.equal(f.calls.length, 2, "known outcome is not resent");
  assert.doesNotMatch(
    JSON.stringify(f.calls.map((call) => call.params)),
    /name|notes|phoneNumbers/,
  );
});

test("WhatsApp recipients have separate stable capabilities and a changed circle gets a different link", async () => {
  const f = sessionFixture(),
    session = createCircleInviteBatch(f.dependencies);
  const a = await session.prepareWhatsApp("circle-a", "+96550001234");
  const b = await session.prepareWhatsApp("circle-a", "+96550005678");
  assert.notEqual(a, b);
  assert.equal(
    await createCircleInviteBatch(f.dependencies).prepareWhatsApp(
      "circle-a",
      "+96550001234",
    ),
    a,
  );
  assert.notEqual(await session.prepareWhatsApp("circle-b", "+96550001234"), a);
  assert.equal(
    f.calls.filter((call) => call.name === "vs_circle_invite_link").length,
    4,
  );
});

test("disk failure, invalid selection and account replacement block network effects", async () => {
  const f = sessionFixture(),
    session = createCircleInviteBatch(f.dependencies);
  await assert.rejects(
    session.sendApp("circle-a", []),
    /CIRCLE_INVITE_SELECTION_INVALID/,
  );
  await assert.rejects(
    session.sendApp("circle-a", ["123"]),
    /CIRCLE_INVITE_SELECTION_INVALID/,
  );
  f.failDisk();
  await assert.rejects(session.sendApp("circle-a", ["+96550001234"]), /disk/);
  assert.equal(f.calls.length, 0);
  f.deactivate();
  await assert.rejects(
    session.prepareWhatsApp("circle-a", "+96550001234"),
    /ACCOUNT_CHANGED/,
  );
  assert.equal(f.calls.length, 0);
});

test("concurrent modal sessions send once and account-scoped draft keys do not share outcomes", async () => {
  const f = sessionFixture();
  f.setLost(false);
  await Promise.all([
    createCircleInviteBatch(f.dependencies).sendApp("circle-a", [
      "+96550001234",
    ]),
    createCircleInviteBatch(f.dependencies).sendApp("circle-a", [
      "+96550001234",
    ]),
  ]);
  assert.equal(f.calls.length, 1);
  await createCircleInviteBatch({
    ...f.dependencies,
    owner: "account-b",
  }).sendApp("circle-a", ["+96550001234"]);
  assert.equal(f.calls.length, 2);
  const different =
    f.calls[0].params.p_operation !== f.calls[1].params.p_operation;
  assert.equal(different, true);
});

test("a stale account cannot save a completed request result, and invalid server outcomes never count as processed", async () => {
  const f = sessionFixture();
  f.setLost(false);
  const session = createCircleInviteBatch({
    ...f.dependencies,
    request: async (...args) => {
      const response = await f.dependencies.request(...args);
      f.deactivate();
      return response;
    },
  });
  await assert.rejects(
    session.sendApp("circle-a", ["+96550001234"]),
    /ACCOUNT_CHANGED/,
  );
  assert.ok([...f.values.values()].every((raw) => !raw.includes('"result"')));
  const g = sessionFixture();
  const invalid = createCircleInviteBatch({
    ...g.dependencies,
    request: async () =>
      Response.json({ results: [{ phone: "+96550009999", status: "sent" }] }),
  });
  await assert.rejects(
    invalid.sendApp("circle-a", ["+96550001234"]),
    /CIRCLE_INVITE_RESPONSE_INVALID/,
  );
});

test("missing and invalid numbers remain unselectable and selected local dialing country is explicit", () => {
  const contacts = inviteRecipientsFromContacts([
    { id: "x", name: "No usable number", phoneNumbers: [{ number: "123" }] },
  ]);
  assert.equal(contacts[0].phone, undefined);
  assert.equal(
    inviteRecipientsFromContacts(
      [{ name: "Saudi", phoneNumbers: [{ number: "0501234567" }] }],
      "SA",
    )[0].phone,
    "+966501234567",
  );
  assert.deepEqual(inviteRecipientsFromContacts([{ name: "No phone" }]), []);
});

test("phone contact access is explicit, paged, limited-aware and never required for saved people", async () => {
  let permissions = 0;
  const offsets: number[] = [];
  const access = {
    requestPermissionsAsync: async () => {
      permissions++;
      return { status: "granted", accessPrivileges: "limited" };
    },
    readPage: async (offset: number) => {
      offsets.push(offset);
      return {
        data: [
          {
            name: `Colleague ${offset}`,
            phoneNumbers: [{ number: "+96550001234" }],
          },
        ],
        hasNextPage: offset === 0,
      };
    },
  };
  assert.deepEqual(await loadInviteContacts("web", () => {}, access), {
    state: "unavailable",
    contacts: [],
  });
  assert.equal(permissions, 0);
  const result = await loadInviteContacts("android", () => {}, access);
  assert.equal(result.state, "limited");
  assert.equal(result.contacts.length, 2);
  assert.deepEqual(offsets, [0, 1]);
  for (const canAskAgain of [true, false]) {
    const denied = await loadInviteContacts("android", () => {}, {
      ...access,
      requestPermissionsAsync: async () => ({ status: "denied", canAskAgain }),
    });
    assert.equal(denied.state, canAskAgain ? "denied" : "blocked");
    assert.equal(denied.contacts.length, 0);
  }
});
