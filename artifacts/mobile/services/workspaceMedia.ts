import type { SyncRecords } from "./workspaceSync";
import type { Property } from "@workspace/property-domain";
export interface SyncMediaPort {
  read(uri: string): Promise<ArrayBuffer>;
  hash(bytes: ArrayBuffer): Promise<string>;
  upload(hash: string, bytes: ArrayBuffer, mime: string): Promise<void>;
  download(hash: string): Promise<ArrayBuffer>;
  write(hash: string, bytes: ArrayBuffer, mime: string): Promise<string>;
}
const prefix = "viewstate-cloud-media:";
export function createWorkspaceMedia(
  port: SyncMediaPort,
  assertActive: () => void,
) {
  const uploaded = new Set<string>(),
    local = new Map<string, string>(),
    hashByUri = new Map<string, string>();
  async function rewrite(records: SyncRecords, toCloud: boolean) {
    const result: SyncRecords = { ...records };
    for (const [key, value] of Object.entries(records)) {
      if (!key.startsWith("property/")) continue;
      const p = value as Property;
      if (!Array.isArray(p?.attachments)) continue;
      const attachments = [];
      for (const item of p.attachments) {
        assertActive();
        let uri = item.managedUri;
        if (toCloud) {
          if (uri.startsWith(prefix)) {
            if (!/^[0-9a-f]{64}$/.test(uri.slice(prefix.length)))
              throw new Error("SYNC_MEDIA_REFERENCE");
          } else {
            const bytes = await port.read(uri);
            assertActive();
            const hash = await port.hash(bytes);
            if (!/^[0-9a-f]{64}$/.test(hash))
              throw new Error("SYNC_MEDIA_HASH");
            if (!uploaded.has(hash)) {
              await port.upload(hash, bytes, item.mimeType);
              assertActive();
              uploaded.add(hash);
            }
            local.set(hash, uri);
            hashByUri.set(uri, hash);
            uri = prefix + hash;
          }
        } else {
          if (
            !uri.startsWith(prefix) ||
            !/^[0-9a-f]{64}$/.test(uri.slice(prefix.length))
          )
            throw new Error("SYNC_MEDIA_REFERENCE");
          const hash = uri.slice(prefix.length);
          const existing = local.get(hash);
          if (existing) {
            uri = existing;
          } else {
            const bytes = await port.download(hash);
            assertActive();
            if ((await port.hash(bytes)) !== hash)
              throw new Error("SYNC_MEDIA_HASH_MISMATCH");
            uri = await port.write(hash, bytes, item.mimeType);
            assertActive();
            local.set(hash, uri);
            hashByUri.set(uri, hash);
            uploaded.add(hash);
          }
        }
        attachments.push({ ...item, managedUri: uri });
      }
      result[key] = { ...p, attachments };
    }
    return result;
  }
  function canonical(records: SyncRecords): SyncRecords {
    const result = { ...records };
    for (const [key, value] of Object.entries(records)) {
      if (!key.startsWith("property/")) continue;
      const p = value as Property;
      if (!p.attachments) continue;
      result[key] = {
        ...p,
        attachments: p.attachments.map((item) => {
          if (item.managedUri.startsWith(prefix)) return item;
          const hash = hashByUri.get(item.managedUri);
          if (!hash) throw new Error("SYNC_LOCAL_CHANGED");
          return { ...item, managedUri: prefix + hash };
        }),
      };
    }
    return result;
  }
  return {
    canonical,
    encode: (records: SyncRecords) => rewrite(records, true),
    decode: (records: SyncRecords) => rewrite(records, false),
  };
}
