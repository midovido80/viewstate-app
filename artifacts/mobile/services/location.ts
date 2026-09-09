import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import {
  requestInjectedCoordinates,
  type Coordinates,
} from './coordinateRequest';
import {
  normalizeGoogleMapsLink,
  openGoogleMapsQuery as openGoogleMapsQueryWithOpener,
  openPastedGoogleMapsLink,
  type LinkOpener,
} from './mapsLink';

export type { Coordinates } from './coordinateRequest';
export { requestInjectedCoordinates } from './coordinateRequest';
export { normalizeGoogleMapsLink } from './mapsLink';

export function isValidCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false;
  const coordinates = value as Partial<Coordinates>;
  return Number.isFinite(coordinates.latitude)
    && Number.isFinite(coordinates.longitude)
    && coordinates.latitude! >= -90
    && coordinates.latitude! <= 90
    && coordinates.longitude! >= -180
    && coordinates.longitude! <= 180;
}

export type PropertyMapLocation =
  | { readonly source: 'coordinates'; readonly coordinates: Coordinates }
  | { readonly source: 'pasted_link'; readonly link: string };

export interface LocationSource {
  requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  getCurrentPositionAsync(options?: {
    accuracy?: Location.Accuracy;
  }): Promise<{
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
    };
  }>;
}

export async function requestCurrentCoordinates(
  source: LocationSource = Location,
  platform: string = Platform.OS,
): Promise<Coordinates> {
  return requestInjectedCoordinates(source, platform, Location.Accuracy.Balanced);
}

export function pastedMapLocation(link: string): PropertyMapLocation {
  return { source: 'pasted_link', link: normalizeGoogleMapsLink(link) };
}

export async function openGoogleMaps(
  coordinates: Coordinates,
  opener: LinkOpener = Linking,
): Promise<void> {
  const query = `${coordinates.latitude},${coordinates.longitude}`;
  await openGoogleMapsQuery(query, opener);
}

export async function openGoogleMapsQuery(
  query: string,
  opener: LinkOpener = Linking,
): Promise<void> {
  await openGoogleMapsQueryWithOpener(query, opener, Platform.OS);
}

export async function openPastedLocationLink(
  location: PropertyMapLocation,
  opener: LinkOpener = Linking,
): Promise<void> {
  if (location.source !== 'pasted_link') throw new Error('LOCATION_LINK_MISSING');
  try {
    await openPastedGoogleMapsLink(location.link, opener, Platform.OS);
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_LOCATION_LINK') throw error;
    throw new Error('LOCATION_LINK_UNAVAILABLE');
  }
}