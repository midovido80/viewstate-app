import type { AccountStorage } from './accountScope';
import { assertAccountId } from './accountScope';
import { GUEST_TRANSFER_KEY, GUEST_CONTACT_KEY } from './guestAccount';
import type { PropertyStore } from './persistence';
import type { PersonStore, PersonPropertyLink, PropertySource } from './people';
import type { RequirementStore } from './requirementPersistence';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import { ACCOUNT_STORAGE_KEY, decodeAccountFoundation, initialAccountFoundation } from './accountFoundation';
import { ASSISTANT_STORAGE_KEY, decodeAssistant } from './dailyAssistant';
import { MATCH_NOTIFICATIONS_KEY, decodeMatchNotices } from './matchNotifications';
export interface TransferStore extends PropertyStore, PersonStore, RequirementStore { getIntegrityStatus(): { hasUnreadableRecords: boolean } }
export interface TransferSide { storage: AccountStorage; store: TransferStore; assertActive(): void }
export interface GuestSnapshot { properties: Property[]; people: Awaited<ReturnType<PersonStore['getPeople']>>; requirements: SeekerRequirement[]; links: PersonPropertyLink[]; sources: PropertySource[]; extras: Record<string, string> }
const businessKeys = new Set(['@viewstate_properties', '@viewstate_people_v1', '@viewstate_person_property_links_v1', '@viewstate_property_sources_v1', '@viewstate_seeker_requirements_v1', '@viewstate_seeker_requirements_v2', '@viewstate_deleted_property_ids_v1']);
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => (value as any)[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable((value as any)[k])).join(',') + '}';
  return JSON.stringify(value);
}
function same(a: unknown, b: unknown) { return stable(a) === stable(b); }
function mergeRows<T extends { id: string }>(target: T[], source: T[]) {
  const out = [...target];
  for (const row of source) { const found = out.find(x => x.id === row.id); if (found && !same(found, row)) throw new Error('GUEST_TRANSFER_CONFLICT'); if (!found) out.push(row); }
  return out;
}
function mergeMap(target: Record<string, any>, source: Record<string, any>) {
  for (const key of Object.keys(source)) if (key in target && !same(target[key], source[key])) throw new Error('GUEST_TRANSFER_CONFLICT');
  return { ...source, ...target };
}
export async function snapshotGuest(side: TransferSide): Promise<GuestSnapshot> {
  side.assertActive(); await side.store.init();
  if (!side.storage.getAllKeys) throw new Error('GUEST_KEY_ENUMERATION_UNAVAILABLE');
  const [properties, people, requirements, links] = await Promise.all([side.store.getProperties(), side.store.getPeople(), side.store.getRequirements(), side.store.getPersonPropertyLinks()]);
  const sources = (await Promise.all(properties.map(p => side.store.getPropertySource(p.core.id)))).filter((x): x is PropertySource => x !== null);
  if (side.store.getIntegrityStatus().hasUnreadableRecords) throw new Error('GUEST_DATA_UNREADABLE');
  const extras: Record<string, string> = {};
  for (const key of [...await side.storage.getAllKeys()].sort()) {
    if (businessKeys.has(key) || key === GUEST_TRANSFER_KEY || key === GUEST_CONTACT_KEY || key.startsWith('@viewstate_guest_import_')) continue;
    const raw = await side.storage.getItem(key); if (raw !== null) extras[key] = raw;
  }
  side.assertActive(); return { properties, people, requirements, links, sources, extras };
}
function mergedExtra(key: string, target: string | null, source: string): string {
  if (target === null || target === source) return source;
  if (key === ACCOUNT_STORAGE_KEY) {
    const a = decodeAccountFoundation(target), b = decodeAccountFoundation(source);
    const defaults = initialAccountFoundation();
    const targetIsDefault = same({ ...a, profile: defaults.profile }, defaults);
    return JSON.stringify({ ...(targetIsDefault ? b : a), profile: a.profile, feedback: mergeRows(a.feedback, b.feedback) });
  }
  if (key === ASSISTANT_STORAGE_KEY) {
    const a = decodeAssistant(target), b = decodeAssistant(source);
    return JSON.stringify({ ...a, revision: Math.max(a.revision, b.revision) + 1, tasks: mergeRows(a.tasks, b.tasks), availability: mergeMap(a.availability, b.availability), contacts: mergeMap(a.contacts, b.contacts), dismissed: [...new Set([...a.dismissed, ...b.dismissed])] });
  }
  if (key === MATCH_NOTIFICATIONS_KEY) {
    const a = decodeMatchNotices(target), b = decodeMatchNotices(source);
    return JSON.stringify({ ...a, revision: Math.max(a.revision, b.revision) + 1, seen: { ...b.seen, ...a.seen }, entries: mergeRows(a.entries, b.entries) });
  }
  // Chronology maps merge without erasing existing IDs. Other conflicting drafts stay untouched.
  if (key.includes('chronology')) {
    try { const a = JSON.parse(target), b = JSON.parse(source); if (a.version !== 1 || b.version !== 1 || !a.entries || !b.entries) throw new Error('INVALID_CHRONOLOGY'); return JSON.stringify({ version: 1, entries: { ...b.entries, ...a.entries } }); } catch { throw new Error('GUEST_TRANSFER_CONFLICT'); }
  }
  throw new Error('GUEST_TRANSFER_CONFLICT');
}
/** Local copy only. The immutable journal binds retries to one verified destination. Source is never deleted. */
async function copyGuest(options: {
  guest: TransferSide; target: TransferSide; targetUserId: string;
  rewriteMedia(snapshot: GuestSnapshot): Promise<GuestSnapshot>;
}) {
  const { guest, target, targetUserId } = options; assertAccountId(targetUserId);
  const raw = await guest.storage.getItem(GUEST_TRANSFER_KEY);
  let journal: { version: 1; targetUserId: string; status: 'pending' | 'complete'; snapshot: GuestSnapshot; extras?: Record<string, string>; before?: Record<string, string | null> };
  if (raw) {
    journal = JSON.parse(raw);
    if (journal.version !== 1 || journal.targetUserId !== targetUserId) throw new Error('GUEST_TRANSFER_BOUND_TO_OTHER_ACCOUNT');
    if (journal.status === 'complete') return;
  } else journal = { version: 1, targetUserId, status: 'pending', snapshot: await snapshotGuest(guest) };
  const assert = () => { guest.assertActive(); target.assertActive(); };
  assert(); await target.store.init();
  if (target.store.getIntegrityStatus().hasUnreadableRecords) throw new Error('ACCOUNT_DATA_UNREADABLE');
  await guest.storage.setItem(GUEST_TRANSFER_KEY, JSON.stringify(journal));
  if (await guest.storage.getItem(GUEST_TRANSFER_KEY) !== JSON.stringify(journal)) throw new Error('GUEST_TRANSFER_JOURNAL_FAILED');
  const data = await options.rewriteMedia(journal.snapshot); assert();
  // Preflight all business collisions before writing any business record.
  const people = await target.store.getPeople();
  for (const p of data.people) {
    const existing = people.find(x => x.id === p.id || x.normalizedPhone === p.normalizedPhone);
    if (existing && !same(existing, p)) throw new Error('GUEST_TRANSFER_CONTACT_CONFLICT');
  }
  for (const p of data.properties) { const existing = await target.store.getProperty(p.core.id); if (existing && !same(existing, p)) throw new Error('GUEST_TRANSFER_PROPERTY_CONFLICT'); }
  for (const r of data.requirements) { const existing = await target.store.getRequirement(r.id); if (existing && !same(existing, r)) throw new Error('GUEST_TRANSFER_REQUIREMENT_CONFLICT'); }
  for (const s of data.sources) { const existing = await target.store.getPropertySource(s.propertyCoreId); if (existing && !same(existing, s)) throw new Error('GUEST_TRANSFER_SOURCE_CONFLICT'); }
  if (!journal.extras) {
    journal.extras = {}; journal.before = {};
    for (const [key, value] of Object.entries(data.extras)) { const before = await target.storage.getItem(key); journal.before[key] = before; journal.extras[key] = mergedExtra(key, before, value); }
  }
  // Journal must be durable before any record writes. Partial storage errors are retryable for this owner only.
  await guest.storage.setItem(GUEST_TRANSFER_KEY, JSON.stringify(journal));
  if (await guest.storage.getItem(GUEST_TRANSFER_KEY) !== JSON.stringify(journal)) throw new Error('GUEST_TRANSFER_JOURNAL_FAILED');
  for (const [key, value] of Object.entries(journal.extras)) { assert(); const current = await target.storage.getItem(key); if (current !== value && current !== journal.before?.[key]) throw new Error('GUEST_TRANSFER_CONCURRENT_CHANGE'); await target.storage.setItem(key, value); if (await target.storage.getItem(key) !== value) throw new Error('GUEST_TRANSFER_READBACK_FAILED'); }
  for (const p of data.people) { assert(); const stored = await target.store.savePerson(p); if (stored.id !== p.id || !same(await target.store.getPerson(p.id), p)) throw new Error('GUEST_TRANSFER_READBACK_FAILED'); }
  for (const p of data.properties) { assert(); if (!await target.store.getProperty(p.core.id)) await target.store.saveProperty(p); if (!same(await target.store.getProperty(p.core.id), p)) throw new Error('GUEST_TRANSFER_READBACK_FAILED'); }
  for (const r of data.requirements) { assert(); if (!await target.store.getRequirement(r.id)) await target.store.saveRequirement(r); if (!same(await target.store.getRequirement(r.id), r)) throw new Error('GUEST_TRANSFER_READBACK_FAILED'); }
  for (const l of data.links) { assert(); const existing = await target.store.getPersonPropertyLinks(); if (!existing.some(x => same(x, l))) await target.store.linkPersonToProperty(l); if (!(await target.store.getPersonPropertyLinks()).some(x => same(x, l))) throw new Error('GUEST_TRANSFER_LINK_READBACK_FAILED'); }
  for (const s of data.sources) { assert(); await target.store.setPropertySource(s); if (!same(await target.store.getPropertySource(s.propertyCoreId), s)) throw new Error('GUEST_TRANSFER_SOURCE_READBACK_FAILED'); }
  for (const [key, value] of Object.entries(journal.extras)) { const current = await target.storage.getItem(key); if (current !== value) { try { if (current === null || !same(JSON.parse(current), JSON.parse(value))) throw new Error('CHANGED'); } catch { throw new Error('GUEST_TRANSFER_CONCURRENT_CHANGE'); } } }
  if (!same(await snapshotGuest(guest), journal.snapshot)) throw new Error('GUEST_TRANSFER_SOURCE_CHANGED');
  assert(); journal.status = 'complete';
  await guest.storage.setItem(GUEST_TRANSFER_KEY, JSON.stringify(journal));
  if (await guest.storage.getItem(GUEST_TRANSFER_KEY) !== JSON.stringify(journal)) throw new Error('GUEST_TRANSFER_JOURNAL_FAILED');
}

export async function transferGuest(options: Parameters<typeof copyGuest>[0]) {
  if (!options.guest.storage.withExclusiveLock) throw new Error('GUEST_TRANSFER_LOCK_REQUIRED');
  return options.guest.storage.withExclusiveLock('guest-transfer-owner-v1', () => copyGuest(options));
}
