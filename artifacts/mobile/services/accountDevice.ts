import { Linking, Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

export type DevicePermission = 'granted' | 'denied' | 'undetermined' | 'limited' | 'unavailable';
export interface AccountPermissions { contacts: DevicePermission; location: DevicePermission; photos: DevicePermission }
/** Read-only OS status; never calls any requestPermissions method. */
export async function readAccountPermissions(): Promise<AccountPermissions> {
  if (Platform.OS === 'web') {
    let location: DevicePermission = 'unavailable';
    try {
      if (typeof navigator !== 'undefined' && navigator.permissions) {
        const value = await navigator.permissions.query({ name: 'geolocation' });
        location = value.state === 'prompt' ? 'undetermined' : value.state;
      }
    } catch { /* Browser does not expose a permission status. */ }
    return { contacts: 'unavailable', photos: 'unavailable', location };
  }
  const safe = async (read: () => Promise<{ status: string; accessPrivileges?: string }>): Promise<DevicePermission> => {
    try {
      const value = await read();
      if (value.accessPrivileges === 'limited') return 'limited';
      return ['granted', 'denied', 'undetermined'].includes(value.status) ? value.status as DevicePermission : 'unavailable';
    } catch { return 'unavailable'; }
  };
  const [contacts, location, photos] = await Promise.all([
    safe(Contacts.getPermissionsAsync), safe(Location.getForegroundPermissionsAsync),
    safe(() => ImagePicker.getMediaLibraryPermissionsAsync()),
  ]);
  return { contacts, location, photos };
}
export async function openAccountDeviceSettings(): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Use your browser site settings; system settings are unavailable here.');
  await Linking.openSettings();
}
/** Only invoked after the user explicitly chooses a profile photo. */
export async function chooseLocalProfilePhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.base64 || asset.base64.length > 950000) throw new Error('Choose a JPG, PNG or WebP image under 700 KB.');
  const mime = asset.mimeType ?? 'image/jpeg';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Choose JPG, PNG or WebP.');
  return `data:${mime};base64,${asset.base64}`;
}
