/**
 * Boundary for a separately approved real-provider package.
 * No credentials, identity matching, OTP bypass or local authenticated sessions.
 */
export type AccountMethod = 'phone' | 'google' | 'apple';
export interface VerifiedAccountIdentity { subject: string; provider: AccountMethod }
export interface AccountSession { identity: VerifiedAccountIdentity; expiresAt: number }
export interface AccountProvider {
  readonly configured: boolean;
  methods(): readonly AccountMethod[];
  session(): Promise<AccountSession | null>;
  signIn(method: AccountMethod): Promise<AccountSession>;
  link(method: AccountMethod): Promise<VerifiedAccountIdentity>;
}
export const accountProvider: AccountProvider = {
  configured: false,
  methods: () => [],
  session: async () => null,
  signIn: async () => { throw new Error('Authentication unavailable: no approved provider configured'); },
  link: async () => { throw new Error('Linking unavailable: no approved provider configured'); },
};
