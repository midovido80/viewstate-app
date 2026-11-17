export interface WhatsAppUrlOpener {
  openURL(url: string): Promise<unknown>;
}

export function buildWhatsAppComposeUrl(query: string): string {
  return `whatsapp://send?${query}`;
}

export async function openWhatsAppComposeWithOpener(
  query: string,
  opener: WhatsAppUrlOpener,
): Promise<void> {
  try {
    // Both Android WhatsApp variants register the generic scheme. Android opens
    // the only handler directly or presents its standard resolver when both
    // are available, without package-visibility checks.
    await opener.openURL(buildWhatsAppComposeUrl(query));
  } catch {
    throw new Error('SHARE_DESTINATION_UNAVAILABLE');
  }
}