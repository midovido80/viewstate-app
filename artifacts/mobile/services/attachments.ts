import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import {
  persistAttachmentsThenDeleteRemoved,
  persistNewAttachmentsOrDeleteOnFailure,
  reorderAttachments,
  setAttachmentCover,
  type AttachmentFileStore,
  type AttachmentKind,
  type LocalAttachment,
} from './attachmentOperations';
import { generateDomainId } from '@/services/identity';

export type { AttachmentFileStore, AttachmentKind, LocalAttachment } from './attachmentOperations';
export { persistAttachmentsThenDeleteRemoved, persistNewAttachmentsOrDeleteOnFailure, reorderAttachments, setAttachmentCover } from './attachmentOperations';

export interface AttachmentSource {
  readonly uri: string;
  readonly name: string;
  readonly mimeType: string;
}

export interface DocumentPickerModule {
  getDocumentAsync(options: {
    type: string[];
    multiple: boolean;
    copyToCacheDirectory: boolean;
  }): Promise<
    | { canceled: true; assets?: null }
    | { canceled: false; assets: readonly {
      uri: string;
      name: string;
      mimeType?: string | null;
    }[] }
  >;
}

export interface ExpoFileSystemModule {
  readonly Paths: { readonly document: unknown };
  readonly Directory: new (...parts: any[]) => {
    readonly uri: string;
    create(options: { intermediates: boolean; idempotent: boolean }): void | Promise<void>;
  };
  readonly File: new (...parts: any[]) => {
    readonly uri: string;
    readonly exists: boolean;
    copy(destination: unknown): void | Promise<void>;
    delete(): void | Promise<void>;
  };
}

export interface SharingModule {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options?: { mimeType?: string }): Promise<void>;
}

export interface AttachmentDependencies {
  readonly fileStore: AttachmentFileStore;
  readonly createId?: () => string;
  readonly platform?: string;
}

export interface ImagePickerModule {
  requestMediaLibraryPermissionsAsync(): Promise<{ granted: boolean }>;
  launchImageLibraryAsync(options: {
    mediaTypes: ('images' | 'videos')[];
    allowsMultipleSelection: boolean;
    quality: number;
  }): Promise<
    | { canceled: true; assets?: null }
    | { canceled: false; assets: readonly {
      uri: string;
      fileName?: string | null;
      mimeType?: string | null;
    }[] }
  >;
}

function attachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  throw new Error('UNSUPPORTED_ATTACHMENT_TYPE');
}

function assertNative(platform: string = Platform.OS) {
  if (platform === 'web') throw new Error('LOCAL_ATTACHMENTS_UNSUPPORTED_ON_WEB');
}

export const WEB_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

export interface WebAttachmentBlobStore {
  put(reference: string, blob: Blob): Promise<void>;
  get(reference: string): Promise<Blob | null>;
  delete(reference: string): Promise<void>;
}

export function createIndexedDbWebAttachmentBlobStore(
  databaseName = 'viewstate-web-attachments',
): WebAttachmentBlobStore {
  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('blobs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('WEB_ATTACHMENT_INDEXEDDB_OPEN_FAILED'));
  });
  const transaction = (mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest) =>
    database.then(db => new Promise<any>((resolve, reject) => {
      const request = operation(db.transaction('blobs', mode).objectStore('blobs'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('WEB_ATTACHMENT_INDEXEDDB_FAILED'));
    }));
  return {
    put: (reference, blob) => transaction('readwrite', store => store.put(blob, reference)).then(() => undefined),
    get: reference => transaction('readonly', store => store.get(reference)),
    delete: reference => transaction('readwrite', store => store.delete(reference)).then(() => undefined),
  };
}

export function createWebAttachmentFileStore(blobStore: WebAttachmentBlobStore): AttachmentFileStore {
  return {
    copyToProperty: async () => { throw new Error('WEB_ATTACHMENT_COPY_REQUIRES_FILE_PICKER'); },
    delete: uri => uri.startsWith('viewstate-web-attachment:') ? blobStore.delete(uri) : Promise.resolve(),
  };
}

export async function createWebFileAttachments(
  propertyId: string,
  existing: readonly LocalAttachment[],
  files: readonly { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }[],
  createId: () => string = defaultId,
  blobStore: WebAttachmentBlobStore = createIndexedDbWebAttachmentBlobStore(),
): Promise<LocalAttachment[]> {
  const result: LocalAttachment[] = [];
  const written: string[] = [];
  try {
    for (const file of files) {
      if (!['image/', 'video/'].some(prefix => file.type.startsWith(prefix)) && file.type !== 'application/pdf') {
        throw new Error('UNSUPPORTED_ATTACHMENT_TYPE');
      }
      if (file.size > WEB_ATTACHMENT_MAX_BYTES) throw new Error('ATTACHMENT_TOO_LARGE');
      const id = createId();
      const uri = `viewstate-web-attachment:${encodeURIComponent(propertyId)}:${encodeURIComponent(id)}`;
      await blobStore.put(uri, new Blob([await file.arrayBuffer()], { type: file.type }));
      written.push(uri);
      result.push({ id, kind: attachmentKind(file.type), originalName: file.name, mimeType: file.type, uri, order: existing.length + result.length });
    }
    return result;
  } catch (error) {
    await Promise.all(written.map(uri => blobStore.delete(uri).catch(() => undefined)));
    throw error;
  }
}

function defaultId(): string {
  return generateDomainId();
}

function nameFromUri(uri: string, fallback: string): string {
  const lastSegment = uri.split(/[\\/]/).pop()?.split('?')[0];
  return lastSegment ? decodeURIComponent(lastSegment) : fallback;
}

function extensionFor(source: AttachmentSource): string {
  const fromName = source.name.match(/(\.[a-z0-9]{1,10})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  if (source.mimeType === 'application/pdf') return '.pdf';
  const subtype = source.mimeType.split('/')[1]?.replace('quicktime', 'mov');
  return subtype ? `.${subtype}` : '';
}

export function createExpoFileStore(module: ExpoFileSystemModule): AttachmentFileStore {
  return {
    async copyToProperty(propertyId, attachmentId, source) {
      assertNative();
      const directory = new module.Directory(
        module.Paths.document,
        'properties',
        encodeURIComponent(propertyId),
        'attachments',
      );
      await directory.create({ intermediates: true, idempotent: true });
      const destination = new module.File(
        directory,
        `${encodeURIComponent(attachmentId)}${extensionFor(source)}`,
      );
      const input = new module.File(source.uri);
      await input.copy(destination);
      return destination.uri;
    },
    async delete(uri) {
      assertNative();
      await new module.File(uri).delete();
    },
  };
}

async function storeSources(
  propertyId: string,
  existing: readonly LocalAttachment[],
  sources: readonly AttachmentSource[],
  dependencies: AttachmentDependencies,
): Promise<LocalAttachment[]> {
  assertNative(dependencies.platform);
  const result: LocalAttachment[] = [];
  for (const source of sources) {
    if (
      !source.mimeType.startsWith('image/')
      && !source.mimeType.startsWith('video/')
      && source.mimeType !== 'application/pdf'
    ) {
      throw new Error('UNSUPPORTED_ATTACHMENT_TYPE');
    }
    const id = (dependencies.createId ?? defaultId)();
    if (existing.some(item => item.id === id) || result.some(item => item.id === id)) {
      throw new Error('DUPLICATE_ATTACHMENT_ID');
    }
    const uri = await dependencies.fileStore.copyToProperty(propertyId, id, source);
    result.push({
      id,
      kind: attachmentKind(source.mimeType),
      originalName: source.name,
      mimeType: source.mimeType,
      uri,
      order: existing.length + result.length,
    });
  }
  return result;
}

export async function pickAndStoreMedia(
  propertyId: string,
  existing: readonly LocalAttachment[],
  dependencies: AttachmentDependencies,
  imagePicker: ImagePickerModule = ImagePicker,
  mediaTypes: ('images' | 'videos')[] = ['images', 'videos'],
): Promise<LocalAttachment[]> {
  assertNative(dependencies.platform);
  const permission = await imagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('MEDIA_LIBRARY_PERMISSION_DENIED');
  const picked = await imagePicker.launchImageLibraryAsync({
    mediaTypes,
    allowsMultipleSelection: true,
    quality: 1,
  });
  if (picked.canceled) return [];
  const sources = picked.assets.map((asset, index): AttachmentSource => {
    const mimeType = asset.mimeType;
    if (!mimeType) throw new Error('ATTACHMENT_MIME_TYPE_MISSING');
    return {
      uri: asset.uri,
      name: asset.fileName ?? nameFromUri(asset.uri, `media-${index + 1}`),
      mimeType,
    };
  });
  return storeSources(propertyId, existing, sources, dependencies);
}

export async function pickAndStorePdfs(
  propertyId: string,
  existing: readonly LocalAttachment[],
  documentPicker: DocumentPickerModule,
  dependencies: AttachmentDependencies,
): Promise<LocalAttachment[]> {
  assertNative(dependencies.platform);
  const picked = await documentPicker.getDocumentAsync({
    type: ['application/pdf'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return [];
  const sources = (picked.assets ?? []).map(asset => ({
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/pdf',
  }));
  return storeSources(propertyId, existing, sources, dependencies);
}

export async function openAttachment(
  attachment: LocalAttachment,
  sharing: SharingModule,
  platform: string = Platform.OS,
  opener: LinkOpener = Linking,
  fileSystem: AttachmentOpenFileSystem = {
    fileExists: uri => new FileSystem.File(uri).exists,
    getContentUriAsync: uri => LegacyFileSystem.getContentUriAsync(uri),
  },
  intentLauncher: AndroidIntentLauncher = IntentLauncher,
  webBlobStore?: WebAttachmentBlobStore,
): Promise<void> {
  if (platform === 'web') {
    if (attachment.uri.startsWith('viewstate-web-attachment:')) {
      const blob = await (webBlobStore ?? createIndexedDbWebAttachmentBlobStore()).get(attachment.uri);
      if (!blob) throw new Error('ATTACHMENT_FILE_MISSING');
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return;
    }
    if (attachment.uri.startsWith('data:')) {
      window.open(attachment.uri, '_blank', 'noopener,noreferrer');
      return;
    }
    throw new Error('LOCAL_ATTACHMENTS_UNSUPPORTED_ON_WEB');
  }
  assertNative(platform);
  let exists = false;
  try {
    exists = !!await fileSystem.fileExists(attachment.uri);
  } catch {
    exists = false;
  }
  if (!exists) {
    throw new Error('ATTACHMENT_FILE_MISSING');
  }
  if (platform === 'android') {
    try {
      const contentUri = await fileSystem.getContentUriAsync(attachment.uri);
      await intentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: attachment.mimeType,
        flags: 1,
      });
      return;
    } catch {
      if (await sharing.isAvailableAsync()) {
        await sharing.shareAsync(attachment.uri, { mimeType: attachment.mimeType });
        return;
      }
      throw new Error('ATTACHMENT_OPEN_UNAVAILABLE');
    }
  }
  if (await opener.canOpenURL(attachment.uri)) {
    await opener.openURL(attachment.uri);
    return;
  }
  if (await sharing.isAvailableAsync()) {
    await sharing.shareAsync(attachment.uri, { mimeType: attachment.mimeType });
    return;
  }
  throw new Error('ATTACHMENT_OPEN_UNAVAILABLE');
}

export interface LinkOpener {
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
}

export interface AttachmentOpenFileSystem {
  fileExists(uri: string): boolean | Promise<boolean>;
  getContentUriAsync(uri: string): Promise<string>;
}

export interface AndroidIntentLauncher {
  startActivityAsync(
    action: string,
    params: { data: string; type: string; flags: number },
  ): Promise<unknown>;
}