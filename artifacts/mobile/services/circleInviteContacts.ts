import type { PhoneContactLike } from "./phoneEntry";
import { normalizeInvitePhoneContact } from "./circleInviteRecipients";

export type InviteContactsState =
  "ready" | "limited" | "denied" | "blocked" | "unavailable" | "error";
export interface InviteContactsResult {
  state: InviteContactsState;
  contacts: PhoneContactLike[];
}
interface ContactsAccess {
  requestPermissionsAsync(): Promise<{
    status: string;
    canAskAgain?: boolean;
    accessPrivileges?: string;
  }>;
  readPage(
    offset: number,
  ): Promise<{ data: PhoneContactLike[]; hasNextPage: boolean }>;
}
export async function loadInviteContacts(
  platform: string,
  assertActive: () => void,
  access?: ContactsAccess,
): Promise<InviteContactsResult> {
  assertActive();
  if (platform === "web") return { state: "unavailable", contacts: [] };
  try {
    if (!access) {
      const contacts = await import("expo-contacts");
      assertActive();
      access = {
        requestPermissionsAsync: contacts.requestPermissionsAsync,
        readPage: (offset) =>
          contacts.getContactsAsync({
            fields: [
              contacts.Fields.FirstName,
              contacts.Fields.LastName,
              contacts.Fields.PhoneNumbers,
            ],
            sort: contacts.SortTypes.FirstName,
            pageSize: 250,
            pageOffset: offset,
          }),
      };
    }
    const permission = await access.requestPermissionsAsync();
    assertActive();
    if (permission.status !== "granted")
      return {
        state: permission.canAskAgain === false ? "blocked" : "denied",
        contacts: [],
      };
    const contacts: PhoneContactLike[] = [];
    for (;;) {
      const page = await access.readPage(contacts.length);
      assertActive();
      contacts.push(...page.data.map(normalizeInvitePhoneContact));
      if (!page.hasNextPage) break;
      if (!page.data.length) throw Error("CONTACTS_PAGE_EMPTY");
    }
    return {
      state: permission.accessPrivileges === "limited" ? "limited" : "ready",
      contacts,
    };
  } catch {
    assertActive();
    return { state: "error", contacts: [] };
  }
}
