import { createContext, useContext, useState, ReactNode, useEffect, useMemo, useCallback } from 'react';
import { PropertyDraft, updatePropertyDraft, projectDraftToProperty, Property } from '@workspace/property-domain';
import { loadDraft, saveDraft, clearDraft, flushDraftWrites } from '@/services/draft';

interface CaptureContextValue {
  draft: PropertyDraft;
  updateDraft: (changes: Partial<PropertyDraft>) => void;
  isReady: boolean;
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
  const [draft, setDraft] = useState<PropertyDraft>(DEFAULT_DRAFT);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function init() {
      const saved = await loadDraft();
      if (saved) {
        setDraft(saved);
      } else {
        // Initialize with generated IDs
        const newDraft = {
          ...DEFAULT_DRAFT,
          propertyCoreId: generateId(),
          offerId: generateId(),
        };
        setDraft(newDraft);
        await saveDraft(newDraft);
      }
      setIsReady(true);
    }
    init();
  }, []);

  const updateDraft = useCallback((changes: Partial<PropertyDraft>) => {
    setDraft(prev => {
      const next = updatePropertyDraft(prev, changes);
      saveDraft(next).catch(console.error);
      return next;
    });
  }, []);

  const projectToProperty = useCallback(() => {
    const result = projectDraftToProperty(draft);
    if (result.ok) {
      return { ok: true as const, property: result.value };
    }
    return { ok: false as const, issues: result.issues };
  }, [draft]);

  const resetDraft = useCallback(async () => {
    await flushDraftWrites();
    await clearDraft();
    const newDraft = {
      ...DEFAULT_DRAFT,
      propertyCoreId: generateId(),
      offerId: generateId(),
    };
    setDraft(newDraft);
    await saveDraft(newDraft);
  }, []);

  const value = useMemo(() => ({
    draft,
    updateDraft,
    isReady,
    projectToProperty,
    resetDraft
  }), [draft, updateDraft, isReady, projectToProperty, resetDraft]);

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture() {
  const context = useContext(CaptureContext);
  if (!context) throw new Error('useCapture must be used within CaptureProvider');
  return context;
}
