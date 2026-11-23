import { useAppChrome } from '@/components/AppChrome';
import { Platform, StatusBar, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { screenInsets } from '@/services/screenInsets';

export function useScreenInsets() {
  const chrome = useAppChrome();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const result=screenInsets(insets, Platform.OS, width, StatusBar.currentHeight ?? 0);
  return chrome ? {...result, top:0} : result;
}
