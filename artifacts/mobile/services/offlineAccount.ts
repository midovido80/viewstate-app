import { assertAccountId } from "./accountScope";
import {
  validateUserContactProfile,
  type UserContactProfile,
} from "./googleAccountContract";
import type { SecretStorage } from "./secureSessionStorage";
import type { VerifiedGoogleAccount } from "./googleAccountService";
export interface OfflineAccount {
  version: 1;
  account: VerifiedGoogleAccount;
  profile: UserContactProfile;
  pendingProfile?: boolean;
}
/** A trusted device receipt unlocks local data, never server permissions. All receipt updates are serialized. */
export function createOfflineAccountCache(storage: SecretStorage, key: string) {
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>) => {
    const result = queue.catch(() => undefined).then(work);
    queue = result;
    return result;
  };
  const read = async (): Promise<OfflineAccount | null> => {
    const raw = await storage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw) as OfflineAccount;
    assertAccountId(value.account?.userId);
    if (
      value.version !== 1 ||
      typeof value.account.email !== "string" ||
      !Number.isFinite(value.account.expiresAt) ||
      value.profile?.user_id !== value.account.userId ||
      (value.pendingProfile !== undefined &&
        typeof value.pendingProfile !== "boolean")
    )
      throw new Error("OFFLINE_ACCOUNT_DAMAGED");
    return {
      ...value,
      profile: validateUserContactProfile(value.account.userId, value.profile),
    };
  };
  const remember = async (
    account: VerifiedGoogleAccount,
    profile: UserContactProfile,
    pendingProfile = false,
  ) => {
    assertAccountId(account.userId);
    if (profile.user_id !== account.userId)
      throw new Error("PROFILE_OWNER_MISMATCH");
    const value: OfflineAccount = {
      version: 1,
      account,
      ...(pendingProfile ? { pendingProfile: true } : {}),
      profile: validateUserContactProfile(account.userId, profile),
    };
    const raw = JSON.stringify(value);
    await storage.setItem(key, raw);
    if ((await storage.getItem(key)) !== raw)
      throw new Error("OFFLINE_ACCOUNT_WRITE_FAILED");
  };
  return {
    read: () => exclusive(read),
    remember: (
      account: VerifiedGoogleAccount,
      profile: UserContactProfile,
      pending = false,
    ) => exclusive(() => remember(account, profile, pending)),
    acknowledgeProfile: (
      expected: UserContactProfile,
      account: VerifiedGoogleAccount,
      stored: UserContactProfile,
    ) =>
      exclusive(async () => {
        const latest = await read();
        if (
          latest?.account.userId === account.userId &&
          latest.pendingProfile &&
          JSON.stringify(latest.profile) === JSON.stringify(expected)
        )
          await remember(account, stored);
      }),
    forget: () => exclusive(() => storage.removeItem(key)),
  };
}

/** A receipt for A cannot unlock A while the SDK has switched to B, even before the next online check. */
export function offlineOwnerMatches(
  cached: OfflineAccount,
  sessionRaw: string | null,
  observed: string | null | undefined,
): boolean {
  if (!sessionRaw) return false;
  const session = JSON.parse(sessionRaw) as { user?: { id?: string } };
  return (
    session.user?.id?.toLowerCase() === cached.account.userId &&
    (observed === undefined || observed === cached.account.userId)
  );
}
