import { verifyGuestMediaCopy } from './guestMediaVerification';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { createIndexedDbWebAttachmentBlobStore } from './attachments';
import { assertOwnedMediaUri } from './accountMedia';
import { transferGuest, type GuestSnapshot } from './guestTransfer';
import type { UserResources } from '@/contexts/UserDataContext';
async function sameBytes(a: ArrayBuffer, b: ArrayBuffer) {
  const x = new Uint8Array(a), y = new Uint8Array(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
export function transferGuestDevice(guest: UserResources, target: UserResources) {
  if (guest.scope.kind !== 'guest' || target.scope.kind !== 'google') throw new Error('INVALID_TRANSFER_SCOPES');
  const active = () => { guest.scope.assertActive(); target.scope.assertActive(); };
  return transferGuest({ guest: { ...guest, assertActive: guest.scope.assertActive }, target: { ...target, assertActive: target.scope.assertActive }, targetUserId: target.scope.userId,
    async rewriteMedia(snapshot: GuestSnapshot) {
      let raw = JSON.stringify(snapshot); active();
      if (Platform.OS === 'web') {
        const source = createIndexedDbWebAttachmentBlobStore(guest.mediaDatabaseName), destination = createIndexedDbWebAttachmentBlobStore(target.mediaDatabaseName);
        for (const uri of new Set(raw.match(/viewstate-web-attachment:[^"\\\s]+/g) ?? [])) {
          active(); const blob = await source.get(uri); if (!blob) throw new Error('GUEST_MEDIA_MISSING');
          const prior = await destination.get(uri);
          if (prior && !await sameBytes(await prior.arrayBuffer(), await blob.arrayBuffer())) throw new Error('GUEST_MEDIA_CONFLICT');
          active(); if (!prior) await destination.put(uri, blob);
          const stored = await destination.get(uri); if (!stored || !await sameBytes(await stored.arrayBuffer(), await blob.arrayBuffer())) throw new Error('GUEST_MEDIA_READBACK_FAILED');
        }
      } else {
        const sourceRoot = new FileSystem.Directory(FileSystem.Paths.document, guest.mediaDirectory).uri.replace(/\/$/, '') + '/';
        const targetRoot = new FileSystem.Directory(FileSystem.Paths.document, target.mediaDirectory).uri.replace(/\/$/, '') + '/';
        for (const uri of new Set(raw.match(/file:\/\/[^"\\\s]+/g) ?? [])) {
          active(); assertOwnedMediaUri(uri, sourceRoot);
          const relative = uri.slice(sourceRoot.length), slash = relative.lastIndexOf('/');
          const folder = new FileSystem.Directory(FileSystem.Paths.document, target.mediaDirectory, relative.slice(0, slash));
          await folder.create({ intermediates: true, idempotent: true });
          const source = new FileSystem.File(uri), destination = new FileSystem.File(folder, relative.slice(slash + 1));
          if (!source.exists) throw new Error('GUEST_MEDIA_MISSING');
          if (destination.exists && !await verifyGuestMediaCopy(source, destination, active)) throw new Error('GUEST_MEDIA_CONFLICT');
          active(); if (!destination.exists) await source.copy(destination);
          if (!await verifyGuestMediaCopy(source, destination, active)) throw new Error('GUEST_MEDIA_READBACK_FAILED');
        }
        raw = raw.split(sourceRoot).join(targetRoot);
      }
      active(); return JSON.parse(raw) as GuestSnapshot;
    },
  });
}
