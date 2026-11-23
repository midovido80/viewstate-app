import { validateProperty, type Property, type MatchingPropertyCandidate, type SeekerRequirement } from '@workspace/property-domain';

export interface SharedCircleProperty {
  id: string;
  publisher_id: string;
  source_key: string;
  revision: number;
  facts: unknown;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Load must call the authorized, circle-bound server RPC. Never aggregate private stores here. */
export class CircleMatchingSource {
  private snapshot?: Promise<MatchingPropertyCandidate[]>;
  constructor(private readonly load: () => Promise<readonly SharedCircleProperty[]>) {}
  getCandidates(_requirement?: SeekerRequirement): Promise<MatchingPropertyCandidate[]> {
    return this.snapshot ??= this.read();
  }
  private async read(): Promise<MatchingPropertyCandidate[]> {
    const rows = await this.load();
    if (!Array.isArray(rows)) throw new Error('CIRCLE_CATALOG_INVALID');
    const seen = new Set<string>();
    return rows.flatMap(row => {
      if (!row || !uuid.test(row.id) || !uuid.test(row.publisher_id) || !row.source_key
        || !Number.isSafeInteger(row.revision) || row.revision < 1 || seen.has(row.id)) throw new Error('CIRCLE_CATALOG_INVALID');
      seen.add(row.id);
      try {
        const facts = row.facts as Property;
        if (!validateProperty(facts).ok || facts.core.id !== row.source_key) return [];
        // Equal local IDs in separate accounts are distinct publications.
        return [{ property: {
          ...facts,
          core: { ...facts.core, id: row.id },
          activeOffer: { ...facts.activeOffer, id: `${row.id}-offer`, propertyCoreId: row.id },
        } }];
      } catch {
        return [];
      }
    });
  }
}
