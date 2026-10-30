/** Device-local daily work log. Never infers a call outcome from opening a phone app. */
export const ASSISTANT_STORAGE_KEY = '@viewstate_daily_assistant_v1';
export const ASSISTANT_TIME_ZONE = 'Asia/Kuwait';
export type TaskKind = 'call' | 'viewing' | 'available' | 'note';
export type TaskStatus = 'pending' | 'done' | 'cancelled';
export type Outcome = 'contacted' | 'noAnswer' | 'viewed' | 'cancelled' | 'isAvailable' | 'notAvailable' | 'finished';
export type TaskFilter = 'all' | 'client' | 'viewing' | 'available' | 'done' | 'cancelled';
export interface FollowupHistory { at: string; outcome: Outcome; notes: string }
export interface Followup {
  id: string; revision: number; kind: TaskKind; title: string; date: string; time: string;
  duration: number; personId: string; personName: string; propertyId: string; notes: string;
  status: TaskStatus; createdAt: string; updatedAt: string; history: FollowupHistory[];
}
export type FollowupDraft = Pick<Followup, 'kind' | 'title' | 'date' | 'time' | 'duration' | 'personId' | 'personName' | 'propertyId' | 'notes'>;
export interface AvailabilityConfirmation { status: 'available' | 'unavailable'; at: string; taskId: string }
export interface AssistantState {
  schemaVersion: 1; revision: number; tasks: Followup[];
  availability: Record<string, AvailabilityConfirmation>;
  contacts: Record<string, { at: string; taskId: string }>;
  dismissed: string[];
  settings: { showSuggestions: boolean; showOverdue: boolean; checkAfterDays: number };
}
export interface AssistantInventory {
  people: readonly { id: string; name: string; client: boolean }[];
  properties: readonly { id: string; title: string; sourcePersonId?: string }[];
}
export class AssistantError extends Error {
  constructor(public code: 'damaged' | 'title' | 'date' | 'time' | 'duration' | 'property' | 'person' | 'conflict' | 'stale' | 'outcome' | 'duplicate' | 'unavailable') { super(code); }
}
const kinds: TaskKind[] = ['call', 'viewing', 'available', 'note'];
export const OUTCOMES: Record<TaskKind, readonly Outcome[]> = {
  call: ['contacted', 'noAnswer'], viewing: ['viewed', 'cancelled', 'noAnswer'],
  available: ['isAvailable', 'notAvailable', 'noAnswer'], note: ['finished'],
};
export function initialAssistant(): AssistantState {
  return { schemaVersion: 1, revision: 0, tasks: [], availability: {}, contacts: {}, dismissed: [],
    settings: { showSuggestions: true, showOverdue: true, checkAfterDays: 7 } };
}
export function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c <= '٩' ? 0x0660 : 0x06f0)));
}
export function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < '1900-01-01' || day > '9999-12-31') return false;
  const d = new Date(day + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}
export function validTime(time: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(time); }
export function kuwaitDay(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ASSISTANT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(k => p.find(x => x.type === k)!.value).join('-');
}
export function addDays(day: string, count: number): string {
  if (!validDay(day)) throw new AssistantError('date');
  const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + count);
  const next = d.toISOString().slice(0, 10); if (!validDay(next)) throw new AssistantError('date'); return next;
}
export function dayDistance(later: string, earlier: string): number {
  if (!validDay(later) || !validDay(earlier)) throw new AssistantError('date');
  return Math.round((Date.parse(later + 'T12:00:00Z') - Date.parse(earlier + 'T12:00:00Z')) / 86400000);
}
export function clockMinutes(time: string): number { return time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : 1440; }
export function monthGrid(month: string): string[] {
  if (!validDay(month)) throw new AssistantError('date');
  const first = month.slice(0, 7) + '-01';
  const start = addDays(first, -new Date(first + 'T12:00:00Z').getUTCDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function shiftMonth(month: string, direction: number): string {
  const d = new Date(month.slice(0, 7) + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + direction);
  const next = d.toISOString().slice(0, 10); if (!validDay(next)) throw new AssistantError('date'); return next;
}
function isObject(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function text(v: unknown, max: number): v is string { return typeof v === 'string' && v.length <= max; }
function iso(v: unknown): v is string { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)); }
/** Unknown future schemas and damaged data remain untouched and block writes. */
export function decodeAssistant(raw: string | null): AssistantState {
  if (raw === null) return initialAssistant();
  try {
    const s: unknown = JSON.parse(raw);
    if (!isObject(s) || s.schemaVersion !== 1 || !Number.isSafeInteger(s.revision) || (s.revision as number) < 0
      || !Array.isArray(s.tasks) || s.tasks.length > 10000 || !isObject(s.availability) || !isObject(s.contacts)
      || !Array.isArray(s.dismissed) || !s.dismissed.every(x => text(x, 1000)) || !isObject(s.settings)
      || typeof s.settings.showSuggestions !== 'boolean' || typeof s.settings.showOverdue !== 'boolean'
      || ![3, 7, 14].includes(s.settings.checkAfterDays as number)) throw new Error();
    const ids = new Set<string>();
    for (const t of s.tasks) {
      if (!isObject(t) || !text(t.id, 200) || !t.id || ids.has(t.id) || !Number.isSafeInteger(t.revision) || (t.revision as number) < 1
        || !kinds.includes(t.kind as TaskKind) || !text(t.title, 140) || !t.title.trim()
        || !text(t.date, 10) || !validDay(t.date) || !text(t.time, 5) || (t.time && !validTime(t.time))
        || !Number.isInteger(t.duration) || (t.duration as number) < 15 || (t.duration as number) > 480
        || !text(t.personId, 200) || !text(t.personName, 100) || (t.personId && t.personName)
        || !text(t.propertyId, 200) || (t.kind === 'available' && !t.propertyId)
        || (t.kind === 'viewing' && !t.time) || !text(t.notes, 2000)
        || !['pending', 'done', 'cancelled'].includes(t.status as string) || !iso(t.createdAt) || !iso(t.updatedAt)
        || !Array.isArray(t.history) || t.history.length > 1000
        || !t.history.every(h => isObject(h) && iso(h.at) && text(h.notes, 2000)
          && [...OUTCOMES[t.kind as TaskKind], 'cancelled'].includes(h.outcome as Outcome))) throw new Error();
      ids.add(t.id);
    }
    for (const a of Object.values(s.availability)) if (!isObject(a) || !['available', 'unavailable'].includes(a.status as string) || !iso(a.at) || !text(a.taskId, 200)) throw new Error();
    for (const c of Object.values(s.contacts)) if (!isObject(c) || !iso(c.at) || !text(c.taskId, 200)) throw new Error();
    return s as unknown as AssistantState;
  } catch { throw new AssistantError('damaged'); }
}
export function validateDraft(draft: FollowupDraft, state: AssistantState, inventory: AssistantInventory, editingId?: string): FollowupDraft {
  const d = { ...draft, title: draft.title.trim(), notes: draft.notes.trim(), personName: draft.personName.trim(),
    date: normalizeDigits(draft.date), time: normalizeDigits(draft.time.trim()) };
  if (!kinds.includes(d.kind)) throw new AssistantError('outcome');
  if (!d.title || d.title.length > 140 || d.notes.length > 2000 || d.personName.length > 100) throw new AssistantError('title');
  if (!validDay(d.date)) throw new AssistantError('date');
  if ((d.time && !validTime(d.time)) || (d.kind === 'viewing' && !d.time)) throw new AssistantError('time');
  if (!Number.isInteger(d.duration) || d.duration < 15 || d.duration > 480) throw new AssistantError('duration');
  if (d.personId && (!inventory.people.some(p => p.id === d.personId) || d.personName)) throw new AssistantError('person');
  if ((d.propertyId && !inventory.properties.some(p => p.id === d.propertyId)) || (d.kind === 'available' && !d.propertyId)) throw new AssistantError('property');
  if (d.kind === 'viewing' && state.tasks.some(t => t.id !== editingId && t.kind === 'viewing' && t.status === 'pending'
    && Date.parse(d.date + 'T' + d.time + ':00Z') < Date.parse(t.date + 'T' + t.time + ':00Z') + t.duration * 60000
    && Date.parse(d.date + 'T' + d.time + ':00Z') + d.duration * 60000 > Date.parse(t.date + 'T' + t.time + ':00Z'))) throw new AssistantError('conflict');
  return d;
}
export function createFollowup(state: AssistantState, draft: FollowupDraft, inventory: AssistantInventory, id: string, at: string): AssistantState {
  if (!id || state.tasks.some(t => t.id === id)) throw new AssistantError('duplicate');
  const d = validateDraft(draft, state, inventory);
  return { ...state, tasks: [...state.tasks, { ...d, id, revision: 1, status: 'pending', createdAt: at, updatedAt: at, history: [] }] };
}
function expectedTask(state: AssistantState, expected: Followup): Followup {
  const current = state.tasks.find(t => t.id === expected.id);
  if (!current || current.revision !== expected.revision) throw new AssistantError('stale');
  return current;
}
export function editFollowup(state: AssistantState, expected: Followup, draft: FollowupDraft, inventory: AssistantInventory, at: string): AssistantState {
  const current = expectedTask(state, expected);
  if (current.status !== 'pending') throw new AssistantError('stale');
  const d = validateDraft(draft, state, inventory, current.id);
  // Preserve history's original kind: a logged task cannot be recast as a different activity.
  if (current.history.length && current.kind !== d.kind) throw new AssistantError('outcome');
  return { ...state, tasks: state.tasks.map(t => t.id === current.id ? { ...t, ...d, revision: t.revision + 1, updatedAt: at } : t) };
}
export function logOutcome(state: AssistantState, expected: Followup, outcome: Outcome, notes: string, at: string,
  inventory: AssistantInventory, next?: { draft: FollowupDraft; id: string }): AssistantState {
  const t = expectedTask(state, expected);
  if (t.status !== 'pending' || !OUTCOMES[t.kind].includes(outcome) || notes.length > 2000) throw new AssistantError('outcome');
  let updated: AssistantState = { ...state, tasks: state.tasks.map(v => v.id === t.id ? { ...v, revision: v.revision + 1,
    updatedAt: at, status: outcome === 'cancelled' ? 'cancelled' : 'done', history: [...v.history, { at, outcome, notes: notes.trim() }] } : v) };
  if (t.personId && inventory.people.some(p => p.id === t.personId) && !['noAnswer', 'cancelled'].includes(outcome))
    updated = { ...updated, contacts: { ...updated.contacts, [t.personId]: { at, taskId: t.id } } };
  if (t.kind === 'available' && inventory.properties.some(p => p.id === t.propertyId) && ['isAvailable', 'notAvailable'].includes(outcome))
    updated = { ...updated, availability: { ...updated.availability,
      [t.propertyId]: { status: outcome === 'isAvailable' ? 'available' : 'unavailable', at, taskId: t.id } } };
  // One store write commits the outcome and next follow-up together, or neither.
  return next ? createFollowup(updated, next.draft, inventory, next.id, at) : updated;
}
export function changeTaskStatus(state: AssistantState, expected: Followup, status: 'pending' | 'cancelled', inventory: AssistantInventory, at: string): AssistantState {
  const t = expectedTask(state, expected);
  if (status === 'pending') validateDraft(t, state, inventory, t.id);
  return { ...state, tasks: state.tasks.map(v => v.id === t.id ? { ...v, status, revision: v.revision + 1, updatedAt: at,
    history: status === 'cancelled' ? [...v.history, { at, outcome: 'cancelled', notes: '' }] : v.history } : v) };
}
export function sortFollowups(tasks: readonly Followup[]): Followup[] {
  return [...tasks].sort((a, b) => a.date.localeCompare(b.date) || clockMinutes(a.time) - clockMinutes(b.time) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function taskPersonName(t: Followup, inventory: AssistantInventory): string {
  return t.personId ? inventory.people.find(p => p.id === t.personId)?.name ?? '' : t.personName;
}
export function selectFollowups(state: AssistantState, inventory: AssistantInventory, day: string, filter: TaskFilter = 'all', query = '', overdue = false, today = kuwaitDay()): Followup[] {
  const q = query.trim().toLocaleLowerCase();
  return sortFollowups(state.tasks.filter(t => {
    if (q ? ![t.title, t.notes, taskPersonName(t, inventory), inventory.properties.find(p => p.id === t.propertyId)?.title ?? ''].join(' ').toLocaleLowerCase().includes(q)
      : overdue ? !(t.date < today && t.status === 'pending') : t.date !== day) return false;
    if (filter === 'done' || filter === 'cancelled') return t.status === filter;
    if (t.status !== 'pending') return false;
    if (filter === 'client') return !!t.personName || !!inventory.people.find(p => p.id === t.personId)?.client;
    return filter === 'all' || filter === t.kind;
  }));
}
export function daySummary(state: AssistantState, inventory: AssistantInventory, day: string) {
  const tasks = state.tasks.filter(t => t.date === day), open = tasks.filter(t => t.status === 'pending');
  const clients = new Set(open.flatMap(t => t.personName ? ['name:' + t.personName.trim().toLocaleLowerCase()]
    : inventory.people.find(p => p.id === t.personId)?.client ? ['id:' + t.personId] : []));
  return { clients: clients.size, viewings: open.filter(t => t.kind === 'viewing').length,
    availability: new Set(open.filter(t => t.kind === 'available').map(t => t.propertyId)).size, done: tasks.filter(t => t.status === 'done').length,
    total: tasks.filter(t => t.status !== 'cancelled').length };
}
export interface AssistantSuggestion { key: string; kind: 'call' | 'available'; personId: string; propertyId: string; reason: 'unconfirmed' | 'staleAvailability' | 'staleContact'; days?: number }
export function suggestFollowups(state: AssistantState, inventory: AssistantInventory, today: string): AssistantSuggestion[] {
  if (!state.settings.showSuggestions) return [];
  const open = state.tasks.filter(t => t.status === 'pending'), suggestions: AssistantSuggestion[] = [];
  for (const p of inventory.properties) {
    const upcoming = open.some(t => t.kind === 'viewing' && t.propertyId === p.id && t.date >= today);
    const a = state.availability[p.id];
    if (!upcoming || a?.status === 'unavailable' || open.some(t => t.kind === 'available' && t.propertyId === p.id)) continue;
    const age = a ? dayDistance(today, kuwaitDay(new Date(a.at))) : undefined;
    if (age !== undefined && age < state.settings.checkAfterDays) continue;
    suggestions.push({ key: `available:${p.id}:${a?.at ?? 'unknown'}:${today}`, kind: 'available', propertyId: p.id,
      personId: inventory.people.some(x => x.id === p.sourcePersonId) ? p.sourcePersonId! : '',
      reason: a ? 'staleAvailability' : 'unconfirmed', days: age });
  }
  for (const p of inventory.people) {
    const c = state.contacts[p.id];
    // No invented last-contact dates, no implication that a client is waiting without a record.
    if (!p.client || !c || open.some(t => t.personId === p.id)) continue;
    const age = dayDistance(today, kuwaitDay(new Date(c.at)));
    if (age >= 4) suggestions.push({ key: `call:${p.id}:${c.at}:${today}`, kind: 'call', personId: p.id,
      propertyId: '', reason: 'staleContact', days: age });
  }
  return suggestions.filter(s => !state.dismissed.includes(s.key)).slice(0, 3);
}
export function acceptSuggestion(state: AssistantState, inventory: AssistantInventory, today: string, key: string, title: string, id: string, at: string): AssistantState {
  const s = suggestFollowups(state, inventory, today).find(v => v.key === key);
  if (!s) throw new AssistantError('stale');
  return createFollowup(state, { kind: s.kind, title, date: today, time: '', duration: 45,
    personId: s.personId, personName: '', propertyId: s.propertyId, notes: '' }, inventory, id, at);
}
