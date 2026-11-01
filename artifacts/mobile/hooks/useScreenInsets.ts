import { Platform, StatusBar, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { screenInsets } from '@/services/screenInsets';

export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return screenInsets(insets, Platform.OS, width, StatusBar.currentHeight ?? 0);
}
