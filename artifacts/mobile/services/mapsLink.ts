export interface LinkOpener {
  canOpenURL?(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
}

export interface MapCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

const GOOGLE_MAPS_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
]);

// Supported Kuwait geographic envelope; non-finite and out-of-envelope values fail closed.
const KUWAIT_COORDINATE_BOUNDS = {
  minLatitude: 28.52,
  maxLatitude: 30.1,
  minLongitude: 46.55,
  maxLongitude: 48.43,
} as const;

export function isKuwaitCoordinates(coordinates: MapCoordinates): boolean {
  const { latitude, longitude } = coordinates;
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= KUWAIT_COORDINATE_BOUNDS.minLatitude
    && latitude <= KUWAIT_COORDINATE_BOUNDS.maxLatitude
    && longitude >= KUWAIT_COORDINATE_BOUNDS.minLongitude
    && longitude <= KUWAIT_COORDINATE_BOUNDS.maxLongitude;
}

export function normalizeGoogleMapsLink(link: string): string {
  const normalized = link.trim();
  if (
    normalized.length === 0
    || normalized.length > 2048
    || /[\u0000-\u001f\u007f\s]/.test(normalized)
  ) {
    throw new Error('INVALID_LOCATION_LINK');
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('INVALID_LOCATION_LINK');
  }
  const host = parsed.hostname.toLowerCase();
  const isGoogleMapsPath = (
    (host === 'google.com' || host === 'www.google.com' || host === 'maps.google.com')
    && parsed.pathname.toLowerCase().startsWith('/maps')
  );
  const isShortMapsLink = (
    (host === 'goo.gl' && parsed.pathname.toLowerCase().startsWith('/maps/'))
    || (host === 'maps.app.goo.gl' && parsed.pathname.length > 1)
  );
  if (
    parsed.protocol !== 'https:'
    || !GOOGLE_MAPS_HOSTS.has(host)
    || (!isGoogleMapsPath && !isShortMapsLink)
    || parsed.username
    || parsed.password
  ) {
    throw new Error('INVALID_LOCATION_LINK');
  }
  return normalized;
}

export async function openGoogleMapsQuery(
  query: string,
  opener: LinkOpener,
  platform: string,
): Promise<void> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) throw new Error('GOOGLE_MAPS_QUERY_MISSING');
  const appUrl = `comgooglemaps://?api=1&query=${encodeURIComponent(normalizedQuery)}`;
  const androidUrl = `geo:0,0?q=${encodeURIComponent(normalizedQuery)}`;
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalizedQuery)}`;
  if (platform === 'android') {
    try {
      await opener.openURL(androidUrl);
      return;
    } catch {
      await opener.openURL(webUrl);
      return;
    }
  }
  if (opener.canOpenURL && await opener.canOpenURL(appUrl)) {
    await opener.openURL(appUrl);
  } else {
    await opener.openURL(webUrl);
  }
}

export async function openPastedGoogleMapsLink(
  link: string,
  opener: LinkOpener,
  platform: string,
): Promise<void> {
  const normalized = normalizeGoogleMapsLink(link);
  // Android App Links give Google Maps first refusal and automatically retain
  // the browser as a safe fallback without package-visibility queries.
  if (platform === 'android') {
    await opener.openURL(normalized);
    return;
  }
  const appUrl = `comgooglemaps://?q=${encodeURIComponent(normalized)}`;
  if (opener.canOpenURL && await opener.canOpenURL(appUrl)) {
    await opener.openURL(appUrl);
  } else {
    await opener.openURL(normalized);
  }
}

/**
 * Opens a saved Google Maps link when present, otherwise uses saved coordinates.
 * A supplied but invalid link is an explicit failure; coordinates must not mask it.
 */
export async function openPropertyMapsLocation(
  link: string | undefined,
  coordinates: MapCoordinates | undefined,
  opener: LinkOpener,
  platform: string,
): Promise<void> {
  if (link !== undefined && link.length > 0) {
    const normalized = normalizeGoogleMapsLink(link);
    await openPastedGoogleMapsLink(normalized, opener, platform);
    return;
  }

  if (!coordinates || !isKuwaitCoordinates(coordinates)) {
    throw new Error('INVALID_KUWAIT_COORDINATES');
  }

  const query = `${coordinates.latitude},${coordinates.longitude}`;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  await opener.openURL(url);
}