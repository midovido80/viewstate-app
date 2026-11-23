import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  circleInviteToken,
  PENDING_CIRCLE_INVITE,
} from '@/services/circleInvitations';
export function CircleInviteLinkCapture() {
  useEffect(() => {
    const capture = (url: string | null) => {
      const token = url && circleInviteToken(url);
      if (token)
        void AsyncStorage.setItem(PENDING_CIRCLE_INVITE, token).catch(
          () => undefined,
        );
    };
    void Linking.getInitialURL()
      .then(capture)
      .catch(() => undefined);
    const subscription = Linking.addEventListener('url', (event) =>
      capture(event.url),
    );
    return () => subscription.remove();
  }, []);
  return null;
}
