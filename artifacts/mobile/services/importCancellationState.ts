export const IMPORT_INBOX_KEY = "@viewstate/import-inbox/v1";
export async function assertImportNotCancelled(
  storage: { getItem(key: string): Promise<string | null> },
  id: string,
) {
  if (
    await storage.getItem(
      "@viewstate/import-cancel/v1/" + encodeURIComponent(id),
    )
  )
    throw Error("IMPORT_CANCELLED");
  const raw = await storage.getItem(IMPORT_INBOX_KEY);
  if (!raw) return;
  const inbox = JSON.parse(raw);
  if (inbox?.cancelledIds?.includes(id)) throw Error("IMPORT_CANCELLED");
}
export function formImportId(identity: string): string | undefined {
  if (identity.startsWith("import-review:"))
    return identity.slice("import-review:".length);
  const index = identity.lastIndexOf(":import:");
  return index < 0 ? undefined : identity.slice(index + 8);
}
