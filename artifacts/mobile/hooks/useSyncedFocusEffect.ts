import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useUserData } from "@/contexts/UserDataContext";
/** Reload visible read models after a remote merge without remounting the route or its editor drafts. */
export function useSyncedFocusEffect(effect: () => void | (() => void)) {
  const { subscribeSync } = useUserData();
  useFocusEffect(
    useCallback(() => {
      let cleanup = effect();
      const unsubscribe = subscribeSync(() => {
        cleanup?.();
        cleanup = effect();
      });
      return () => {
        unsubscribe();
        cleanup?.();
      };
    }, [effect, subscribeSync]),
  );
}
