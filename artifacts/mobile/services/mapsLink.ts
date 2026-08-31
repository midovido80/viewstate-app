export interface LinkOpener {
  canOpenURL?(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
}

const GOOGLE_MAPS_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'goo.gl',
  'maps.app.goo.gl',
]);

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