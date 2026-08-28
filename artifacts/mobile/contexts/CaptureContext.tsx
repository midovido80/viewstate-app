import { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PropertyDraft, updatePropertyDraft, projectDraftToProperty, Property } from '@workspace/property-domain';
import {
  loadDraft,
  saveDraft,
  flushDraftWrites,
  replaceDraft,
  replaceDraftIfUnchanged,
} from '@/services/draft';
import { useI18n } from '@/contexts/I18nContext';
import { store } from '@/services/persistence';
import {
  clearPropertySaveOperation,
  createPropertySaveOperation,
  executePropertySaveRecovery,
  loadPropertySaveOperation,
  persistPropertySaveOperation,
  PropertySaveOperationV1,
  SaveRecoveryResult,
  serializeRecoveryValue,
} from '@/services/propertySaveRecovery';

type SaveRecoveryStatus =
  | 'none'
  | 'retry_required'
  | 'cleanup_pending'
  | 'conflict'
  | 'unreadable';

interface CaptureContextValue {
  draft: PropertyDraft;
  updateDraft: (changes: Partial<PropertyDraft>) => void;
  isReady: boolean;
  draftLoadFailed: boolean;
  saveRecoveryStatus: SaveRecoveryStatus;
  projectToProperty: () => { ok: true; property: Property } | { ok: false; issues: readonly any[] };
  savePropertyWithRecovery: (property?: Property) => Promise<SaveRecoveryResult>;
  resetDraft: (expectedSnapshot?: string) => Promise<boolean>;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

const DEFAULT_DRAFT: PropertyDraft = {
  propertyCoreId: undefined,
  offerId: undefined,
  propertyType: undefined,
  locationAreaId: undefined,
  transaction: undefined,
};

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function createFreshDraft(): PropertyDraft {
  return {
    ...DEFAULT_DRAFT,
    propertyCoreId: generateId(),
    offerId: generateId(),
  };
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<PropertyDraft>(DEFAULT_DRAFT);
  const [isReady, setIsReady] = useState(false);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);
  const [saveRecoveryStatus, setSaveRecoveryStatus] = useState<SaveRecoveryStatus>('none');
  const [pendingOperation, setPendingOperation] = useState<PropertySaveOperationV1 | null>(null);
  const draftRef = useRef(draft);
  const mutationsBlocked = useRef(false);

  const setCurrentDraft = useCallback((next: PropertyDraft) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const cleanupRecoveredDraft = useCallback(async (expectedSnapshot: string) => {
    const wasBlocked = mutationsBlocked.current;
    mutationsBlocked.current = true;
    try {
      await flushDraftWrites();
      if (serializeRecoveryValue(draftRef.current) !== expectedSnapshot) {
        return 'newer' as const;
      }
      const newDraft = createFreshDraft();
      const replaced = await replaceDraftIfUnchanged(expectedSnapshot, newDraft);
      if (!replaced) {
        const latest = await loadDraft();
        if (latest) setCurrentDraft(latest);
        return 'newer' as const;
      }
      setCurrentDraft(newDraft);
      setDraftLoadFailed(false);
      return 'replaced' as const;
    } finally {
      mutationsBlocked.current = wasBlocked;
    }
  }, [setCurrentDraft]);

  const runRecovery = useCallback(async (
    operation: PropertySaveOperationV1,
    allowSave: boolean,
  ) => {
    const result = await executePropertySaveRecovery({
      operation,
      allowSave,
      getProperties: () => store.getProperties(),
      saveProperty: property => store.saveProperty(property),
      getDraft: () => draftRef.current,
      cleanupDraft: cleanupRecoveredDraft,
      clearOperation: candidate => clearPropertySaveOperation(AsyncStorage, candidate),
    });

    if (result.status === 'complete') {
      setPendingOperation(null);
      setSaveRecoveryStatus('none');
      mutationsBlocked.current = false;
    } else if (result.status === 'retry_required' || result.status === 'save_failed') {
      setPendingOperation(operation);
      setSaveRecoveryStatus('retry_required');
      mutationsBlocked.current = true;
    } else if (result.status === 'cleanup_failed') {
      setPendingOperation(operation);
      setSaveRecoveryStatus('cleanup_pending');
      mutationsBlocked.current = true;
    } else {
      setPendingOperation(operation);
      setSaveRecoveryStatus('conflict');
      mutationsBlocked.current = true;
    }
    return result;
  }, [cleanupRecoveredDraft]);

  useEffect(() => {
    async function init() {
      try {
        const saved = await loadDraft();
        if (saved) {
          setCurrentDraft(saved);
        } else {
          const newDraft = createFreshDraft();
          await saveDraft(newDraft);
          setCurrentDraft(newDraft);
        }

        try {
          const operation = await loadPropertySaveOperation(AsyncStorage);
          if (operation) {
            setPendingOperation(operation);
            const result = await runRecovery(operation, false);
            if (result.status === 'retry_required') {
              Alert.alert(t('errors.recovery_retry_title'), t('errors.recovery_retry'));
            } else if (result.status === 'cleanup_failed') {
              Alert.alert(t('errors.cleanup_title'), t('errors.cleanup_after_save'));
            } else if (result.status === 'conflict' || result.status === 'unresolved_draft') {
              Alert.alert(t('errors.recovery_conflict_title'), t('errors.recovery_conflict'));
            }
          }
        } catch (error) {
          console.error('Property save recovery failed:', error);
          setSaveRecoveryStatus('unreadable');
          mutationsBlocked.current = true;
          Alert.alert(t('errors.recovery_unreadable_title'), t('errors.recovery_unreadable'));
        }
      } catch (error) {
        console.error('Draft recovery failed:', error);
        setDraftLoadFailed(true);
        Alert.alert(t('errors.draft_read_title'), t('errors.draft_read'));
      } finally {
        setIsReady(true);
      }
    }
    init();
  }, []);

  const updateDraft = useCallback((changes: Partial<PropertyDraft>) => {
    if (!isReady || draftLoadFailed || saveRecoveryStatus !== 'none' || mutationsBlocked.current) {
      const recoveryBlocked = saveRecoveryStatus !== 'none';
      Alert.alert(
        t(recoveryBlocked ? 'errors.recovery_conflict_title' : 'errors.draft_read_title'),
        t(recoveryBlocked ? 'errors.recovery_pending' : 'errors.draft_read'),
      );
      return;
    }

    setDraft(prev => {
      const next = updatePropertyDraft(prev, changes);
      draftRef.current = next;
      saveDraft(next).catch(console.error);
      return next;
    });
  }, [draftLoadFailed, isReady, saveRecoveryStatus, t]);

  const projectToProperty = useCallback(() => {
    const result = projectDraftToProperty(draft);
    if (result.ok) {
      return { ok: true as const, property: result.value };
    }
    return { ok: false as const, issues: result.issues };
  }, [draft]);

  const resetDraft = useCallback(async (expectedSnapshot?: string) => {
    if (
      expectedSnapshot === undefined
      && (pendingOperation !== null || saveRecoveryStatus !== 'none' || mutationsBlocked.current)
    ) {
      throw new Error('The draft cannot be discarded while save recovery is unresolved.');
    }
    const wasBlocked = mutationsBlocked.current;
    mutationsBlocked.current = true;
    try {
      await flushDraftWrites();
      if (
        expectedSnapshot !== undefined
        && serializeRecoveryValue(draftRef.current) !== expectedSnapshot
      ) {
        return false;
      }
      const newDraft = createFreshDraft();
      if (expectedSnapshot === undefined) {
        await replaceDraft(newDraft);
      } else if (!await replaceDraftIfUnchanged(expectedSnapshot, newDraft)) {
        return false;
      }
      setCurrentDraft(newDraft);
      setDraftLoadFailed(false);
      return true;
    } finally {
      mutationsBlocked.current = wasBlocked;
    }
  }, [pendingOperation, saveRecoveryStatus, setCurrentDraft]);

  const savePropertyWithRecovery = useCallback(async (property?: Property) => {
    if (saveRecoveryStatus === 'unreadable' || saveRecoveryStatus === 'conflict') {
      return { status: 'conflict' } as const;
    }

    mutationsBlocked.current = true;
    let operation = pendingOperation;
    try {
      if (!operation) {
        if (!property) {
          const result = {
            status: 'save_failed',
            error: new Error('A validated property is required for a new save operation.'),
          } as const;
          mutationsBlocked.current = false;
          return result;
        }
        await flushDraftWrites();
        const snapshot = draftRef.current;
        operation = createPropertySaveOperation({
          operationId: `${snapshot.propertyCoreId}:${snapshot.offerId}:${Date.now()}`,
          draft: snapshot,
          targetProperty: property,
          preparedAt: new Date().toISOString(),
        });
        try {
          await persistPropertySaveOperation(AsyncStorage, operation);
        } catch (error) {
          setSaveRecoveryStatus('conflict');
          return { status: 'cleanup_failed', error } as const;
        }
        setPendingOperation(operation);
      } else if (property && (
        serializeRecoveryValue(operation.targetProperty) !== serializeRecoveryValue(property)
      )) {
        setSaveRecoveryStatus('conflict');
        return { status: 'unresolved_draft' } as const;
      }

      return await runRecovery(operation, true);
    } finally {
      if (!operation) mutationsBlocked.current = false;
    }
  }, [pendingOperation, runRecovery, saveRecoveryStatus]);

  const value = useMemo(() => ({
    draft,
    updateDraft,
    isReady,
    draftLoadFailed,
    saveRecoveryStatus,
    projectToProperty,
    savePropertyWithRecovery,
    resetDraft
  }), [
    draft,
    updateDraft,
    isReady,
    draftLoadFailed,
    saveRecoveryStatus,
    projectToProperty,
    savePropertyWithRecovery,
    resetDraft,
  ]);

  if (!isReady) return null;

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture() {
  const context = useContext(CaptureContext);
  if (!context) throw new Error('useCapture must be used within CaptureProvider');
  return context;
}
