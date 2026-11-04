import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useUserData } from '@/contexts/UserDataContext';
import { AccountScreen, Card, ErrorText, Note, Row, ToggleRow, useCanWrite, useL } from './ui';

/** Load only follow-up settings, not the Home matching/catalog pipeline. */
export function FollowupSettingsSection() {
  const { assistantRepository } = useUserData(), { L } = useL(), { canWrite, busy } = useCanWrite();
  const [showOverdue, setShowOverdue] = useState(true), [ready, setReady] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(false);
  const writing = useRef(false), mounted = useRef(false);
  const load = useCallback(async () => {
    setReady(false); setError(false);
    try { const value = await assistantRepository.load(); if (mounted.current) { setShowOverdue(value.settings.showOverdue); setReady(true); } }
    catch { if (mounted.current) setError(true); }
  }, [assistantRepository]);
  useFocusEffect(useCallback(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]));
  const change = async (value: boolean) => {
    if (!ready || !canWrite || writing.current) return;
    writing.current = true; setSaving(true); setError(false);
    try {
      const updated = await assistantRepository.update(current => ({ ...current, settings: { ...current.settings, showOverdue: value } }));
      if (mounted.current) setShowOverdue(updated.settings.showOverdue);
    } catch { if (mounted.current) setError(true); }
    finally { writing.current = false; if (mounted.current) setSaving(false); }
  };
  return <AccountScreen title={L('إعدادات المتابعة', 'Follow-up settings')}>
    <Card><ToggleRow first title={L('إظهار المتابعات المتأخرة', 'Show overdue follow-ups')} value={showOverdue} disabled={!ready || saving || !canWrite || busy} onChange={v => void change(v)} /></Card>
    {!ready && !error && <Note>{L('جارٍ تحميل الإعدادات…', 'Loading settings…')}</Note>}
    <ErrorText>{error ? L('تعذر تحميل أو حفظ الإعدادات. أعد المحاولة.', 'Could not load or save settings. Please retry.') : null}</ErrorText>
    {error && <Card><Row first icon="refresh-cw" title={L('إعادة المحاولة', 'Retry')} disabled={saving} onPress={() => void load()} /></Card>}
    <Note>{L('تُحفظ التغييرات تلقائيًا. لا يحذف إخفاء المتأخرات أي متابعة.', 'Changes save automatically. Hiding overdue follow-ups does not delete any task.')}</Note>
  </AccountScreen>;
}
