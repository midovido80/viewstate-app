import type { PropertyEditChoices } from './propertyUpdateRecovery';
import type { PropertyEditDraftV1 } from './propertyUpdateRecovery';
import { getPropertyMapsWebHref, normalizeGoogleMapsLink, type MapCoordinates } from './mapsLink';
import { getStudioWebMapsUrl } from './studioWebActions';

export function propertyEditChoicesAreDirty(
  cleanChoices: PropertyEditChoices | null,
  currentChoices: PropertyEditChoices,
): boolean {
  if (!cleanChoices) return false;
  const normalize = (choices: PropertyEditChoices) => {
    const canonicalDetails = Object.fromEntries(
      Object.entries(choices.canonicalDetails ?? {})
        .filter(([, value]) => value.trim() !== ''),
    );
    return JSON.stringify(canonicalize({
      ...choices,
      canonicalDetails,
      mapsLink: choices.mapsLink?.trim() ?? '',
      attachments: choices.attachments?.length ? choices.attachments : undefined,
      newlyCopiedAttachmentUris: undefined,
    }));
  };
  return normalize(cleanChoices) !== normalize(currentChoices);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function getPropertyEditMapsFieldError(link: string, language: 'ar' | 'en'): string {
  if (!link.trim()) return '';
  try {
    const normalized = normalizeGoogleMapsLink(link);
    if (/[?&]https?:\/\//i.test(normalized)) throw new Error('INVALID_LOCATION_LINK');
    return '';
  } catch {
    return language === 'ar'
      ? 'أدخل رابط خرائط Google صالحًا وآمنًا (HTTPS).'
      : 'Enter a valid, secure Google Maps URL (HTTPS).';
  }
}

export function shouldShowPropertyGallery(imageCount: number): boolean {
  return imageCount > 0;
}

export function getPropertyDetailMapsHref(options: {
  readonly link?: string;
  readonly coordinates?: MapCoordinates;
  readonly areaQuery: string;
  readonly standardApartment: boolean;
}): string | null {
  const link = options.link?.trim();
  if (options.link && !link) return null;
  const href = getPropertyMapsWebHref(link || undefined, options.coordinates);
  if (href || link || options.coordinates || !options.standardApartment) return href;
  return getStudioWebMapsUrl('', options.areaQuery);
}

export type PropertyEditDraftCleanExitResult =
  | { readonly status: 'discarded'; readonly ownedUris: readonly string[] }
  | { readonly status: 'conflict'; readonly ownedUris: readonly [] }
  | { readonly status: 'cleanup_failed'; readonly ownedUris: readonly string[] };

export async function discardPropertyEditDraftAndCleanupOwnedAttachments(options: {
  readonly draft: PropertyEditDraftV1;
  readonly transientOwnedUris: readonly string[];
  readonly discardDraft: (draft: PropertyEditDraftV1) => Promise<boolean>;
  readonly deleteAttachment: (uri: string) => Promise<void>;
}): Promise<PropertyEditDraftCleanExitResult> {
  if (!await options.discardDraft(options.draft)) return { status: 'conflict', ownedUris: [] };
  const ownedUris = [...new Set([
    ...(options.draft.choices.newlyCopiedAttachmentUris ?? []),
    ...options.transientOwnedUris,
  ])];
  try {
    for (const uri of ownedUris) await options.deleteAttachment(uri);
  } catch {
    return { status: 'cleanup_failed', ownedUris };
  }
  return { status: 'discarded', ownedUris };
}