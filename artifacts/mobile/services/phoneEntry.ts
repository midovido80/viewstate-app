export const PHONE_COUNTRIES = [
  { code: 'KW', dialCode: '965', translationKey: 'people.country.kuwait' },
  { code: 'SA', dialCode: '966', translationKey: 'people.country.saudi_arabia' },
  { code: 'AE', dialCode: '971', translationKey: 'people.country.uae' },
  { code: 'BH', dialCode: '973', translationKey: 'people.country.bahrain' },
  { code: 'QA', dialCode: '974', translationKey: 'people.country.qatar' },
  { code: 'OM', dialCode: '968', translationKey: 'people.country.oman' },
  { code: 'EG', dialCode: '20', translationKey: 'people.country.egypt' },
] as const;

export type PhoneCountryCode = typeof PHONE_COUNTRIES[number]['code'];

interface ContactPhoneLike {
  number?: string;
  isPrimary?: boolean;
}

export interface PhoneContactLike {
  id?: string;
  name: string;
  phoneNumbers?: ContactPhoneLike[];
}

export interface ContactPhoneChoice {
  key: string;
  name: string;
  phone: string;
  normalizedDigits: string;
}

function toAsciiDigit(character: string): string {
  const code = character.charCodeAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  return character;
}

export function phoneDigits(value: string): string {
  return Array.from(value)
    .map(toAsciiDigit)
    .filter(character => character >= '0' && character <= '9')
    .join('');
}

function startsWithInternationalZeroPrefix(trimmed: string): boolean {
  const characters = Array.from(trimmed);
  return characters.length >= 2
    && toAsciiDigit(characters[0]) === '0'
    && toAsciiDigit(characters[1]) === '0';
}

function hasExplicitInternationalPrefix(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('+') || startsWithInternationalZeroPrefix(trimmed);
}

function explicitInternationalDigits(value: string): string {
  const trimmed = value.trim();
  const digits = phoneDigits(trimmed);
  return startsWithInternationalZeroPrefix(trimmed) ? digits.slice(2) : digits;
}

/**
 * An explicit + prefix and international 00 prefix identify the same dialing
 * form. National digits intentionally keep a distinct key: without an
 * explicit prefix, a number beginning with a country code is ambiguous.
 */
function contactPhoneDedupeKey(value: string): string {
  const trimmed = value.trim();
  const digits = phoneDigits(trimmed);
  if (!hasExplicitInternationalPrefix(value)) return digits;
  if (trimmed.startsWith('+')) return `+${digits}`;
  return `+${explicitInternationalDigits(value)}`;
}

export function inferPhoneCountry(value: string): PhoneCountryCode | null {
  if (!hasExplicitInternationalPrefix(value)) return null;
  const digits = explicitInternationalDigits(value);
  return PHONE_COUNTRIES.find(country => digits.startsWith(country.dialCode))?.code ?? null;
}

export function normalizePhoneForCountry(
  displayPhone: string,
  countryCode: PhoneCountryCode,
): string {
  const trimmed = displayPhone.trim();
  const digits = phoneDigits(trimmed);
  if (!digits) return '';
  if (hasExplicitInternationalPrefix(displayPhone)) {
    return `+${explicitInternationalDigits(displayPhone)}`;
  }

  const country = PHONE_COUNTRIES.find(candidate => candidate.code === countryCode);
  if (!country) return digits;
  const nationalNumber = digits.replace(/^0+/, '');
  if (!nationalNumber) return '';
  return `+${country.dialCode}${nationalNumber}`;
}

/**
 * Contacts can contain shortcut/account aliases and repeated formatted copies
 * of the same number. Keep one phone per contact and one row per unique number.
 */
export function buildContactPhoneChoices(
  contacts: readonly PhoneContactLike[],
): ContactPhoneChoice[] {
  const seenNumbers = new Set<string>();
  const choices: ContactPhoneChoice[] = [];

  contacts.forEach((contact, contactIndex) => {
    if (!contact.name.trim()) return;

    const uniquePhones = new Map<string, {
      number: string;
      normalizedDigits: string;
      isPrimary: boolean;
    }>();
    contact.phoneNumbers?.forEach(phone => {
      const number = phone.number;
      if (!number?.trim()) return;
      const normalizedDigits = phoneDigits(number);
      if (!normalizedDigits) return;
      const dedupeKey = contactPhoneDedupeKey(number);
      const existing = uniquePhones.get(dedupeKey);
      if (!existing || (phone.isPrimary === true && !existing.isPrimary)) {
        uniquePhones.set(dedupeKey, {
          number,
          normalizedDigits,
          isPrimary: phone.isPrimary === true,
        });
      }
    });

    const phones = [...uniquePhones.entries()];
    const selected = phones.find(([, phone]) => phone.isPrimary) ?? phones[0];
    if (!selected) return;
    const [dedupeKey, selectedPhone] = selected;
    if (seenNumbers.has(dedupeKey)) return;
    seenNumbers.add(dedupeKey);
    choices.push({
      key: `${contact.id ?? contactIndex}-${dedupeKey}`,
      name: contact.name,
      phone: selectedPhone.number,
      normalizedDigits: selectedPhone.normalizedDigits,
    });
  });

  return choices;
}