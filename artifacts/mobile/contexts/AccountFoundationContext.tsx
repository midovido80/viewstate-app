import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAccountRepository, initialAccountFoundation, appendFeedback, validateLocalProfile,
  type AccountFoundation, type AccountLanguage, type LocalProfile, type ShareChoices, type NotificationChoices,
} from '@/services/accountFoundation';
import { useI18n } from '@/contexts/I18nContext';

interface AccountContext {
  state: AccountFoundation;
  ready: boolean;
  busy: boolean;
  error: string | null;
  reload(): Promise<void>;
  saveProfile(profile: LocalProfile): Promise<void>;
  setSharing(key: keyof ShareChoices, value: boolean): Promise<void>;
  setNotification(key: keyof NotificationChoices, value: boolean): Promise<void>;
  setReducedMotion(value: boolean): Promise<void>;
  setAppLanguage(value: AccountLanguage): Promise<void>;
  saveFeedback(subject: string, message: string): Promise<void>;
  removeFeedback(id: string): Promise<void>;
  clearLocalSettings(): Promise<void>;
}
const Context = createContext<AccountContext | null>(null);
export function AccountFoundationProvider({ children }: { children: React.ReactNode }) {
  const repository = useRef(createAccountRepository(AsyncStorage)).current;
  const { setLanguage } = useI18n();
  const [state, setState] = useState(initialAccountFoundation);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setReady(false);
    try {
      const saved = await repository.load();
      setState(saved);
      if (saved.language) setLanguage(saved.language);
      setError(null); setReady(true);
    }
    catch { setError('load'); }
  }, [repository, setLanguage]);
  useEffect(() => { void reload(); }, [reload]);
  const update = async (change: (value: AccountFoundation) => AccountFoundation) => {
    setBusy(true);
    try { setState(await repository.update(change)); setError(null); }
    catch (cause) { setError('save'); throw cause; }
    finally { setBusy(false); }
  };
  return <Context.Provider value={{
    state, ready, busy, error, reload,
    saveProfile: async profile => { const value = validateLocalProfile(profile); await update(s => ({ ...s, profile: value })); },
    setSharing: (key, value) => update(s => ({ ...s, sharing: { ...s.sharing, [key]: value } })),
    setNotification: (key, value) => update(s => ({ ...s, notifications: { ...s.notifications, [key]: value } })),
    setReducedMotion: value => update(s => ({ ...s, reducedMotion: value })),
    setAppLanguage: async value => { await update(s => ({ ...s, language: value })); setLanguage(value); },
    saveFeedback: (subject, message) => update(s => appendFeedback(s, subject, message,
      `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, new Date().toISOString())),
    removeFeedback: id => update(s => ({ ...s, feedback: s.feedback.filter(d => d.id !== id) })),
    clearLocalSettings: () => update(s => ({ ...initialAccountFoundation(), language: s.language })),
  }}>{children}</Context.Provider>;
}
export function useAccountFoundation() {
  const context = useContext(Context);
  if (!context) throw new Error('AccountFoundationProvider missing');
  return context;
}
