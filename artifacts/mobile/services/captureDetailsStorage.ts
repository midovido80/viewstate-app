import { SerialTaskQueue } from '@/services/serialTaskQueue';
import type { PropertyDetailField } from '@workspace/property-domain';

export type CaptureDetailValues = Partial<Record<PropertyDetailField, string>>;

export const CAPTURE_DETAILS_PREFIX = '@viewstate_property_capture_details_v1:';
export interface CaptureDetailsStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const writes = new SerialTaskQueue();
export const captureDetailsKey = (propertyCoreId?: string) =>
  `${CAPTURE_DETAILS_PREFIX}${encodeURIComponent(propertyCoreId ?? 'new')}`;

export async function loadCaptureDetails(
  propertyCoreId: string | undefined,
  storage: CaptureDetailsStorage,
): Promise<CaptureDetailValues> {
  const raw = await storage.getItem(captureDetailsKey(propertyCoreId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CaptureDetailValues;
  } catch {
    throw new Error('CAPTURE_DETAILS_UNREADABLE');
  }
}

export async function saveCaptureDetails(
  propertyCoreId: string | undefined,
  details: CaptureDetailValues,
  expected: CaptureDetailValues | null,
  storage: CaptureDetailsStorage,
): Promise<boolean> {
  let saved = false;
  await writes.enqueue(async () => {
    const key = captureDetailsKey(propertyCoreId);
    const current = await storage.getItem(key);
    if (current !== (expected === null ? null : JSON.stringify(expected))) return;
    await storage.setItem(key, JSON.stringify(details));
    saved = true;
  });
  return saved;
}

export async function clearCaptureDetails(
  propertyCoreId: string | undefined,
  expected: CaptureDetailValues,
  storage: CaptureDetailsStorage,
): Promise<boolean> {
  let cleared = false;
  await writes.enqueue(async () => {
    const key = captureDetailsKey(propertyCoreId);
    const current = await storage.getItem(key);
    if (current !== JSON.stringify(expected)) return;
    await storage.removeItem(key);
    cleared = true;
  });
  return cleared;
}

export async function flushCaptureDetailsWrites(): Promise<void> {
  await writes.flush();
}