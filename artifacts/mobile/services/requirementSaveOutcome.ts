import {
  normalizeSeekerRequirement,
  type SeekerRequirement,
} from '@workspace/property-domain';

export interface RequirementSavePerson {
  readonly id?: string;
  readonly classifications?: readonly string[];
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
  | {
    readonly status: 'storage_failure';
    readonly retryAllowed: boolean;
    readonly conflict?: boolean;
    readonly diagnostic?: RequirementSaveStageDiagnostic;
  }
  | { readonly status: 'saved_readback_failed' }
  | { readonly status: 'saved_navigation_failed' };

export interface RequirementSaveStageDiagnostic {
  readonly stage: 'ownership' | 'write' | 'readback' | 'navigation';
  readonly code:
    | 'person_missing'
    | 'person_not_seeker'
    | 'edit_conflict'
    | 'storage_failure'
    | 'readback_failed'
    | 'navigation_failed';
  /** Static contract paths only; never includes IDs, names, notes, or raw errors. */
  readonly location: readonly string[];
  /** Whitelisted error identity only. Never copy arbitrary exception messages here. */
  readonly errorType?: string;
}

function safeWriteErrorType(error: unknown): string {
  if (!(error instanceof Error)) return 'non_error';
  const known = [
    'SAFE_WEB_MUTATION_UNSUPPORTED', 'UNREADABLE_REQUIREMENT_STORAGE',
    'REQUIREMENT_FEATURE_DISABLED', 'REQUIREMENT_ID_ALREADY_EXISTS',
    'REQUIREMENT_SEEKER_NOT_FOUND', 'UNREADABLE_PERSON_STORAGE',
  ];
  if (known.includes(error.message)) return error.message;
  if (error.message.startsWith('INVALID_REQUIREMENT:')) {
    return 'INVALID_REQUIREMENT';
  }
  if (error.name === 'QuotaExceededError') return 'QuotaExceededError';
  return 'unexpected_error';
}

/** Safe operational context for logs and UI decisions; excludes record data and exceptions. */
export function requirementSaveStageDiagnostic(
  outcome: RequirementSaveOutcome,
): RequirementSaveStageDiagnostic | null {
  if (outcome.status === 'storage_failure' && outcome.diagnostic) {
    return outcome.diagnostic;
  }
  switch (outcome.status) {
    case 'saved':
      return null;
    case 'missing_person':
      return { stage: 'ownership', code: 'person_missing', location: ['person'] };
    case 'non_seeker':
      return { stage: 'ownership', code: 'person_not_seeker', location: ['person', 'classifications'] };
    case 'edit_conflict':
      return { stage: 'write', code: 'edit_conflict', location: ['requirement'] };
    case 'storage_failure':
      return { stage: 'write', code: 'storage_failure', location: ['requirement'] };
    case 'saved_readback_failed':
      return { stage: 'readback', code: 'readback_failed', location: ['requirement', 'id'] };
    case 'saved_navigation_failed':
      return { stage: 'navigation', code: 'navigation_failed', location: ['person'] };
  }
}

export function requirementIdentityMatches(
  saved: SeekerRequirement | null,
  expected: SeekerRequirement,
): boolean {
  return saved?.id === expected.id && saved.seekerId === expected.seekerId;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * Requirement stores normalize optional defaults and nested metadata on write.
 * Compare validated canonical projections, not the callers' insertion order or
 * pre-normalized object shape, while still requiring the exact ID and owner.
 */
export function requirementsEquivalent(
  left: SeekerRequirement | null,
  right: SeekerRequirement,
): boolean {
  if (!requirementIdentityMatches(left, right)) return false;
  const normalizedLeft = normalizeSeekerRequirement(left);
  const normalizedRight = normalizeSeekerRequirement(right);
  return normalizedLeft.ok
    && normalizedRight.ok
    && stableStringify(normalizedLeft.value) === stableStringify(normalizedRight.value);
}

function requirementMatches(
  saved: SeekerRequirement | null,
  expected: SeekerRequirement,
): boolean {
  return requirementsEquivalent(saved, expected);
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
    return {
      status: 'storage_failure',
      retryAllowed: true,
      diagnostic: { stage: 'ownership', code: 'storage_failure', location: ['person'] },
    };
  }
  if (!person) return { status: 'missing_person' };
  if (!person.classifications?.includes('seeker')) return { status: 'non_seeker' };

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
        : {
          status: 'storage_failure',
          retryAllowed: false,
          conflict: true,
          diagnostic: { stage: 'write', code: 'edit_conflict', location: ['requirement', 'id'] },
        };
    }
    if (error instanceof Error && error.message === 'REQUIREMENT_SEEKER_NOT_FOUND') {
      return { status: 'missing_person' };
    }
    const errorType = safeWriteErrorType(error);
    // A rejected write can still have committed. Resolve it by the candidate's
    // exact ID before making another write available to the user.
    try {
      const saved = await store.getRequirement(candidate.id);
      if (saved === null) {
        return {
          status: 'storage_failure',
          retryAllowed: true,
           diagnostic: { stage: 'write', code: 'storage_failure', location: ['requirement'], errorType },
        };
      }
      if (!requirementMatches(saved, candidate)) {
        return {
          status: 'storage_failure',
          retryAllowed: false,
          conflict: true,
           diagnostic: { stage: 'readback', code: 'readback_failed', location: ['requirement', 'id'], errorType },
        };
      }
      return await navigateToPerson(navigate);
    } catch {
      return {
        status: 'storage_failure',
        retryAllowed: false,
         diagnostic: { stage: 'readback', code: 'storage_failure', location: ['requirement', 'id'], errorType },
      };
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
    return {
      status: 'storage_failure',
      retryAllowed: false,
      diagnostic: { stage: 'readback', code: 'storage_failure', location: ['requirement', 'id'] },
    };
  }
  if (saved === null) {
    return {
      status: 'storage_failure',
      retryAllowed: true,
      diagnostic: { stage: 'readback', code: 'readback_failed', location: ['requirement', 'id'] },
    };
  }
  if (!requirementMatches(saved, options.candidate)) {
    return {
      status: 'storage_failure',
      retryAllowed: false,
      conflict: true,
      diagnostic: { stage: 'readback', code: 'readback_failed', location: ['requirement', 'id'] },
    };
  }
  return navigateToPerson(options.navigate);
}

/** Retries the route transition only after the exact-ID readback succeeded. */
export async function retryRequirementNavigation(
  navigate: () => void | Promise<void>,
): Promise<RequirementSaveOutcome> {
  return navigateToPerson(navigate);
}