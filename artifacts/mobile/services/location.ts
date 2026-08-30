import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import {
  requestInjectedCoordinates,
  type Coordinates,
} from './coordinateRequest';

export type { Coordinates } from './coordinateRequest';
export { requestInjectedCoordinates } from './coordinateRequest';

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

export interface LinkOpener {
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
}

export async function requestCurrentCoordinates(
  source: LocationSource = Location,
  platform: string = Platform.OS,
): Promise<Coordinates> {
  return requestInjectedCoordinates(source, platform, Location.Accuracy.Balanced);
}

export function pastedMapLocation(link: string): PropertyMapLocation {
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    throw new Error('INVALID_LOCATION_LINK');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('INVALID_LOCATION_LINK');
  }
  return { source: 'pasted_link', link };
}

export async function openGoogleMaps(
  coordinates: Coordinates,
  opener: LinkOpener = Linking,
): Promise<void> {
  const query = `${coordinates.latitude},${coordinates.longitude}`;
  const appUrl = `comgooglemaps://?api=1&query=${encodeURIComponent(query)}`;
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  if (await opener.canOpenURL(appUrl)) {
    await opener.openURL(appUrl);
    return;
  }
  if (!(await opener.canOpenURL(webUrl))) throw new Error('GOOGLE_MAPS_UNAVAILABLE');
  await opener.openURL(webUrl);
}

export async function openPastedLocationLink(
  location: PropertyMapLocation,
  opener: LinkOpener = Linking,
): Promise<void> {
  if (location.source !== 'pasted_link') throw new Error('LOCATION_LINK_MISSING');
  const appUrl = `comgooglemaps://?q=${encodeURIComponent(location.link)}`;
  if (await opener.canOpenURL(appUrl)) {
    await opener.openURL(appUrl);
    return;
  }
  if (!(await opener.canOpenURL(location.link))) throw new Error('LOCATION_LINK_UNAVAILABLE');
  await opener.openURL(location.link);
}