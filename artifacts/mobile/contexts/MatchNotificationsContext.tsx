import { useAppMotion } from '@/hooks/useAppMotion';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import type { Person } from '@/services/people';
import { store } from '@/services/persistence';
import { BrokerInitiatedMatching } from '@/services/brokerInitiatedMatching';
import { MyPropertiesMatchingSource } from '@/services/myPropertiesMatchingSource';
import { validMatchingRequirements } from '@/services/matchingUi';
import { selectHomeMatches, type HomeMatch } from '@/services/assistantHome';
import { matchNoticeRepository, playMatchCue, stopMatchCue } from '@/services/matchNoticeDevice';
import { claimDueMatchNotices, currentNoticeMatch, initialMatchNotices, isQuietTime, noticeIsDue, reconcileMatchNotices, updateNotice, type MatchNotice, type MatchNoticeSettings, type MatchNoticeState } from '@/services/matchNotifications';
import { useAccountFoundation } from './AccountFoundationContext';
import { MatchNoticeToast } from '@/components/notifications/MatchNoticeToast';
export interface MatchCatalog { properties: Property[]; people: Person[]; requirements: SeekerRequirement[] }
async function readMatchCatalog(): Promise<MatchCatalog> {
  const [properties, people, requirements] = await Promise.all([store.getProperties(), store.getPeople(), store.getRequirements()]);
  return { properties, people, requirements };
}
export function matchingCatalogKey(catalog: MatchCatalog): string { return JSON.stringify([catalog.properties, catalog.people, catalog.requirements]); }
interface Value {
  state: MatchNoticeState; catalog: MatchCatalog; matches: HomeMatch[]; sourceKey: string;
  status: 'loading' | 'ready' | 'error'; error: boolean; historyReady: boolean; unread: number;
  refresh(): Promise<void>; mark(id: string, action: 'read' | 'later' | 'snooze'): Promise<void>;
  settings(change: Partial<MatchNoticeSettings>): Promise<void>;
  resolve(id: string): Promise<{ notice: MatchNotice; match: HomeMatch }>;
}
const Context = createContext<Value | null>(null);
export function useMatchNotifications(): Value { const value = useContext(Context); if (!value) throw new Error('MatchNotificationsProvider missing'); return value; }
export function MatchNotificationsProvider({ children }: { children: React.ReactNode }) {
  const account = useAccountFoundation(), router = useRouter(), pathname = usePathname();
  const allowMotion = useAppMotion();
  const preferences = useRef(account); preferences.current = account;
  const [state, setState] = useState(initialMatchNotices), [catalog, setCatalog] = useState<MatchCatalog>({ properties: [], people: [], requirements: [] });
  const [matches, setMatches] = useState<HomeMatch[]>([]), [sourceKey, setSourceKey] = useState('');
  const [status, setStatus] = useState<Value['status']>('loading'), [error, setError] = useState(false), [historyReady, setHistoryReady] = useState(false);
  const [banner, setBanner] = useState<{ notice: MatchNotice; match: HomeMatch; count: number } | null>(null);
  const mounted = useRef(true), savedKey = useRef(''), latestMatches = useRef<HomeMatch[]>([]);
  const jobs = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback((): Promise<void> => {
    const run = jobs.current.catch(() => undefined).then(async () => {
      if (!mounted.current || AppState.currentState && AppState.currentState !== 'active') return;
      try {
        const records = await readMatchCatalog(), { properties, people, requirements } = records, key = matchingCatalogKey(records);
        let items = latestMatches.current;
        if (key !== savedKey.current) {
          const eligible = validMatchingRequirements(requirements).filter(r => people.some(p => p.id === r.seekerId));
          const byId = new Map(eligible.map(r => [r.id, r]));
          const engine = new BrokerInitiatedMatching({ getRequirement: async id => byId.get(id) ?? null }, new MyPropertiesMatchingSource({ getProperties: async () => properties }));
          const runs = [];
          for (const requirement of eligible) {
            if (!mounted.current) return;
            runs.push(await engine.runForRequirement(requirement.id));
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          items = selectHomeMatches(eligible, people, runs, Number.MAX_SAFE_INTEGER);
          if (matchingCatalogKey(await readMatchCatalog()) !== key) throw new Error('MATCH_CATALOG_CHANGED');
        }
        if (!mounted.current) return;
        savedKey.current = key; latestMatches.current = items;
        setCatalog(records); setMatches(items); setSourceKey(key); setStatus('ready');
        if (!preferences.current.ready) return;
        try {
          const choices = preferences.current.state.notifications;
          const next = await matchNoticeRepository.update(s => reconcileMatchNotices(s, items, new Date().toISOString(), choices.enabled && choices.matches));
          if (mounted.current) { setState(next); setHistoryReady(true); setError(false); }
        } catch {
          // A notification-history failure must never disable the actual matching inventory.
          if (mounted.current) { setError(true); setHistoryReady(false); }
        }
      } catch { if (mounted.current) { setError(true); setStatus('error'); } throw new Error('MATCH_NOTICES_UNAVAILABLE'); }
    });
    jobs.current = run; return run;
  }, []);
  useEffect(() => {
    void matchNoticeRepository.load().catch(() => { if (mounted.current) { setError(true); setHistoryReady(false); } }).then(() => refresh()).catch(() => { if (mounted.current) { setError(true); setStatus('error'); } });
  }, [account.ready, pathname, refresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh().catch(() => undefined); }, 30000);
    const sub = AppState.addEventListener('change', next => { if (next !== 'active') stopMatchCue(); if (next === 'active') void refresh().catch(() => undefined); });
    return () => { clearInterval(timer); sub.remove(); stopMatchCue(); };
  }, [refresh]);
  useEffect(() => {
    if (!account.state.notifications.enabled || !account.state.notifications.matches || !state.settings.sound || isQuietTime(state.settings, new Date())) stopMatchCue();
  }, [account.state.notifications.enabled, account.state.notifications.matches, state.settings]);
  const mutate = async (fn: (s: MatchNoticeState) => MatchNoticeState) => {
    try { const next = await matchNoticeRepository.update(fn); if (mounted.current) { setState(next); setError(false); } }
    catch (cause) { setError(true); setHistoryReady(false); throw cause; }
  };
  const mark: Value['mark'] = async (id, action) => { await mutate(s => updateNotice(s, id, action, new Date())); setBanner(b => b?.notice.id === id ? null : b); };
  const resolve: Value['resolve'] = async id => {
    if (AppState.currentState && AppState.currentState !== 'active') throw new Error('MATCH_NOT_FOREGROUND');
    await refresh();
    const saved = await matchNoticeRepository.load(), notice = saved.entries.find(n => n.id === id);
    const match = notice && currentNoticeMatch(notice, latestMatches.current);
    if (!notice || !match) throw new Error('MATCH_NO_LONGER_CURRENT');
    return { notice, match };
  };
  const claiming = useRef(false);
  useEffect(() => {
    if (!account.ready || !account.state.notifications.enabled || !account.state.notifications.matches) { setBanner(null); return; }
    if (banner || claiming.current || error || !historyReady || status !== 'ready' || !state.entries.some(n => noticeIsDue(n, new Date().toISOString()) && currentNoticeMatch(n, latestMatches.current))) return;
    claiming.current = true;
    let claimed: MatchNotice[] = [];
    void matchNoticeRepository.update(s => {
      const batch = claimDueMatchNotices(s, latestMatches.current, new Date().toISOString());
      claimed = batch.notices; return batch.state;
    }).then(next => {
      if (!mounted.current) return;
      setState(next);
      const candidates = claimed.map(notice => ({ notice, match: currentNoticeMatch(notice, latestMatches.current)! })).filter(x => x.match).sort((a, b) => b.match.result.score - a.match.result.score);
      if (candidates.length && pathname !== '/notifications' && AppState.currentState === 'active' && preferences.current.state.notifications.enabled && preferences.current.state.notifications.matches) {
        setBanner({ ...candidates[0], count: candidates.length });
        if (!isQuietTime(next.settings, new Date()) && next.settings.sound) void playMatchCue(true).catch(() => undefined);
      }
    }).catch(() => { if (mounted.current) setError(true); }).finally(() => { claiming.current = false; });
  }, [state, banner, status, error, historyReady, pathname, account.ready, account.state.notifications.enabled, account.state.notifications.matches]);
  // Read marking is independent of share delivery; opening another app never proves a message was sent.
  const shareFlight = useRef(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const openShare = async () => {
    if (!banner || shareFlight.current) return;
    shareFlight.current = true; setBannerBusy(true);
    try { const current = await resolve(banner.notice.id); await mark(current.notice.id, 'read'); router.push({ pathname: '/property/[propertyCoreId]/share', params: { propertyCoreId: current.match.result.propertyId, matchNoticeId: current.notice.id } } as never); }
    catch { setError(true); setBanner(null); router.push('/notifications' as never); }
    finally { shareFlight.current = false; setBannerBusy(false); }
  };
  const now = new Date().toISOString();
  return <Context.Provider value={{ state, catalog, matches, sourceKey, status, error, historyReady, unread: state.entries.filter(n => !n.read && (!n.snoozedUntil || n.snoozedUntil <= now)).length,
    refresh, mark, settings: change => mutate(s => ({ ...s, settings: { ...s.settings, ...change } })), resolve }}>
    {children}
    {banner && <MatchNoticeToast notice={banner.notice} match={banner.match} property={catalog.properties.find(p => p.core.id === banner.match.result.propertyId)} count={banner.count}
      busy={bannerBusy} allowMotion={allowMotion} onShare={() => void openShare()} onLater={() => { setBanner(null); }} onOpen={() => { setBanner(null); router.push('/notifications' as never); }} />}
  </Context.Provider>;
}
