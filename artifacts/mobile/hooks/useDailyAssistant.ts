import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import { store } from '@/services/persistence';
import type { Person } from '@/services/people';
import { useI18n } from '@/contexts/I18nContext';
import { getPropertyCardSummary } from '@/services/cardSummaryPresentation';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { assistantRepository } from '@/services/dailyAssistantDevice';
import { AssistantError, initialAssistant, kuwaitDay, type AssistantInventory, type AssistantState } from '@/services/dailyAssistant';
import { ASSISTANT_COPY, type AssistantCopyKey } from '@/services/dailyAssistantCopy';
interface Catalog { properties: Property[]; people: Person[]; requirements: SeekerRequirement[] }
async function readCatalog(): Promise<Catalog> {
  const [properties, people, requirements] = await Promise.all([store.getProperties(), store.getPeople(), store.getRequirements()]);
  return { properties, people, requirements };
}
export function useDailyAssistant() {
  const { language, t } = useI18n();
  const copy = useCallback((key: AssistantCopyKey) => ASSISTANT_COPY[language][key] as string, [language]);
  const [state, setState] = useState<AssistantState>(initialAssistant);
  const [catalog, setCatalog] = useState<Catalog>({ people: [], properties: [], requirements: [] });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [notice, setNotice] = useState(''), [canUndo, setCanUndo] = useState(false);
  const [now, setNow] = useState(() => new Date()), [selectedDay, setSelectedDay] = useState(() => kuwaitDay());
  const mounted = useRef(true), running = useRef(false), generation = useRef(0), lastDay = useRef(kuwaitDay());
  const buildInventory = useCallback((value: Catalog): AssistantInventory => {
    const seekers = new Set(value.requirements.map(r => r.seekerId).filter(Boolean));
    return {
      people: value.people.map(p => ({ id: p.id, name: p.name, client: p.classifications.includes('seeker') || seekers.has(p.id) })),
      properties: value.properties.map(p => {
        const summary = getPropertyCardSummary(p, { language, translate: t,
          formatPrice: (amount, currency) => formatPrice(amount, currency, language),
          formatRentalPrice: (amount, currency, period) => formatRentalPrice(amount, currency, period, language, t) });
        return { id: p.core.id, title: [summary.subtypeLabel || summary.typeLabel, summary.areaLabel].filter(Boolean).join(' · ') };
      }),
    };
  }, [language, t]);
  const inventory = useMemo(() => buildInventory(catalog), [buildInventory, catalog]);
  const explain = useCallback((cause: unknown): string => {
    const code = cause instanceof AssistantError ? cause.code : 'storage';
    const keys: Record<string, AssistantCopyKey> = { title: 'required', date: 'invalidDate', time: 'viewingRequiresTime', duration: 'durationError',
      property: 'missingProperty', person: 'missingPerson', conflict: 'conflict', stale: 'stale', damaged: 'damaged',
      unavailable: 'unavailable', outcome: 'outcomeError', duplicate: 'duplicate', storage: 'saveError' };
    return copy(keys[code] ?? 'saveError');
  }, [copy]);
  const reload = useCallback(async () => {
    if (running.current) return;
    const token = ++generation.current; setReady(false); setError('');
    try {
      const [saved, records] = await Promise.all([assistantRepository.load(), readCatalog()]);
      if (mounted.current && token === generation.current) { setState(saved); setCatalog(records); setReady(true); setCanUndo(false); }
    } catch (cause) {
      if (mounted.current && token === generation.current) { setError(cause instanceof AssistantError ? explain(cause) : copy('loadError')); setCanUndo(false); }
    }
  }, [copy, explain]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  useEffect(() => {
    const tick = () => {
      const clock = new Date(), day = kuwaitDay(clock);
      if (day !== lastDay.current) { const old = lastDay.current; setSelectedDay(d => d === old ? day : d); lastDay.current = day; }
      setNow(clock);
    };
    const interval = setInterval(tick, 30000);
    const sub = AppState.addEventListener('change', status => { if (status === 'active') tick(); });
    return () => { clearInterval(interval); sub.remove(); };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);
  const mutate = useCallback(async (change: (current: AssistantState, targets: AssistantInventory) => AssistantState,
    message: string, sourcePropertyId?: string): Promise<boolean> => {
    if (running.current || !ready) return false;
    running.current = true; setBusy(true); setError('');
    try {
      const records = await readCatalog();
      const targets = buildInventory(records);
      if (sourcePropertyId) {
        const source = await store.getPropertySource(sourcePropertyId);
        const p = targets.properties.find(p => p.id === sourcePropertyId);
        if (p && source) p.sourcePersonId = source.personId;
      }
      const next = await assistantRepository.update(current => change(current, targets));
      if (mounted.current) { setState(next); setCatalog(records); setNotice(message); setCanUndo(assistantRepository.canUndo()); }
      return true;
    } catch (cause) {
      if (mounted.current) {
        setError(explain(cause));
        // Validation/stale errors leave the form editable; uncertain storage writes require read-back via reload.
        if (!(cause instanceof AssistantError) || ['damaged', 'unavailable'].includes(cause.code)) setReady(false);
      }
      return false;
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }, [ready, buildInventory, explain]);
  const undo = useCallback(async () => {
    if (running.current || !ready) return;
    running.current = true; setBusy(true);
    try { const value = await assistantRepository.undo(); if (mounted.current) { setState(value); setCanUndo(false); setNotice(copy('undone')); setError(''); } }
    catch (cause) { if (mounted.current) { setError(explain(cause)); setCanUndo(false); } }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }, [ready, copy, explain]);
  return { state, catalog, inventory, ready, busy, error, notice, canUndo, now, selectedDay, setSelectedDay, copy, explain, reload, mutate, undo,
    notify: setNotice, clearError: () => setError('') };
}
