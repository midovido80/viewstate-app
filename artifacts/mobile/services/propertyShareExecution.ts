import type { PropertySharePreview } from '@workspace/property-domain';

export interface ResolvedLocalShareFile {
  readonly attachmentId: string;
  readonly uri: string;
  readonly mimeType: string;
  readonly name: string;
}

/**
 * Adapter boundary for local files. This module intentionally has no React
 * Native dependency so its selection and ordering contract is executable in
 * synthetic environments.
 */
export interface SelectedLocalFileShareAdapter {
  resolveSelectedLocalFiles(
    attachmentIds: readonly string[],
  ): Promise<readonly ResolvedLocalShareFile[]>;
  shareSelectedLocalFiles(input: {
    readonly text: string;
    readonly files: readonly ResolvedLocalShareFile[];
  }): Promise<void>;
}

export type TextShareAdapter = (text: string) => Promise<unknown>;

/**
 * Executes an already-reviewed preview without rebuilding it. The resolved
 * file list must exactly match the selected attachment IDs and their order.
 */
export async function executePropertySharePreview(
  preview: PropertySharePreview,
  fileAdapter: SelectedLocalFileShareAdapter | undefined,
  shareText: TextShareAdapter,
): Promise<void> {
  if (preview.attachmentIds.length === 0) {
    await shareText(preview.text);
    return;
  }
  if (fileAdapter === undefined) {
    throw new Error('LOCAL_FILE_SHARE_ADAPTER_REQUIRED');
  }

  const files = await fileAdapter.resolveSelectedLocalFiles(preview.attachmentIds);
  if (
    files.length !== preview.attachmentIds.length
    || files.some((file, index) => file.attachmentId !== preview.attachmentIds[index])
  ) {
    throw new Error('LOCAL_FILE_SHARE_RESOLUTION_MISMATCH');
  }
  await fileAdapter.shareSelectedLocalFiles({ text: preview.text, files });
}