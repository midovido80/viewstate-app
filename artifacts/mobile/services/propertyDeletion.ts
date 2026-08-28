import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Property } from '@workspace/property-domain';
import type { PropertyDeletionResult, PropertyStore } from '@/services/persistence';
import {
  PROPERTY_SAVE_OPERATION_KEY,
  parsePropertySaveOperation,
  type RecoveryStorage,
} from '@/services/propertySaveRecovery';
import {
  PROPERTY_UPDATE_OPERATION_KEY,
  loadPropertyUpdateOperation,
  propertyEditDraftKey,
  type UpdateStorage,
} from '@/services/propertyUpdateRecovery';
import { SingleFlight } from '@/services/serialTaskQueue';

const deletes = new SingleFlight();

async function assertNoPendingEvidence(
  targets: ReadonlySet<string>,
  storage: RecoveryStorage & UpdateStorage,
): Promise<void> {
  const saveRaw = await storage.getItem(PROPERTY_SAVE_OPERATION_KEY);
  if (saveRaw !== null) {
    const save = parsePropertySaveOperation(saveRaw);
    if (targets.has(save.targetProperty.core.id)) throw new Error('PENDING_PROPERTY_SAVE');
  }
  const update = await loadPropertyUpdateOperation(storage);
  if (update && targets.has(update.baseline.core.id)) throw new Error('PENDING_PROPERTY_UPDATE');
  for (const id of targets) {
    if (await storage.getItem(propertyEditDraftKey(id)) !== null) {
      throw new Error('PENDING_PROPERTY_EDIT_DRAFT');
    }
  }
}

export type CoordinatedDeletionResult =
  | PropertyDeletionResult
  | { status: 'busy' | 'evidence_blocked' | 'failed'; error?: unknown };

export async function deleteSavedProperty(options: {
  expected: Property;
  store: PropertyStore;
  evidenceStorage?: RecoveryStorage & UpdateStorage;
}): Promise<CoordinatedDeletionResult> {
  const run = await deletes.run(async () => {
    try {
      await assertNoPendingEvidence(
        new Set([options.expected.core.id]),
        options.evidenceStorage ?? AsyncStorage,
      );
      return await options.store.deleteProperty(options.expected);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return message.startsWith('PENDING_PROPERTY_')
        ? { status: 'evidence_blocked' as const, error }
        : { status: 'failed' as const, error };
    }
  });
  return run.started ? run.value : { status: 'busy' };
}

/**
 * API-only fixed-snapshot deletion. Callers must provide the exact records from
 * one inventory snapshot. It delegates to the storage adapter and is deliberately
 * not wired to any screen; WebStore is unavailable regardless of this precondition.
 */
export async function deleteSavedPropertySnapshot(options: {
  snapshot: readonly Property[];
  store: PropertyStore;
  evidenceStorage?: RecoveryStorage & UpdateStorage;
  /**
   * Explicit caller precondition for a fixed snapshot. It does not enable Web
   * deletion: WebStore always returns unsupported.
   */
  cooperatingWritersConfirmed: boolean;
}): Promise<CoordinatedDeletionResult> {
  if (!options.cooperatingWritersConfirmed) return { status: 'unsupported' };
  const run = await deletes.run(async () => {
    try {
      const targets = new Set(options.snapshot.map(property => property.core.id));
      await assertNoPendingEvidence(targets, options.evidenceStorage ?? AsyncStorage);
      return await options.store.deletePropertiesSnapshot(options.snapshot, {
        cooperatingWritersConfirmed: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      return message.startsWith('PENDING_PROPERTY_')
        ? { status: 'evidence_blocked' as const, error }
        : { status: 'failed' as const, error };
    }
  });
  return run.started ? run.value : { status: 'busy' };
}