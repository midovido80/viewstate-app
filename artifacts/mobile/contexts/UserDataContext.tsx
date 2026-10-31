import React, { createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { store } from '@/services/persistence';
import * as draft from '@/services/draft';
import { assistantRepository } from '@/services/dailyAssistantDevice';
import { matchNoticeRepository } from '@/services/matchNoticeDevice';
import type { createAccountRepositoriesDevice } from '@/services/accountRepositoriesDevice';
import { createDraftRepository } from '@/services/draft';
import * as capture from '@/services/propertyCaptureSave';
import * as edit from '@/services/propertyUpdateRecovery';
import * as enrich from '@/services/propertyEnrichmentRecovery';
import * as studio from '@/services/studioSave';
import * as deletion from '@/services/propertyDeletion';
import * as media from '@/services/attachments';
import * as FileSystem from 'expo-file-system';
import { assertOwnedMediaUri } from '@/services/accountMedia';
import { Platform } from 'react-native';

export type UserResources = ReturnType<typeof createAccountRepositoriesDevice>;
const Context = createContext<ReturnType<typeof buildUserData> | null>(null);
const legacy = { store, storage: AsyncStorage, draft, assistantRepository, matchNoticeRepository,
  recovery: { ...capture, ...edit, ...enrich, ...studio, ...deletion }, media: { ...media, access: undefined as import("@/services/accountMedia").MediaAccess | undefined } };

export function buildUserData(resources: UserResources) {
  const { scope, storage } = resources;
  const at = <F extends (...args: any[]) => any>(fn: F, position: number): F => ((...args: any[]) => {
    scope.assertActive(); args[position] = storage; return fn(...args);
  }) as F;
  const options = <F extends (options: any) => any>(fn: F, field = 'storage'): F => ((value: any) => {
    scope.assertActive(); return fn({ ...value, [field]: storage });
  }) as F;
  const recovery = {
    ...capture, ...edit, ...enrich, ...studio, ...deletion,
    persistCapturedDetails: at(capture.persistCapturedDetails, 3),
    prepareCapturedDetails: at(capture.prepareCapturedDetails, 2),
    loadPreparedCapturedDetails: at(capture.loadPreparedCapturedDetails, 1),
    finalizeCapturedDetails: at(capture.finalizeCapturedDetails, 2),
    recoverPreparedCapturedDetails: at(capture.recoverPreparedCapturedDetails, 1),
    createEditDraft: at(edit.createEditDraft, 1),
    loadPropertyEditDraft: at(edit.loadPropertyEditDraft, 1),
    savePropertyEditDraft: at(edit.savePropertyEditDraft, 2),
    discardPropertyEditDraft: at(edit.discardPropertyEditDraft, 1),
    loadPropertyUpdateOperation: at(edit.loadPropertyUpdateOperation, 0),
    persistPropertyUpdateOperation: at(edit.persistPropertyUpdateOperation, 1),
    executePropertyUpdateRecovery: options(edit.executePropertyUpdateRecovery),
    loadPropertyEnrichmentDraft: at(enrich.loadPropertyEnrichmentDraft, 1),
    savePropertyEnrichmentDraft: at(enrich.savePropertyEnrichmentDraft, 2),
    clearConfirmedPropertyEnrichmentDraft: at(enrich.clearConfirmedPropertyEnrichmentDraft, 1),
    saveStudioPropertyFromPersonSource: options(studio.saveStudioPropertyFromPersonSource),
    saveStudioProperty: options(studio.saveStudioProperty),
    retryStudioPropertyRecovery: options(studio.retryStudioPropertyRecovery),
    deleteSavedProperty: options(deletion.deleteSavedProperty, 'evidenceStorage'),
    deleteSavedPropertySnapshot: options(deletion.deleteSavedPropertySnapshot, 'evidenceStorage'),
  };
  const access = {
    assertActive: scope.assertActive,
    assertUri: (uri: string) => {
      scope.assertActive();
      if (Platform.OS !== 'web') assertOwnedMediaUri(uri, new FileSystem.Directory(FileSystem.Paths.document, resources.mediaDirectory).uri);
    },
    cacheDirectory: resources.mediaDirectory,
  };
  const scopedMedia = {
    access,
    ...media,
    createIndexedDbWebAttachmentBlobStore: () => scope.guard(media.createIndexedDbWebAttachmentBlobStore(resources.mediaDatabaseName)),
    createExpoFileStore: (module: media.ExpoFileSystemModule) => scope.guard(media.createExpoFileStore(module, resources.mediaDirectory)),
    openAttachment: ((...args: Parameters<typeof media.openAttachment>) => {
      scope.assertActive();
      if (Platform.OS === 'web') args[6] = scope.guard(media.createIndexedDbWebAttachmentBlobStore(resources.mediaDatabaseName));
      args[7] = access;
      return media.openAttachment(...args);
    }) as typeof media.openAttachment,
  };
  return { store: resources.store, storage, draft: createDraftRepository(storage),
    assistantRepository: resources.assistant, matchNoticeRepository: resources.notices, recovery, media: scopedMedia };
}
export function UserDataProvider({ value, children }: { value: ReturnType<typeof buildUserData>; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Legacy mode exists only when real-account configuration is absent at the root. */
export function useUserData() { return useContext(Context) ?? legacy; }
