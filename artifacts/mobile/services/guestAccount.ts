import { assertAccountId, type AccountStorage } from './accountScope';
export const GUEST_IDENTITY_KEY = '@viewstate_guest_identity_v1';
export const ENTRY_MODE_KEY = '@viewstate_entry_mode_v1';
export const GUEST_CONTACT_KEY = '@viewstate_guest_contact_v1';
export const GUEST_TRANSFER_KEY = '@viewstate_guest_transfer_v1';
export interface GuestIdentity { version: 1; id: string; name: string; phone: string }
export function validateGuestContact(name: string, phone: string) {
  name = name.trim(); phone = phone.trim().replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) - (d.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660)));
  if (!name || name.length > 100) throw new Error('GUEST_NAME_REQUIRED');
  if (phone && (!/^\+?[0-9 ()-]{6,30}$/.test(phone) || phone.replace(/\D/g, '').length < 6 || phone.replace(/\D/g, '').length > 15)) throw new Error('GUEST_PHONE_INVALID');
  return { name, phone };
}
export function createGuestRepository(storage: AccountStorage, randomId: () => string) {
  return {
    async read(): Promise<GuestIdentity | null> {
      const raw = await storage.getItem(GUEST_IDENTITY_KEY); if (raw === null) return null;
      const value = JSON.parse(raw); if (value.version !== 1) throw new Error('GUEST_IDENTITY_INVALID');
      assertAccountId(value.id);
      return { version: 1, id: value.id, ...validateGuestContact(value.name, value.phone) };
    },
    async save(name: string, phone: string, previous: GuestIdentity | null): Promise<GuestIdentity> {
      const value: GuestIdentity = { version: 1, id: previous?.id ?? randomId(), ...validateGuestContact(name, phone) };
      assertAccountId(value.id);
      const raw = JSON.stringify(value); await storage.setItem(GUEST_IDENTITY_KEY, raw);
      if (await storage.getItem(GUEST_IDENTITY_KEY) !== raw) throw new Error('GUEST_PROFILE_READBACK_FAILED');
      return value;
    },
  };
}

/** RFC 4122 v4 from OS/WebCrypto bytes; no network and no Math.random fallback. */
export function guestLocalId(randomBytes: Uint8Array): string {
  if (randomBytes.length !== 16) throw new Error('GUEST_RANDOM_BYTES_REQUIRED');
  const bytes = new Uint8Array(randomBytes); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
