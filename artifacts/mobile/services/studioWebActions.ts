import { normalizeGoogleMapsLink } from '@/services/mapsLink';

export type StudioWebOpenWindow = (
  url: string,
  target?: string,
  features?: string,
) => unknown;

export function getStudioWebMapsUrl(link: string, query: string): string {
  const suppliedLink = link.trim();
  if (suppliedLink) return normalizeGoogleMapsLink(suppliedLink);
  const safeQuery = query.trim();
  if (!safeQuery) throw new Error('GOOGLE_MAPS_QUERY_MISSING');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeQuery)}`;
}

/** Call synchronously from the Maps button's web click to preserve user activation. */
export function openStudioWebMapsLocation(
  options: { readonly link: string; readonly query: string },
  openWindow: StudioWebOpenWindow = window.open.bind(window),
): void {
  openWindow(
    getStudioWebMapsUrl(options.link, options.query),
    '_blank',
    'noopener,noreferrer',
  );
}

/**
 * Opens a connected native file input synchronously from the invoking click.
 * Keeping it in the DOM avoids browsers that ignore clicks on detached inputs.
 */
export function openStudioWebFilePicker(
  options: {
    readonly accept: string;
    readonly onFiles: (files: readonly File[]) => void;
  },
  documentObject: Document = document,
): void {
  const input = documentObject.createElement('input');
  input.type = 'file';
  input.accept = options.accept;
  input.multiple = true;
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.position = 'fixed';
  input.style.left = '-10000px';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    input.remove();
  };
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    cleanup();
    if (files.length) options.onFiles(files);
  }, { once: true });
  input.addEventListener('cancel', cleanup, { once: true });
  documentObject.body.appendChild(input);
  try {
    input.click();
  } catch (error) {
    cleanup();
    throw error;
  }
}