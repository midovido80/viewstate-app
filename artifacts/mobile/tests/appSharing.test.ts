import test from "node:test";
import assert from "node:assert/strict";
import {
  appInvitationMessage,
  appInvitationWhatsAppQuery,
  VIEWSTATE_DOWNLOAD_URL,
} from "../services/appSharing";
import {
  inviteRecipientsFromPeople,
  inviteRecipientsFromContacts,
} from "../services/circleInviteRecipients";

test("app sharing uses a public stable URL without account identifiers or circle capability tokens", () => {
  for (const language of ["ar", "en"]) {
    const message = appInvitationMessage(language);
    assert.ok(message.includes(VIEWSTATE_DOWNLOAD_URL));
    assert.equal(new URL(VIEWSTATE_DOWNLOAD_URL).protocol, "https:");
    assert.doesNotMatch(message, /token=|user_id|circle-invite\//);
  }
  assert.match(appInvitationMessage("ar"), /لا يضمك لأي دائرة تلقائيًا/);
  const query = new URLSearchParams(
    appInvitationWhatsAppQuery("+96550001234", "ar"),
  );
  assert.equal(query.get("phone"), "96550001234");
  assert.equal(query.get("text"), appInvitationMessage("ar"));
  assert.throws(() => appInvitationWhatsAppQuery("50001234&text=bad", "ar"));
});

test("app invitation choices normalize duplicate contacts and keep multiple numbers independently selectable", () => {
  const contacts = inviteRecipientsFromContacts([
    {
      id: "a",
      name: "Colleague",
      phoneNumbers: [
        { number: "50001234" },
        { number: "0096550001234" },
        { number: "50005678" },
      ],
    },
  ]);
  assert.equal(contacts.length, 2);
  const people = inviteRecipientsFromPeople([
    {
      id: "p",
      name: "Saved",
      displayPhone: "50001234",
      normalizedPhone: "+96550001234",
      notes: "",
      classifications: ["broker"],
    },
  ]);
  assert.equal(people[0].key, contacts[0].key);
});
