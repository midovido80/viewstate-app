import {
  validateProperty,
  validateSeekerRequirement,
  validatePropertySource,
  type Property,
  type SeekerRequirement,
} from "@workspace/property-domain";
import {
  assertValidPerson,
  type Person,
  type PersonPropertyLink,
  type PropertySource,
} from "./people";
import type { PropertyStore } from "./persistence";
import type { PersonStore } from "./people";
import type { RequirementStore } from "./requirementPersistence";
import {
  ASSISTANT_STORAGE_KEY,
  decodeAssistant,
  type AssistantState,
} from "./dailyAssistant";
import { stableSync, type SyncRecords } from "./workspaceSync";
export interface BusinessSnapshot {
  properties: Property[];
  people: Person[];
  requirements: SeekerRequirement[];
  links: PersonPropertyLink[];
  sources: PropertySource[];
}
export type SnapshotStore = PropertyStore &
  PersonStore &
  RequirementStore & {
    getIntegrityStatus(): { hasUnreadableRecords: boolean };
  };
export async function readBusiness(
  store: SnapshotStore,
): Promise<BusinessSnapshot> {
  const [properties, people, requirements, links] = await Promise.all([
    store.getProperties(),
    store.getPeople(),
    store.getRequirements(),
    store.getPersonPropertyLinks(),
  ]);
  const sources = (
    await Promise.all(properties.map((p) => store.getPropertySource(p.core.id)))
  ).filter((s): s is PropertySource => s !== null);
  if (store.getIntegrityStatus().hasUnreadableRecords)
    throw new Error("SYNC_UNREADABLE_LOCAL_DATA");
  return { properties, people, requirements, links, sources };
}
export function validateBusiness(data: BusinessSnapshot) {
  if (
    !data ||
    !["properties", "people", "requirements", "links", "sources"].every((k) =>
      Array.isArray((data as unknown as Record<string, unknown>)[k]),
    )
  )
    throw new Error("SYNC_INVALID_WORKSPACE");
  const people = new Set<string>(),
    phones = new Set<string>(),
    properties = new Set<string>(),
    requests = new Set<string>(),
    sources = new Set<string>(),
    links = new Set<string>();
  for (const p of data.people) {
    assertValidPerson(p);
    if (people.has(p.id) || phones.has(p.normalizedPhone))
      throw new Error("SYNC_CONTACT_CONFLICT");
    people.add(p.id);
    phones.add(p.normalizedPhone);
  }
  for (const p of data.properties) {
    if (!validateProperty(p).ok || properties.has(p.core.id))
      throw new Error("SYNC_INVALID_PROPERTY");
    properties.add(p.core.id);
  }
  for (const r of data.requirements) {
    if (
      !validateSeekerRequirement(r, {
        allowLegacyCatalogAliases: true,
        allowLegacyEmptyAreaScope: true,
      }).ok ||
      requests.has(r.id) ||
      (r.seekerId && !people.has(r.seekerId))
    )
      throw new Error("SYNC_INVALID_REQUIREMENT");
    requests.add(r.id);
  }
  for (const s of data.sources) {
    if (
      !validatePropertySource(s).ok ||
      !people.has(s.personId) ||
      !properties.has(s.propertyCoreId) ||
      sources.has(s.propertyCoreId)
    )
      throw new Error("SYNC_INVALID_SOURCE");
    sources.add(s.propertyCoreId);
  }
  for (const l of data.links) {
    const key = JSON.stringify([l.personId, l.propertyCoreId]);
    if (
      !people.has(l.personId) ||
      !properties.has(l.propertyCoreId) ||
      links.has(key)
    )
      throw new Error("SYNC_INVALID_LINK");
    links.add(key);
  }
}
export function businessRecords(
  data: BusinessSnapshot,
  assistant: AssistantState,
): SyncRecords {
  const out: SyncRecords = {};
  for (const p of data.properties) out[`property/${p.core.id}`] = p;
  for (const p of data.people) out[`person/${p.id}`] = p;
  for (const r of data.requirements) out[`requirement/${r.id}`] = r;
  for (const l of data.links)
    out[
      `link/${encodeURIComponent(l.personId)}/${encodeURIComponent(l.propertyCoreId)}`
    ] = l;
  for (const s of data.sources) out[`source/${s.propertyCoreId}`] = s;
  for (const t of assistant.tasks) out[`task/${t.id}`] = t;
  for (const [id, value] of Object.entries(assistant.availability))
    out[`availability/${id}`] = value;
  for (const [id, value] of Object.entries(assistant.contacts))
    out[`contact/${id}`] = value;
  for (const id of assistant.dismissed) out[`dismissed/${id}`] = true;
  return out;
}
export function fromBusinessRecords(
  records: SyncRecords,
  assistant: AssistantState,
) {
  const data: BusinessSnapshot = {
    properties: [],
    people: [],
    requirements: [],
    links: [],
    sources: [],
  };
  const next: AssistantState = {
    ...assistant,
    revision: assistant.revision + 1,
    tasks: [],
    availability: {},
    contacts: {},
    dismissed: [],
  };
  for (const [key, value] of Object.entries(records)) {
    const slash = key.indexOf("/"),
      kind = key.slice(0, slash),
      id = key.slice(slash + 1);
    if (
      !id ||
      id.length > 500 ||
      ["__proto__", "constructor", "prototype"].includes(id)
    )
      throw new Error("SYNC_INVALID_RECORD_ID");
    if (kind === "property") {
      const p = value as Property;
      if (p.core?.id !== id) throw new Error("SYNC_ID_MISMATCH");
      data.properties.push(p);
    } else if (kind === "person") {
      const p = value as Person;
      if (p.id !== id) throw new Error("SYNC_ID_MISMATCH");
      data.people.push(p);
    } else if (kind === "requirement") {
      const r = value as SeekerRequirement;
      if (r.id !== id) throw new Error("SYNC_ID_MISMATCH");
      data.requirements.push(r);
    } else if (kind === "source") {
      const s = value as PropertySource;
      if (s.propertyCoreId !== id) throw new Error("SYNC_ID_MISMATCH");
      data.sources.push(s);
    } else if (kind === "link") {
      const l = value as PersonPropertyLink;
      if (
        id !==
        `${encodeURIComponent(l.personId)}/${encodeURIComponent(l.propertyCoreId)}`
      )
        throw new Error("SYNC_ID_MISMATCH");
      data.links.push(l);
    } else if (kind === "task") {
      const t = value as AssistantState["tasks"][number];
      if (t.id !== id) throw new Error("SYNC_ID_MISMATCH");
      next.tasks.push(t);
    } else if (kind === "availability")
      next.availability[id] = value as AssistantState["availability"][string];
    else if (kind === "contact")
      next.contacts[id] = value as AssistantState["contacts"][string];
    else if (kind === "dismissed" && value === true) next.dismissed.push(id);
    else throw new Error("SYNC_UNKNOWN_RECORD_KIND");
  }
  validateBusiness(data);
  decodeAssistant(JSON.stringify(next));
  return { data, assistant: next };
}
export function sameBusiness(a: BusinessSnapshot, b: BusinessSnapshot) {
  const sort = (d: BusinessSnapshot) => ({
    properties: [...d.properties].sort((a, b) =>
      a.core.id.localeCompare(b.core.id),
    ),
    people: [...d.people].sort((a, b) => a.id.localeCompare(b.id)),
    requirements: [...d.requirements].sort((a, b) => a.id.localeCompare(b.id)),
    links: [...d.links].sort((a, b) =>
      stableSync(a).localeCompare(stableSync(b)),
    ),
    sources: [...d.sources].sort((a, b) =>
      a.propertyCoreId.localeCompare(b.propertyCoreId),
    ),
  });
  return stableSync(sort(a)) === stableSync(sort(b));
}
export { ASSISTANT_STORAGE_KEY, decodeAssistant };
