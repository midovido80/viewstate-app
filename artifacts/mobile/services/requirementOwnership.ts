import type { SeekerRequirement } from '@workspace/property-domain';
import type { RequirementSaveStore } from '@/services/requirementSaveOutcome';
import { requirementsEquivalent } from '@/services/requirementSaveOutcome';

export type RequirementOwnershipOutcome =
  | { readonly status: 'linked'; readonly requirement: SeekerRequirement }
  | { readonly status: 'already_linked'; readonly requirement: SeekerRequirement }
  | { readonly status: 'missing_person' | 'non_seeker' | 'ownership_conflict' | 'edit_conflict' | 'readback_failed' | 'storage_failure' };

export async function linkRequirementToSeeker(options: {
  readonly expected: SeekerRequirement;
  readonly seekerId: string;
  readonly store: RequirementSaveStore;
}): Promise<RequirementOwnershipOutcome> {
  const { expected, seekerId, store } = options;
  if (expected.seekerId !== undefined) {
    return expected.seekerId === seekerId
      ? { status: 'already_linked', requirement: expected }
      : { status: 'ownership_conflict' };
  }
  let person;
  try { person = await store.getPerson(seekerId); } catch { return { status: 'storage_failure' }; }
  if (!person) return { status: 'missing_person' };
  if (!person.classifications?.includes('seeker')) return { status: 'non_seeker' };
  const replacement: SeekerRequirement = { ...expected, seekerId };
  try {
    if (!await store.updateRequirement(expected, replacement)) return { status: 'edit_conflict' };
    const saved = await store.getRequirement(expected.id);
    if (!requirementsEquivalent(saved, replacement)) return { status: 'readback_failed' };
    return { status: 'linked', requirement: saved! };
  } catch {
    return { status: 'storage_failure' };
  }
}
