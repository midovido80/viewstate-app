import { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { Alert } from 'react-native';
import { PropertyDraft, updatePropertyDraft, projectDraftToProperty, Property } from '@workspace/property-domain';
import { loadDraft, saveDraft, flushDraftWrites } from '@/services/draft';
import { useI18n } from '@/contexts/I18nContext';

interface CaptureContextValue {
  draft: PropertyDraft;
  updateDraft: (changes: Partial<PropertyDraft>) => void;
  isReady: boolean;
  draftLoadFailed: boolean;
  projectToProperty: () => { ok: true; property: Property } | { ok: false; issues: readonly any[] };
  resetDraft: () => Promise<void>;
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

export function CaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<PropertyDraft>(DEFAULT_DRAFT);
  const [isReady, setIsReady] = useState(false);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const saved = await loadDraft();
        if (saved) {
          setDraft(saved);
        } else {
          const newDraft = {
            ...DEFAULT_DRAFT,
            propertyCoreId: generateId(),
            offerId: generateId(),
          };
          await saveDraft(newDraft);
          setDraft(newDraft);
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
    if (!isReady || draftLoadFailed) {
      Alert.alert(t('errors.draft_read_title'), t('errors.draft_read'));
      return;
    }

    setDraft(prev => {
      const next = updatePropertyDraft(prev, changes);
      saveDraft(next).catch(console.error);
      return next;
    });
  }, [draftLoadFailed, isReady, t]);

  const projectToProperty = useCallback(() => {
    const result = projectDraftToProperty(draft);
    if (result.ok) {
      return { ok: true as const, property: result.value };
    }
    return { ok: false as const, issues: result.issues };
  }, [draft]);

  const resetDraft = useCallback(async () => {
    await flushDraftWrites();
    const newDraft = {
      ...DEFAULT_DRAFT,
      propertyCoreId: generateId(),
      offerId: generateId(),
    };
    await saveDraft(newDraft);
    setDraft(newDraft);
    setDraftLoadFailed(false);
  }, []);

  const value = useMemo(() => ({
    draft,
    updateDraft,
    isReady,
    draftLoadFailed,
    projectToProperty,
    resetDraft
  }), [draft, updateDraft, isReady, draftLoadFailed, projectToProperty, resetDraft]);

  if (!isReady) return null;

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture() {
  const context = useContext(CaptureContext);
  if (!context) throw new Error('useCapture must be used within CaptureProvider');
  return context;
}
