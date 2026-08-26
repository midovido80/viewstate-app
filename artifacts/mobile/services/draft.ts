import AsyncStorage from '@react-native-async-storage/async-storage';
import { PropertyDraft } from '@workspace/property-domain';
import { SerialTaskQueue } from '@/services/serialTaskQueue';
import { migrateStage01B1Draft } from '@/services/stage01B1CurrencyMigration';

const DRAFT_KEY = '@viewstate_property_draft';
const writes = new SerialTaskQueue();

export async function saveDraft(draft: PropertyDraft): Promise<void> {
  const snapshot = JSON.stringify(draft);
  return writes.enqueue(async () => {
    await AsyncStorage.setItem(DRAFT_KEY, snapshot);
  });
}

export async function loadDraft(): Promise<PropertyDraft | null> {
  try {
    await migrateStage01B1Draft(AsyncStorage, DRAFT_KEY);
    const data = await AsyncStorage.getItem(DRAFT_KEY);
    return data ? JSON.parse(data) as PropertyDraft : null;
  } catch (error) {
    console.error('Failed to load draft:', error);
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  return writes.enqueue(async () => {
    await AsyncStorage.removeItem(DRAFT_KEY);
  });
}

export async function flushDraftWrites(): Promise<void> {
  await writes.flush();
}
