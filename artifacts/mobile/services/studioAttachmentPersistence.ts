import type { PropertyAttachmentMetadata, SeekerRequirement } from '@workspace/property-domain';
import type { RequirementStore } from '@/services/requirementPersistence';
import {
  type AttachmentFileStore,
  type LocalAttachment,
} from '@/services/attachmentOperations';
import type { AttachmentSource } from '@/services/attachments';
import { requirementsEquivalent } from '@/services/requirementSaveOutcome';

const NORMAL_ATTACHMENT_PRIVACY = {
  classification: 'normal' as const,
  disclosurePolicy: 'normal' as const,
};

export type RequirementAttachmentSaveResult =
  | { readonly status: 'saved'; readonly requirement: SeekerRequirement }
  | { readonly status: 'missing' }
  | { readonly status: 'conflict' }
  | { readonly status: 'storage_failure' }
  | { readonly status: 'recovery_required' };

function metadataFromLocal(attachment: LocalAttachment): PropertyAttachmentMetadata {
  return {
    id: attachment.id,
    kind: attachment.kind,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    order: attachment.order,
    managedUri: attachment.uri,
    ...(attachment.isCover ? { isCover: true } : {}),
    privacy: NORMAL_ATTACHMENT_PRIVACY,
  };
}

function localFromMetadata(attachment: PropertyAttachmentMetadata): LocalAttachment {
  return {
    id: attachment.id,
    kind: attachment.kind,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    uri: attachment.managedUri,
    order: attachment.order,
    ...(attachment.isCover ? { isCover: true } : {}),
  };
}

function sameRequirement(
  left: SeekerRequirement | null,
  right: SeekerRequirement,
): boolean {
  return requirementsEquivalent(left, right);
}

function attachmentSourcesSupported(sources: readonly AttachmentSource[]): void {
  for (const source of sources) {
    if (
      !source.mimeType.startsWith('image/')
      && !source.mimeType.startsWith('video/')
      && source.mimeType !== 'application/pdf'
    ) throw new Error('UNSUPPORTED_ATTACHMENT_TYPE');
  }
}

/** Copies newly picked media into a directory owned by this Requirement ID. */
export async function prepareRequirementAttachments(options: {
  readonly requirementId: string;
  readonly existing: readonly LocalAttachment[];
  readonly sources: readonly AttachmentSource[];
  readonly fileStore: AttachmentFileStore & Required<Pick<AttachmentFileStore, 'copyToRequirement'>>;
  readonly createId?: () => string;
}): Promise<LocalAttachment[]> {
  const { requirementId, existing, sources, fileStore } = options;
  attachmentSourcesSupported(sources);
  const ids = new Set(existing.map(item => item.id));
  const created: LocalAttachment[] = [];
  try {
    for (const source of sources) {
      const id = (options.createId ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2)}`))();
      if (ids.has(id)) throw new Error('DUPLICATE_ATTACHMENT_ID');
      ids.add(id);
      const uri = await fileStore.copyToRequirement(requirementId, id, source);
      created.push({
        id,
        kind: source.mimeType.startsWith('image/')
          ? 'image'
          : source.mimeType.startsWith('video/') ? 'video' : 'pdf',
        originalName: source.name,
        mimeType: source.mimeType,
        uri,
        order: existing.reduce((max, item) => Math.max(max, item.order), -1) + created.length + 1,
      });
    }
    return created;
  } catch (error) {
    await Promise.all(created.map(item => fileStore.delete(item.uri).catch(() => undefined)));
    throw error;
  }
}

async function bestEffortDelete(
  attachments: readonly LocalAttachment[],
  fileStore: AttachmentFileStore,
): Promise<void> {
  await Promise.all(attachments.map(item => fileStore.delete(item.uri).catch(() => undefined)));
}

/**
 * Persists one exact Requirement ID, resolves ambiguous writes by ID readback,
 * and only retires old media after the saved metadata is confirmed. Prepared
 * blobs remain caller-owned on every non-saved outcome so a safe retry or
 * confirmation-only recovery never references a file that was already removed.
 */
export async function saveRequirementAttachments(options: {
  readonly candidate: SeekerRequirement;
  readonly baseline: SeekerRequirement | null;
  readonly store: RequirementStore;
  readonly fileStore: AttachmentFileStore;
  /** Native source files are copied under requirements/<id>/attachments. */
  readonly sources?: readonly AttachmentSource[];
  /** Web files may be prepared by createWebRequirementAttachments first. */
  readonly preparedAttachments?: readonly LocalAttachment[];
}): Promise<RequirementAttachmentSaveResult> {
  const { candidate, baseline, store, fileStore } = options;
  const id = candidate.id;
  const prepared = [...(options.preparedAttachments ?? [])];
  if (baseline && baseline.id !== id) {
    return { status: 'conflict' };
  }
  let initial: SeekerRequirement | null;
  try {
    initial = await store.getRequirement(id);
  } catch {
    return { status: 'storage_failure' };
  }
  if (baseline) {
    if (!initial) {
      return { status: 'missing' };
    }
    if (!sameRequirement(initial, baseline)) {
      return { status: 'conflict' };
    }
  } else if (initial) {
    return { status: 'conflict' };
  }

  const priorMetadata = baseline?.attachments ?? [];
  let next: SeekerRequirement;
  try {
    if ((options.sources?.length ?? 0) > 0) {
      prepared.push(...await prepareRequirementAttachments({
        requirementId: id,
        existing: [
          ...(candidate.attachments ?? []).map(localFromMetadata),
          ...prepared,
        ],
        sources: options.sources!,
        fileStore: fileStore as AttachmentFileStore & Required<Pick<AttachmentFileStore, 'copyToRequirement'>>,
      }));
    }
    const candidateAttachments = [
      ...(candidate.attachments ?? []),
      ...prepared.map(metadataFromLocal),
    ];
    next = {
      ...candidate,
      ...(candidateAttachments.length ? { attachments: candidateAttachments } : {}),
    } as SeekerRequirement;
    // When all files are removed, absence is the stable normalized shape.
    if (candidateAttachments.length === 0 && candidate.attachments === undefined) {
      delete (next as unknown as { attachments?: readonly PropertyAttachmentMetadata[] }).attachments;
    }
  } catch (error) {
    throw error;
  }

  let writeError = false;
  let updated = false;
  try {
    if (baseline) updated = await store.updateRequirement(baseline, next);
    else {
      await store.saveRequirement(next);
      updated = true;
    }
  } catch {
    writeError = true;
  }

  let readback: SeekerRequirement | null;
  try {
    readback = await store.getRequirement(id);
  } catch {
    // The write may have committed. Keep copied files until exact ownership is known.
    return { status: 'recovery_required' };
  }
  if (sameRequirement(readback, next)) {
    const retained = new Set((next.attachments ?? []).map(item => `${item.id}\u0000${item.managedUri}`));
    const removed = priorMetadata
      .filter(item => !retained.has(`${item.id}\u0000${item.managedUri}`))
      .map(localFromMetadata);
    await bestEffortDelete(removed, fileStore);
    return { status: 'saved', requirement: readback! };
  }

  const writeDefinitelyFailed = baseline
    ? sameRequirement(readback, baseline)
    : readback === null;
  if (writeDefinitelyFailed) {
    if (baseline && !updated && !writeError) return { status: 'conflict' };
    return { status: 'storage_failure' };
  }
  return { status: 'recovery_required' };
}