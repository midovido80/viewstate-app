import { queuePropertyDeletionCleanup } from "./propertyDeletionCleanup";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { createIndexedDbWebAttachmentBlobStore } from "./attachments";
import { assertOwnedMediaUri } from "./accountMedia";
import { createWorkspaceMedia } from "./workspaceMedia";
import {
  createWorkspaceSync,
  stableSync,
  type SyncRecords,
} from "./workspaceSync";
import {
  createWorkspaceCloud,
  createAccountCloudRequest,
} from "./workspaceCloud";
import {
  readBusiness,
  businessRecords,
  fromBusinessRecords,
  ASSISTANT_STORAGE_KEY,
  decodeAssistant,
  sameBusiness,
} from "./workspaceSnapshot";
import type { UserResources } from "@/contexts/UserDataContext";
import type { createGoogleAccountDevice } from "./googleAccountDevice";
type Device = Awaited<ReturnType<typeof createGoogleAccountDevice>>;
export function createWorkspaceSyncDevice(
  resources: UserResources,
  device: Device,
) {
  const access = resources.syncAccess,
    assert = resources.scope.assertActive;
  if (resources.scope.kind !== "google")
    throw new Error("SYNC_GOOGLE_ACCOUNT_REQUIRED");
  const request = createAccountCloudRequest(
    device.configuration,
    async () => {
      const { data, error } = await device.client.auth.getSession();
      assert();
      if (
        error ||
        !data.session ||
        data.session.user.id.toLowerCase() !== resources.scope.userId ||
        !data.session.expires_at ||
        data.session.expires_at * 1000 <= Date.now()
      )
        throw new Error("SYNC_REAUTHENTICATE");
      return data.session.access_token;
    },
    assert,
  );
  const blobs =
    Platform.OS === "web"
      ? createIndexedDbWebAttachmentBlobStore(resources.mediaDatabaseName)
      : undefined;
  const root =
    Platform.OS === "web"
      ? undefined
      : new FileSystem.Directory(
          FileSystem.Paths.document,
          resources.mediaDirectory,
          "synced",
        );
  const media = createWorkspaceMedia(
    {
      async read(uri) {
        if (blobs) {
          const blob = await blobs.get(uri);
          if (!blob) throw new Error("SYNC_MEDIA_MISSING");
          return blob.arrayBuffer();
        }
        assertOwnedMediaUri(
          uri,
          new FileSystem.Directory(
            FileSystem.Paths.document,
            resources.mediaDirectory,
          ).uri,
        );
        const file = new FileSystem.File(uri);
        if (!file.exists) throw new Error("SYNC_MEDIA_MISSING");
        return (await file.bytes()).buffer;
      },
      async hash(bytes) {
        const digest = await Crypto.digest(
          Crypto.CryptoDigestAlgorithm.SHA256,
          bytes,
        );
        return Array.from(new Uint8Array(digest), (x) =>
          x.toString(16).padStart(2, "0"),
        ).join("");
      },
      async upload(hash, bytes, mime) {
        const response = await request(
          `/storage/v1/object/account-workspace-media/${resources.scope.userId}/${hash}`,
          {
            method: "POST",
            body: bytes,
            contentType: mime,
            allowedStatus: [400, 409],
          },
        );
        if (!response.ok) {
          const prior = await request(
            `/storage/v1/object/authenticated/account-workspace-media/${resources.scope.userId}/${hash}`,
          );
          const body = await prior.arrayBuffer();
          if (
            body.byteLength !== bytes.byteLength ||
            !new Uint8Array(body).every(
              (x, i) => x === new Uint8Array(bytes)[i],
            )
          )
            throw new Error("SYNC_MEDIA_HASH_MISMATCH");
        }
      },
      async download(hash) {
        const response = await request(
          `/storage/v1/object/authenticated/account-workspace-media/${resources.scope.userId}/${hash}`,
        );
        return response.arrayBuffer();
      },
      async write(hash, bytes, mime) {
        if (blobs) {
          const uri = `viewstate-web-attachment:sync-${hash}`;
          await blobs.put(uri, new Blob([bytes], { type: mime }));
          return uri;
        }
        root!.create({ intermediates: true, idempotent: true });
        const file = new FileSystem.File(root!, hash);
        file.write(new Uint8Array(bytes));
        return file.uri;
      },
    },
    assert,
  );
  const recover = async () => {
    const raw = await access.storage.getItem(
      "@viewstate_sync_apply_recovery_v1",
    );
    if (!raw) return;
    const j = JSON.parse(raw);
    if (j.version !== 1) throw new Error("SYNC_JOURNAL_DAMAGED");
    const current = await readBusiness(access.store),
      assistant = decodeAssistant(
        await access.storage.getItem(ASSISTANT_STORAGE_KEY),
      );
    if (
      (!sameBusiness(current, j.before) && !sameBusiness(current, j.after)) ||
      (stableSync(assistant) !== stableSync(j.beforeAssistant) &&
        stableSync(assistant) !== stableSync(j.afterAssistant))
    )
      throw new Error("SYNC_RECOVERY_NEEDS_REVIEW");
    if (!sameBusiness(current, j.after))
      await access.store.replaceWorkspace(current, j.after);
    await access.storage.setItem(
      ASSISTANT_STORAGE_KEY,
      JSON.stringify(j.afterAssistant),
    );
    await access.storage.setItem("@viewstate_sync_apply_recovery_v1", "");
  };
  const read = () =>
    access.exclusive(async () => {
      await access.store.init();
      await recover();
      const data = await readBusiness(access.store),
        assistant = decodeAssistant(
          await access.storage.getItem(ASSISTANT_STORAGE_KEY),
        );
      return businessRecords(data, assistant);
    });
  let hydrated: { canonical: string; records: SyncRecords } | undefined;
  const engine = createWorkspaceSync(
    access.storage,
    {
      async read() {
        return media.encode(await read());
      },
      async validate(records) {
        const native = await media.decode(records);
        const assistant = decodeAssistant(
          await access.storage.getItem(ASSISTANT_STORAGE_KEY),
        );
        fromBusinessRecords(native, assistant);
        hydrated = { canonical: stableSync(records), records: native };
      },
      async apply(expected, next) {
        const decoded =
          hydrated?.canonical === stableSync(next)
            ? hydrated.records
            : await media.decode(next);

        let applied = false;
        await access.exclusive(async () => {
          assert();
          const current = await readBusiness(access.store),
            beforeAssistant = decodeAssistant(
              await access.storage.getItem(ASSISTANT_STORAGE_KEY),
            );
          const currentRecords = businessRecords(current, beforeAssistant);
          if (
            stableSync(media.canonical(currentRecords)) !== stableSync(expected)
          )
            throw new Error("SYNC_LOCAL_CHANGED");
          if (stableSync(expected) === stableSync(next)) return;
          const changed = fromBusinessRecords(decoded, beforeAssistant);
          const removed = new Set(changed.data.deletedPropertyIds ?? []);
          for (const property of current.properties) if (removed.has(property.core.id)) await queuePropertyDeletionCleanup(property, access.storage);
          const journal = JSON.stringify({
            version: 1,
            before: current,
            after: changed.data,
            beforeAssistant,
            afterAssistant: changed.assistant,
          });
          await access.storage.setItem(
            "@viewstate_sync_apply_recovery_v1",
            journal,
          );
          if (
            (await access.storage.getItem(
              "@viewstate_sync_apply_recovery_v1",
            )) !== journal
          )
            throw new Error("SYNC_JOURNAL_FAILED");
          if (!sameBusiness(current, changed.data))
            await access.store.replaceWorkspace(current, changed.data);
          await access.storage.setItem(
            ASSISTANT_STORAGE_KEY,
            JSON.stringify(changed.assistant),
          );
          assert();
          if (
            (await access.storage.getItem(ASSISTANT_STORAGE_KEY)) !==
            JSON.stringify(changed.assistant)
          )
            throw new Error("SYNC_ASSISTANT_READBACK_FAILED");
          await access.storage.setItem("@viewstate_sync_apply_recovery_v1", "");
          applied = true;
        });
        if (applied) resources.notifySync();
      },
    },
    createWorkspaceCloud(request, resources.scope.userId),
    assert,
  );
  return engine;
}
