import { MATCH_ENGINE_VERSION } from '@workspace/property-domain';
import type { HomeMatch } from './assistantHome';
export const MATCH_NOTIFICATIONS_KEY = '@viewstate_match_notifications_v1';
export interface MatchNotice {
  id: string; pair: string; fingerprint: string; personId: string; propertyId: string; requirementId: string;
  createdAt: string; read: boolean; prompted: boolean; snoozedUntil?: string;
}
export interface MatchNoticeSettings { sound: boolean; quiet: boolean; quietStart: string; quietEnd: string }
export interface MatchNoticeState {
  version: 1; revision: number; engine: string; initialized: boolean;
  seen: Record<string, string>; entries: MatchNotice[]; settings: MatchNoticeSettings;
}
export function initialMatchNotices(): MatchNoticeState {
  return { version: 1, revision: 0, engine: MATCH_ENGINE_VERSION, initialized: false, seen: {}, entries: [], settings: { sound: true, quiet: false, quietStart: '22:00', quietEnd: '08:00' } };
}
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export function decodeMatchNotices(raw: string | null): MatchNoticeState {
  if (raw === null) return initialMatchNotices();
  const s: unknown = JSON.parse(raw);
  if (!isObject(s) || s.version !== 1 || !Number.isSafeInteger(s.revision) || Number(s.revision) < 0 || typeof s.engine !== 'string' || typeof s.initialized !== 'boolean' || !isObject(s.seen) || Object.values(s.seen).some(v => typeof v !== 'string') || !Array.isArray(s.entries) || !isObject(s.settings)) throw new Error('NOTICE_DATA_UNREADABLE');
  const options = s.settings;
  if (typeof options.sound !== 'boolean' || typeof options.quiet !== 'boolean' || !validTime(options.quietStart) || !validTime(options.quietEnd)) throw new Error('NOTICE_DATA_UNREADABLE');
  const ids = new Set<string>();
  for (const n of s.entries) {
    if (!isObject(n) || ['id', 'pair', 'fingerprint', 'personId', 'propertyId', 'requirementId', 'createdAt'].some(k => typeof n[k] !== 'string' || !n[k]) || typeof n.read !== 'boolean' || typeof n.prompted !== 'boolean' || !Number.isFinite(Date.parse(String(n.createdAt))) || n.snoozedUntil !== undefined && (typeof n.snoozedUntil !== 'string' || !Number.isFinite(Date.parse(n.snoozedUntil))) || ids.has(String(n.id)) || n.pair !== JSON.stringify([n.personId, n.propertyId])) throw new Error('NOTICE_DATA_UNREADABLE');
    ids.add(String(n.id));
  }
  return s as unknown as MatchNoticeState;
}
export function matchPair(match: HomeMatch): string { return JSON.stringify([match.person.id, match.result.propertyId]); }
/** Fingerprints describe compared facts, never notes, names, timestamps or regenerated IDs. */
export function matchFingerprint(match: HomeMatch): string {
  return JSON.stringify([match.result.engineVersion, match.result.priceAmount, match.result.category,
    match.result.explanations.map(x => [x.criterion, x.expected, x.actual, x.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}
export function reconcileMatchNotices(state: MatchNoticeState, matches: readonly HomeMatch[], now: string, alerts: boolean): MatchNoticeState {
  const seen = { ...state.seen }, entries = [...state.entries];
  const baseline = !state.initialized || state.engine !== MATCH_ENGINE_VERSION;
  let index = 0;
  for (const match of matches) {
    if (match.result.engineVersion !== MATCH_ENGINE_VERSION || !match.result.qualifies || !match.result.eligible) continue;
    const pair = matchPair(match), fingerprint = matchFingerprint(match);
    if (!baseline && seen[pair] !== fingerprint) entries.unshift({ id: `match-${state.revision + 1}-${index++}`, pair, fingerprint, personId: match.person.id, requirementId: match.requirement.id, propertyId: match.result.propertyId, createdAt: now, read: false, prompted: !alerts });
    seen[pair] = fingerprint;
  }
  let retainedRead = 0;
  const retained = entries.filter(n => !n.read || retainedRead++ < 200);
  return { ...state, initialized: true, engine: MATCH_ENGINE_VERSION, seen, entries: retained };
}
export function currentNoticeMatch(notice: MatchNotice, matches: readonly HomeMatch[]): HomeMatch | undefined {
  return matches.find(m => matchPair(m) === notice.pair && matchFingerprint(m) === notice.fingerprint);
}
export function noticeIsDue(n: MatchNotice, now: string): boolean { return !n.read && !n.prompted && (!n.snoozedUntil || n.snoozedUntil <= now); }
export function claimDueMatchNotices(state: MatchNoticeState, matches: readonly HomeMatch[], now: string): { state: MatchNoticeState; notices: MatchNotice[] } {
  const notices = state.entries.filter(n => noticeIsDue(n, now) && currentNoticeMatch(n, matches));
  const ids = new Set(notices.map(n => n.id));
  return { notices, state: { ...state, entries: state.entries.map(n => ids.has(n.id) ? { ...n, prompted: true } : n) } };
}
export function isQuietTime(settings: MatchNoticeSettings, now: Date): boolean {
  if (!settings.quiet) return false;
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return settings.quietStart === settings.quietEnd || (settings.quietStart < settings.quietEnd ? time >= settings.quietStart && time < settings.quietEnd : time >= settings.quietStart || time < settings.quietEnd);
}
export function updateNotice(state: MatchNoticeState, id: string, change: 'read' | 'later' | 'snooze', now: Date): MatchNoticeState {
  return { ...state, entries: state.entries.map(n => n.id !== id ? n : change === 'read' ? { ...n, read: true, prompted: true } : change === 'snooze' ? { ...n, read: false, prompted: false, snoozedUntil: new Date(now.getTime() + 60 * 60 * 1000).toISOString() } : { ...n, prompted: true }) };
}
export interface NoticeStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export type NoticeExclusive = <T>(run: () => Promise<T>) => Promise<T>;
const queues = new WeakMap<NoticeStorage, Promise<unknown>>();
/** Reload under the shared lock, serialize, and verify read-back before any alert is shown. */
export function createMatchNoticeRepository(storage: NoticeStorage, exclusive: NoticeExclusive = run => run()) {
  let uncertain = false;
  return {
    load: async (): Promise<MatchNoticeState> => {
      const run = (queues.get(storage) ?? Promise.resolve()).catch(() => undefined).then(() => exclusive(async () => {
        const state = decodeMatchNotices(await storage.getItem(MATCH_NOTIFICATIONS_KEY)); uncertain = false; return state;
      }));
      queues.set(storage, run); return run;
    },
    update: async (change: (s: MatchNoticeState) => MatchNoticeState): Promise<MatchNoticeState> => {
      const next = (queues.get(storage) ?? Promise.resolve()).catch(() => undefined).then(() => exclusive(async () => {
        if (uncertain) throw new Error('NOTICE_RELOAD_REQUIRED');
        const oldRaw = await storage.getItem(MATCH_NOTIFICATIONS_KEY), current = decodeMatchNotices(oldRaw);
        const changed = change(current);
        if (JSON.stringify(changed) === JSON.stringify(current)) return current;
        const result = { ...changed, revision: current.revision + 1 };
        const raw = JSON.stringify(result); decodeMatchNotices(raw);
        if (await storage.getItem(MATCH_NOTIFICATIONS_KEY) !== oldRaw) throw new Error('NOTICE_WRITE_CONFLICT');
        try { await storage.setItem(MATCH_NOTIFICATIONS_KEY, raw); if (await storage.getItem(MATCH_NOTIFICATIONS_KEY) !== raw) throw new Error('NOTICE_READBACK_FAILED'); }
        catch (error) { uncertain = true; throw error; }
        return result;
      }));
      queues.set(storage, next); return next;
    },
  };
}
