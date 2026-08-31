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
}): Promise<void> {
  const zip = new JSZip();
  zip.file('property-preview.txt', input.text);
  for (const [index, file] of input.files.entries()) {
    const source = new FileSystem.File(file.uri) as unknown as { arrayBuffer(): Promise<ArrayBuffer> };
    zip.file(`attachments/${safeName(file.name, file.mimeType, index)}`, await source.arrayBuffer());
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const folder = new FileSystem.Directory(FileSystem.Paths.cache, 'property-share-packages');
  await folder.create({ idempotent: true, intermediates: true });
  const output = new FileSystem.File(folder, `property-${Date.now()}.zip`) as unknown as {
    uri: string; write(value: Uint8Array): Promise<void> | void; delete(): Promise<void> | void;
  };
  await output.write(bytes);
  try {
    await input.shareZip(output.uri);
  } finally {
    await output.delete();
  }
}

export function createPropertyPackageShareAdapter(
  attachments: readonly { id: string; managedUri: string; mimeType: string; originalName: string }[],
  shareZip: (uri: string) => Promise<void>,
  coverShare?: {
    readonly attachmentId: string;
    readonly shareWithText: (input: { uri: string; mimeType: string; text: string }) => Promise<void>;
  },
): SelectedLocalFileShareAdapter {
  return {
    async resolveSelectedLocalFiles(ids) {
      return ids.map(id => {
        const attachment = attachments.find(item => item.id === id);
        if (!attachment) throw new Error('LOCAL_FILE_SHARE_RESOLUTION_MISMATCH');
        return { attachmentId: id, uri: attachment.managedUri, mimeType: attachment.mimeType, name: attachment.originalName };
      });
    },
    async shareSelectedLocalFiles({ text, files }) {
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
      await shareReviewedPropertyPackage({ text, files, shareZip });
    },
  };
}