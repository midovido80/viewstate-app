import * as Crypto from 'expo-crypto';

/**
 * The single generator for new domain-record identities.
 *
 * Existing IDs are intentionally never passed through this function. Keeping
 * this wrapper small also makes it clear that record IDs are UUID v4 values
 * supplied by Expo's platform-compatible secure random implementation.
 */
export function generateDomainId(): string {
  return Crypto.randomUUID();
}