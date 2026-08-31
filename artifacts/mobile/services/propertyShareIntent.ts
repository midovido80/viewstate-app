import { Linking, Platform } from 'react-native';
import { openWhatsAppComposeWithOpener } from './whatsappCompose';

async function openWhatsAppCompose(
  query: string,
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('ANDROID_SHARE_DESTINATION_UNSUPPORTED');
  }
  await openWhatsAppComposeWithOpener(query, Linking);
}

/**
 * Opens an available Android WhatsApp variant's compose UI with the already-reviewed text.
 * This never invokes a send action. Selected files must use the system share
 * path because React Native cannot safely target either package with files.
 */
export async function openAndroidPropertyShareCompose(
  exactPreviewText: string,
): Promise<void> {
  await openWhatsAppCompose(`text=${encodeURIComponent(exactPreviewText)}`);
}

/**
 * Opens an available Android WhatsApp variant to the named contact without sending.
 * The user must still review and press Send inside the destination app.
 */
export async function openAndroidWhatsAppContactCompose(
  normalizedPhone: string,
): Promise<void> {
  const phone = normalizedPhone.replace(/\D/g, '');
  if (!phone) throw new Error('SHARE_DESTINATION_UNAVAILABLE');
  await openWhatsAppCompose(`phone=${encodeURIComponent(phone)}`);
}