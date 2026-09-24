import type { SeekerRequirement } from '@workspace/property-domain';

export interface RequirementSavePerson {
  readonly classifications: readonly string[];
}

export interface RequirementSaveStore {
  getPerson(id: string): Promise<RequirementSavePerson | null>;
  getRequirement(id: string): Promise<SeekerRequirement | null>;
  saveRequirement(requirement: SeekerRequirement): Promise<void>;
  updateRequirement(expected: SeekerRequirement, replacement: SeekerRequirement): Promise<boolean>;
}

export function tryStartRequirementSave(
  flight: { current: boolean },
  alreadyCommitted: boolean,
  writeStatusUncertain: boolean,
  editConflict: boolean = false,
): boolean {
  if (flight.current || alreadyCommitted || writeStatusUncertain || editConflict) return false;
  flight.current = true;
  return true;
}

export class RequirementRouteGeneration {
  private generation = 0;

  advance(): number {
    this.generation += 1;
    return this.generation;
  }

  capture(): number {
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return this.generation === generation;
  }
}

export function shouldRenderRequirementRecoveryControls(
  hasError: boolean,
  recoveryAction: string | null,
): boolean {
  return hasError || recoveryAction !== null;
}

export type RequirementSaveOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'missing_person' }
  | { readonly status: 'non_seeker' }
  | { readonly status: 'edit_conflict' }
  | { readonly status: 'storage_failure'; readonly retryAllowed: boolean; readonly conflict?: boolean }
  | { readonly status: 'saved_readback_failed' }
  | { readonly status: 'saved_navigation_failed' };

export function requirementIdentityMatches(
  saved: SeekerRequirement | null,
  expected: SeekerRequirement,
): boolean {
  return saved?.id === expected.id && saved.seekerId === expected.seekerId;
}

function requirementMatches(
  saved: SeekerRequirement | null,
  expected: SeekerRequirement,
): boolean {
  return requirementIdentityMatches(saved, expected)
    && JSON.stringify(saved) === JSON.stringify(expected);
}

async function navigateToPerson(
  navigate: () => void | Promise<void>,
): Promise<RequirementSaveOutcome> {
  try {
    await navigate();
    return { status: 'saved' };
  } catch {
    return { status: 'saved_navigation_failed' };
  }
}

/** Writes once, confirms the exact requirement identity, then navigates. */
export async function savePersonRequirement(options: {
  readonly candidate: SeekerRequirement;
  readonly baseline: SeekerRequirement | null;
  readonly store: RequirementSaveStore;
  readonly navigate: () => void | Promise<void>;
}): Promise<RequirementSaveOutcome> {
  const { candidate, baseline, store, navigate } = options;
  let person: RequirementSavePerson | null;
  try {
    person = await store.getPerson(candidate.seekerId);
  } catch {
    return { status: 'storage_failure', retryAllowed: true };
  }
  if (!person) return { status: 'missing_person' };
  if (!person.classifications.includes('seeker')) return { status: 'non_seeker' };

  try {
    if (baseline) {
      if (!await store.updateRequirement(baseline, candidate)) {
        return { status: 'edit_conflict' };
      }
    } else {
      await store.saveRequirement(candidate);
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUIREMENT_CHANGED') {
      return baseline
        ? { status: 'edit_conflict' }
        : { status: 'storage_failure', retryAllowed: true, conflict: true };
    }
    if (error instanceof Error && error.message === 'REQUIREMENT_SEEKER_NOT_FOUND') {
      return { status: 'missing_person' };
    }
    if (error instanceof Error && error.message === 'REQUIREMENT_SEEKER_CLASSIFICATION_REQUIRED') {
      return { status: 'non_seeker' };
    }

    // A rejected write can still have committed. Resolve it by the candidate's
    // exact ID before making another write available to the user.
    try {
      const saved = await store.getRequirement(candidate.id);
      if (saved === null) {
        return { status: 'storage_failure', retryAllowed: true };
      }
      if (!requirementMatches(saved, candidate)) {
        return { status: 'storage_failure', retryAllowed: false, conflict: true };
      }
      return await navigateToPerson(navigate);
    } catch {
      return { status: 'storage_failure', retryAllowed: false };
    }
  }

  let saved: SeekerRequirement | null;
  try {
    saved = await store.getRequirement(candidate.id);
  } catch {
    return { status: 'saved_readback_failed' };
  }
  if (!requirementMatches(saved, candidate)) {
    return { status: 'saved_readback_failed' };
  }
  return navigateToPerson(navigate);
}

/** Retries confirmation only; it never writes or creates a Requirement. */
export async function retryRequirementReadback(options: {
  readonly candidate: SeekerRequirement;
  readonly store: Pick<RequirementSaveStore, 'getRequirement'>;
  readonly navigate: () => void | Promise<void>;
}): Promise<RequirementSaveOutcome> {
  let saved: SeekerRequirement | null;
  try {
    saved = await options.store.getRequirement(options.candidate.id);
  } catch {
    return { status: 'saved_readback_failed' };
  }
  if (!requirementMatches(saved, options.candidate)) {
    return { status: 'saved_readback_failed' };
  }
  return navigateToPerson(options.navigate);
}

/** Resolves an uncertain rejected write before the UI enables another save. */
export async function verifyUncertainRequirementWrite(options: {
  readonly candidate: SeekerRequirement;
  readonly store: Pick<RequirementSaveStore, 'getRequirement'>;
  readonly navigate: () => void | Promise<void>;
}): Promise<RequirementSaveOutcome> {
  let saved: SeekerRequirement | null;
  try {
    saved = await options.store.getRequirement(options.candidate.id);
  } catch {
    return { status: 'storage_failure', retryAllowed: false };
  }
  if (saved === null) return { status: 'storage_failure', retryAllowed: true };
  if (!requirementMatches(saved, options.candidate)) {
    return { status: 'storage_failure', retryAllowed: false, conflict: true };
  }
  return navigateToPerson(options.navigate);
}

/** Retries the route transition only after the exact-ID readback succeeded. */
export async function retryRequirementNavigation(
  navigate: () => void | Promise<void>,
): Promise<RequirementSaveOutcome> {
  return navigateToPerson(navigate);
}