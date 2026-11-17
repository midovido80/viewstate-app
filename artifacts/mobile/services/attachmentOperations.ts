export type AttachmentKind = 'image' | 'video' | 'pdf';

export interface LocalAttachment {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly originalName: string;
  readonly mimeType: string;
  readonly uri: string;
  readonly order: number;
  readonly isCover?: true;
}

export interface WebAttachmentObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export async function resolveWebAttachmentImageSources(
  attachments: readonly Pick<LocalAttachment, 'id' | 'kind' | 'uri'>[],
  blobStore: { get(reference: string): Promise<Blob | null> },
  objectUrls: WebAttachmentObjectUrlApi = URL,
): Promise<{ readonly sources: Readonly<Record<string, string>>; readonly revoke: () => void }> {
  const sources: Record<string, string> = {};
  const transientUrls: string[] = [];
  try {
    for (const attachment of attachments) {
      if (attachment.kind !== 'image') continue;
      if (!attachment.uri.startsWith('viewstate-web-attachment:')) {
        sources[attachment.id] = attachment.uri;
        continue;
      }
      const blob = await blobStore.get(attachment.uri);
      if (!blob) throw new Error('ATTACHMENT_FILE_MISSING');
      const objectUrl = objectUrls.createObjectURL(blob);
      transientUrls.push(objectUrl);
      sources[attachment.id] = objectUrl;
    }
  } catch (error) {
    transientUrls.forEach(url => objectUrls.revokeObjectURL(url));
    throw error;
  }
  let revoked = false;
  return {
    sources,
    revoke: () => {
      if (revoked) return;
      revoked = true;
      transientUrls.forEach(url => objectUrls.revokeObjectURL(url));
    },
  };
}

export interface AttachmentFileStore {
  copyToProperty(
    propertyId: string,
    attachmentId: string,
    source: { readonly uri: string; readonly name: string; readonly mimeType: string },
  ): Promise<string>;
  /** Requirement evidence is stored separately from Property attachments. */
  copyToRequirement?(
    requirementId: string,
    attachmentId: string,
    source: { readonly uri: string; readonly name: string; readonly mimeType: string },
  ): Promise<string>;
  delete(uri: string): Promise<void>;
}

export function reorderAttachments(
  attachments: readonly LocalAttachment[],
  orderedIds: readonly string[],
): LocalAttachment[] {
  if (
    orderedIds.length !== attachments.length
    || new Set(orderedIds).size !== orderedIds.length
  ) throw new Error('INVALID_ATTACHMENT_ORDER');
  const byId = new Map(attachments.map(attachment => [attachment.id, attachment]));
  return orderedIds.map((id, order) => {
    const attachment = byId.get(id);
    if (!attachment) throw new Error('INVALID_ATTACHMENT_ORDER');
    return { ...attachment, order };
  });
}

export function setAttachmentCover(
  attachments: readonly LocalAttachment[],
  coverId: string | null,
): LocalAttachment[] {
  if (coverId !== null && !attachments.some(item => item.id === coverId && item.kind === 'image')) {
    throw new Error('ATTACHMENT_COVER_MUST_BE_IMAGE');
  }
  return attachments.map(attachment => {
    const { isCover: _isCover, ...withoutCover } = attachment;
    return attachment.id === coverId
      ? { ...withoutCover, isCover: true }
      : withoutCover;
  });
}

/** Metadata durability deliberately precedes deletion of removed local files. */
export async function persistAttachmentsThenDeleteRemoved(
  previous: readonly LocalAttachment[],
  next: readonly LocalAttachment[],
  persistMetadata: (attachments: readonly LocalAttachment[]) => Promise<void>,
  fileStore: AttachmentFileStore,
): Promise<void> {
  await persistMetadata(next);
  const retained = new Set(next.map(attachment => attachment.id));
  for (const attachment of previous) {
    if (!retained.has(attachment.id)) await fileStore.delete(attachment.uri);
  }
}

/** New files are owned only after metadata persistence succeeds. */
export async function persistNewAttachmentsOrDeleteOnFailure(
  newlyCopied: readonly LocalAttachment[],
  persistMetadata: () => Promise<boolean>,
  fileStore: AttachmentFileStore,
): Promise<void> {
  try {
    if (!await persistMetadata()) throw new Error('ATTACHMENT_METADATA_PERSIST_FAILED');
  } catch (error) {
    await Promise.all(newlyCopied.map(attachment => fileStore.delete(attachment.uri).catch(() => undefined)));
    throw error;
  }
}