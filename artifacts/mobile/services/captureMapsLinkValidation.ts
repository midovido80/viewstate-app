import { normalizeGoogleMapsLink } from '@/services/mapsLink';

/**
 * Maps links are optional, but any supplied value must be a supported
 * Google Maps URL. Keep the user's value untouched so invalid drafts remain
 * editable rather than being silently discarded.
 */
export function getCaptureMapsLinkValidationError(
  link: string | undefined,
): 'INVALID_LOCATION_LINK' | null {
  if (link === undefined || link === '') return null;
  try {
    normalizeGoogleMapsLink(link);
    return null;
  } catch {
    return 'INVALID_LOCATION_LINK';
  }
}