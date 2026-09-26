import { SerialTaskQueue } from '@/services/serialTaskQueue';
import type {
  CoordinatesMetadata,
  PropertyAttachmentMetadata,
  PropertyDetailField,
  PropertyDemoCaptureMetadata,
} from '@workspace/property-domain';
import { PROPERTY_DETAIL_FIELD_DEFINITIONS } from '@workspace/property-domain';
import { getDemoCategory } from '@/services/propertyDemoCatalog';

export type CaptureDetailValues = Partial<Record<PropertyDetailField, string>> & {
  nearbyServices?: string;
  demoMetadata?: PropertyDemoCaptureMetadata;
  areaSquareMeters?: number;
  areaUnit?: 'square_meter' | 'square_foot';
  manualLocationText?: string;
  paciUnitNumbers?: readonly { readonly unitLabel: string; readonly paciNumber: string }[];
  mapsLink?: string;
  coordinates?: CoordinatesMetadata;
  attachments?: readonly PropertyAttachmentMetadata[];
};

const SQUARE_FEET_TO_SQUARE_METERS = 0.092903;
const normalizeArea = (value: number) =>
  Math.round(value * SQUARE_FEET_TO_SQUARE_METERS * 1_000_000) / 1_000_000;

export function normalizeCaptureDetailUnits(details: CaptureDetailValues): CaptureDetailValues {
  const demo = details.demoMetadata;
  const area = details.areaSquareMeters;
  const unit = details.areaUnit ?? demo?.areaUnit;
  const normalizedArea = area === undefined
    ? (demo?.areaSquareMeters === undefined
      ? undefined
      : demo.areaUnit === 'square_foot' ? normalizeArea(demo.areaSquareMeters) : demo.areaSquareMeters)
    : unit === 'square_foot' ? normalizeArea(area) : area;
  const normalizedDemoArea = demo?.areaSquareMeters === undefined
    ? undefined
    : demo.areaUnit === 'square_foot' ? normalizeArea(demo.areaSquareMeters) : demo.areaSquareMeters;
  const migratedCanonical: Partial<Record<PropertyDetailField, string>> = {};
  const category = demo?.categoryId ? getDemoCategory(demo.categoryId) : undefined;
  for (const featureId of demo?.selectedFeatures ?? []) {
    const canonicalField = ({
      maid_room: 'hasMaidRoom',
      heating: 'hasHeating',
      balcony: 'hasBalcony',
      laundry_room: 'hasLaundryRoom',
      solar_heater: 'hasSolarHeater',
      elevator: 'hasElevator',
      garden: 'hasGarden',
      security: 'hasSecurityGuard',
      bbq: 'hasBBQArea',
      pool: 'hasPool',
    } as Partial<Record<string, PropertyDetailField>>)[featureId];
    const definition = canonicalField && PROPERTY_DETAIL_FIELD_DEFINITIONS.find(item => item.field === canonicalField);
    if (
      canonicalField
      && category !== undefined
      && definition !== undefined
      && definition.appliesTo.includes(category.canonicalType)
      && (!definition.floorUses || category.canonicalType !== 'floor' || definition.floorUses.includes(details.floorUse as 'residential' | 'commercial'))
      && details[canonicalField] === undefined
    ) migratedCanonical[canonicalField] = 'true';
  }
  return {
    ...details,
    ...migratedCanonical,
    ...(normalizedArea !== undefined ? { areaSquareMeters: normalizedArea, areaUnit: 'square_meter' as const } : {}),
    ...(demo ? {
      demoMetadata: {
        ...demo,
        ...(normalizedDemoArea !== undefined ? { areaSquareMeters: normalizedDemoArea, areaUnit: 'square_meter' as const } : {}),
      },
    } : {}),
  };
}

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
    return normalizeCaptureDetailUnits(JSON.parse(raw) as CaptureDetailValues);
  } catch {
    throw new Error('CAPTURE_DETAILS_UNREADABLE');
  }
}

export async function saveCaptureDetails(
  propertyCoreId: string | undefined,
  details: CaptureDetailValues,
  expected: CaptureDetailValues | null | undefined,
  storage: CaptureDetailsStorage,
): Promise<boolean> {
  let saved = false;
  await writes.enqueue(async () => {
    const key = captureDetailsKey(propertyCoreId);
    const current = await storage.getItem(key);
    if (expected !== undefined && current !== (expected === null ? null : JSON.stringify(expected))) return;
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