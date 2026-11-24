import type { Person } from "./people";
import {
  buildContactImportCandidates,
  normalizePhoneForCountry,
  phoneDigits,
  type PhoneContactLike,
  type PhoneCountryCode,
} from "./phoneEntry";

export interface InviteRecipient {
  key: string;
  name: string;
  phone?: string;
  rawPhone: string;
  source: "people" | "phone";
}
export function normalizeInvitePhoneContact(
  contact: PhoneContactLike,
): PhoneContactLike {
  const phoneNumbers = Array.isArray(contact.phoneNumbers)
    ? contact.phoneNumbers
        .filter((phone) => phone && typeof phone.number === "string")
        .map((phone) => ({ number: phone.number, isPrimary: phone.isPrimary }))
    : [];
  return {
    id: contact.id,
    name:
      typeof contact.name === "string" && contact.name.trim()
        ? contact.name.trim()
        : (phoneNumbers.find((phone) => phone.number?.trim())?.number ?? ""),
    phoneNumbers,
  };
}
function recipient(
  name: string,
  rawPhone: string,
  source: InviteRecipient["source"],
  country: PhoneCountryCode,
): InviteRecipient {
  const normalized = normalizePhoneForCountry(rawPhone, country);
  const phone =
    /^\+[1-9][0-9]{6,14}$/.test(normalized) &&
    (!normalized.startsWith("+965") || normalized.length === 12)
      ? normalized
      : undefined;
  return {
    key: phone ?? `${source}:${name}:${rawPhone}`,
    name,
    phone,
    rawPhone,
    source,
  };
}
function unique(rows: InviteRecipient[]) {
  return [...new Map(rows.map((row) => [row.key, row])).values()];
}
export function inviteRecipientsFromPeople(
  people: readonly Person[],
  country: PhoneCountryCode = "KW",
): InviteRecipient[] {
  return unique(
    people
      .filter(
        (person) =>
          person.displayPhone?.trim() || person.normalizedPhone?.trim(),
      )
      .map((person) =>
        recipient(
          person.name,
          person.normalizedPhone || person.displayPhone,
          "people",
          country,
        ),
      ),
  );
}
export function inviteRecipientsFromContacts(
  contacts: readonly PhoneContactLike[],
  country: PhoneCountryCode = "KW",
): InviteRecipient[] {
  return unique(
    buildContactImportCandidates(
      contacts.map(normalizeInvitePhoneContact),
    ).flatMap((contact) =>
      contact.phones.map((phone) =>
        recipient(contact.name, phone.phone, "phone", country),
      ),
    ),
  );
}
export function filterInviteRecipients(
  rows: readonly InviteRecipient[],
  query: string,
): InviteRecipient[] {
  const text = query.trim().normalize("NFKC").toLocaleLowerCase();
  const digits = phoneDigits(query);
  return rows.filter(
    (row) =>
      !text ||
      row.name.normalize("NFKC").toLocaleLowerCase().includes(text) ||
      (!!digits && phoneDigits(row.phone ?? row.rawPhone).includes(digits)),
  );
}
