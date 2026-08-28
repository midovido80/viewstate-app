import AsyncStorage from '@react-native-async-storage/async-storage';
import { PropertyDraft } from '@workspace/property-domain';
import { parseStoredJson, SerialTaskQueue, StoredValueParseError } from '@/services/serialTaskQueue';
import { migrateStage01B1Draft } from '@/services/stage01B1CurrencyMigration';

const DRAFT_KEY = '@viewstate_property_draft';
const writes = new SerialTaskQueue();
let writeGeneration = 0;

export class DraftReadError extends Error {
  constructor(cause: unknown) {
    super('The stored property draft could not be read.');
    this.name = 'DraftReadError';
    this.cause = cause;
  }
}

export async function saveDraft(draft: PropertyDraft): Promise<void> {
  const snapshot = JSON.stringify(draft);
  const generation = writeGeneration;
  return writes.enqueue(async () => {
    if (generation !== writeGeneration) return;
    await AsyncStorage.setItem(DRAFT_KEY, snapshot);
  });
}

export async function loadDraft(): Promise<PropertyDraft | null> {
  try {
    await migrateStage01B1Draft(AsyncStorage, DRAFT_KEY);
    const data = await AsyncStorage.getItem(DRAFT_KEY);
    return parseStoredJson<PropertyDraft>(data);
  } catch (error) {
    console.error('Failed to load draft:', error);
    throw error instanceof DraftReadError
      ? error
      : new DraftReadError(error instanceof StoredValueParseError ? error.cause : error);
  }
}

export async function clearDraft(): Promise<void> {
  writeGeneration += 1;
  return writes.enqueue(async () => {
    await AsyncStorage.removeItem(DRAFT_KEY);
  });
}

export async function replaceDraftIfUnchanged(
  expectedSnapshot: string,
  replacement: PropertyDraft,
): Promise<boolean> {
  writeGeneration += 1;
  const generation = writeGeneration;
  const replacementSnapshot = JSON.stringify(replacement);
  let replaced = false;
  await writes.enqueue(async () => {
    const current = await AsyncStorage.getItem(DRAFT_KEY);
    if (current === null) return;
    try {
      JSON.parse(current);
    } catch (error) {
      throw new DraftReadError(error);
    }
    if (current !== expectedSnapshot || generation !== writeGeneration) return;
    await AsyncStorage.setItem(DRAFT_KEY, replacementSnapshot);
    replaced = true;
  });
  return replaced;
}

export async function replaceDraft(replacement: PropertyDraft): Promise<void> {
  writeGeneration += 1;
  const generation = writeGeneration;
  const snapshot = JSON.stringify(replacement);
  return writes.enqueue(async () => {
    if (generation !== writeGeneration) return;
    await AsyncStorage.setItem(DRAFT_KEY, snapshot);
  });
}

export async function flushDraftWrites(): Promise<void> {
  await writes.flush();
}
