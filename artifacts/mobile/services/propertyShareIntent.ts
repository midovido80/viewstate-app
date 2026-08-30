import { Linking, Platform } from 'react-native';

export type AndroidPropertyShareDestination = 'whatsapp' | 'whatsapp_business';

const destinationSchemes: Record<AndroidPropertyShareDestination, string> = {
  whatsapp: 'whatsapp',
  whatsapp_business: 'whatsapp-business',
};

/**
 * Opens the selected Android app's compose UI with the already-reviewed text.
 * This never invokes a send action. Selected files must use the system share
 * path because React Native cannot safely target either package with files.
 */
export async function openAndroidPropertyShareCompose(
  destination: AndroidPropertyShareDestination,
  exactPreviewText: string,
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('ANDROID_SHARE_DESTINATION_UNSUPPORTED');
  }
  const url = `${destinationSchemes[destination]}://send?text=${encodeURIComponent(exactPreviewText)}`;
  try {
    if (!await Linking.canOpenURL(url)) {
      throw new Error('SHARE_DESTINATION_UNAVAILABLE');
    }
    await Linking.openURL(url);
  } catch {
    throw new Error('SHARE_DESTINATION_UNAVAILABLE');
  }
}