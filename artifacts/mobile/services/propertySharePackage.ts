import type { MediaAccess } from './accountMedia';
import * as Crypto from 'expo-crypto';
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';
import type { ResolvedLocalShareFile, SelectedLocalFileShareAdapter } from '@/services/propertySharing';

const safeName = (name: string, mimeType: string, index: number) => {
  const extension = name.match(/(\.[a-z0-9]{1,10})$/i)?.[1]?.toLowerCase()
    ?? (mimeType === 'application/pdf' ? '.pdf' : mimeType.split('/')[1] ? `.${mimeType.split('/')[1]}` : '');
  return `${String(index + 1).padStart(2, '0')}-attachment${extension}`;
};

/**
 * One reviewed package, one platform share invocation. Original managed files
 * are read only; only the temporary zip is removed after the share settles.
 */
export async function shareReviewedPropertyPackage(input: {
  text: string;
  files: readonly ResolvedLocalShareFile[];
  shareZip: (uri: string) => Promise<void>;
  access?: MediaAccess;
}): Promise<void> {
  input.access?.assertActive();
  const zip = new JSZip();
  zip.file('property-preview.txt', input.text);
  for (const [index, file] of input.files.entries()) {
    input.access?.assertUri(file.uri);
    const source = new FileSystem.File(file.uri) as unknown as { arrayBuffer(): Promise<ArrayBuffer> };
    zip.file(`attachments/${safeName(file.name, file.mimeType, index)}`, await source.arrayBuffer());
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  input.access?.assertActive();
  const folder = new FileSystem.Directory(FileSystem.Paths.cache, ...(input.access ? [input.access.cacheDirectory] : []), 'property-share-packages');
  await folder.create({ idempotent: true, intermediates: true });
  const output = new FileSystem.File(folder, `property-${Crypto.randomUUID()}.zip`) as unknown as {
    uri: string; write(value: Uint8Array): Promise<void> | void; delete(): Promise<void> | void;
  };
  await output.write(bytes);
  try {
    input.access?.assertActive();
    await input.shareZip(output.uri);
  } finally {
    try {
      await output.delete();
    } catch {
      // Cleanup must not replace the platform share result. The temporary file
      // remains confined to the cache directory if deletion is unavailable.
    }
  }
}

export function createPropertyPackageShareAdapter(
  attachments: readonly { id: string; managedUri: string; mimeType: string; originalName: string }[],
  shareZip: (uri: string) => Promise<void>,
  coverShare?: {
    readonly attachmentId: string;
    readonly shareWithText: (input: { uri: string; mimeType: string; text: string }) => Promise<void>;
  },
  access?: MediaAccess,
): SelectedLocalFileShareAdapter {
  return {
    async resolveSelectedLocalFiles(ids) {
      access?.assertActive();
      return ids.map(id => {
        const attachment = attachments.find(item => item.id === id);
        if (!attachment) throw new Error('LOCAL_FILE_SHARE_RESOLUTION_MISMATCH');
        access?.assertUri(attachment.managedUri);
        return { attachmentId: id, uri: attachment.managedUri, mimeType: attachment.mimeType, name: attachment.originalName };
      });
    },
    async shareSelectedLocalFiles({ text, files }) {
      access?.assertActive();
      files.forEach(file => access?.assertUri(file.uri));
      if (
        coverShare
        && files.length === 1
        && files[0].attachmentId === coverShare.attachmentId
      ) {
        await coverShare.shareWithText({
          uri: files[0].uri,
          mimeType: files[0].mimeType,
          text,
        });
        return;
      }
      await shareReviewedPropertyPackage({ text, files, shareZip, access });
    },
  };
}