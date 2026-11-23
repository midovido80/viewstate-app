export interface MediaAccess { assertActive(): void; assertUri(uri: string): void; cacheDirectory: string }
/** Compare canonical URLs including the directory separator; no sibling/prefix/traversal escapes. */
export function assertOwnedMediaUri(uri: string, ownerRoot: string): void {
  const value = new URL(uri), root = new URL(ownerRoot);
  if (value.protocol !== 'file:' || root.protocol !== 'file:' || value.host !== root.host || value.search || value.hash
    || /%2f|%5c/i.test(value.pathname) || !value.href.startsWith(root.href.replace(/\/$/, '') + '/')) throw new Error('MEDIA_OWNER_MISMATCH');
}
