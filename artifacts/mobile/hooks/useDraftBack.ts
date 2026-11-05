import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, Platform } from "react-native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import {
  usePreventRemove,
  useIsFocused,
  type NavigationAction,
} from "@react-navigation/native";
import { useUserData } from "@/contexts/UserDataContext";
import { useI18n } from "@/contexts/I18nContext";
import { createFormSession } from "@/services/formSession";

export function useLocalFormDraft<T extends object>({
  identity,
  value,
  restore,
  ready = true,
  complete = false,
  completed,
  onPersist,
}: {
  identity: string;
  value: T;
  restore: (value: T) => void;
  ready?: boolean;
  complete?: boolean;
  completed?: () => boolean;
  onPersist?: () => void;
}) {
  const { storage } = useUserData();
  const repo = useMemo(
    () => createFormSession(storage, identity),
    [storage, identity],
  );
  const current = useRef({
    value,
    restore,
    complete,
    completed,
    ready,
    onPersist,
  });
  current.current = { value, restore, complete, completed, ready, onPersist };
  const unreadable = useRef(false),
    discarded = useRef(false);
  const hydration = useRef<Promise<void>>(Promise.resolve());
  const { language } = useI18n();
  useEffect(() => {
    if (!ready || complete) return;
    let active = true;
    unreadable.current = false;
    discarded.current = false;
    const initial = current.current.value;
    const before = JSON.stringify(initial);
    hydration.current = repo
      .read<T>()
      .then((saved) => {
        if (
          saved &&
          Object.entries(initial).some(
            ([key, value]) =>
              value !== undefined &&
              (!(key in saved) ||
                (value !== null &&
                  (Array.isArray(value)
                    ? !Array.isArray((saved as Record<string, unknown>)[key])
                    : typeof value !==
                      typeof (saved as Record<string, unknown>)[key]))),
          )
        )
          throw Error("FORM_SESSION_UNREADABLE");
        if (
          active &&
          saved &&
          !current.current.complete &&
          !current.current.completed?.() &&
          JSON.stringify(current.current.value) === before
        ) {
          current.current.value = saved;
          current.current.restore(saved);
        }
      })
      .catch(() => {
        if (active) unreadable.current = true;
      });
    return () => {
      active = false;
    };
  }, [repo, ready]);
  useEffect(() => {
    if (complete) void repo.clear().catch(() => {});
  }, [repo, complete]);
  const persist = useCallback(async () => {
    if (current.current.ready) await hydration.current;
    const now = current.current;
    if (discarded.current || now.complete || now.completed?.()) {
      await repo.clear();
      return true;
    }
    if (!now.ready) return true;
    if (unreadable.current) throw Error("FORM_SESSION_UNREADABLE");
    await repo.write(now.value);
    now.onPersist?.();
    return true;
  }, [repo]);
  const discard = async () => {
    await repo.clear();
    discarded.current = true;
  };
  return Object.assign(persist, {
    discard,
    confirmDiscard: (exit: () => void) =>
      Alert.alert(
        language === "ar" ? "إلغاء المسودة؟" : "Discard draft?",
        language === "ar"
          ? "سيتم حذف المدخلات غير المحفوظة لهذه الرحلة فقط."
          : "Only the unsaved entries for this form will be removed.",
        [
          {
            text: language === "ar" ? "متابعة التعديل" : "Keep editing",
            style: "cancel",
          },
          {
            text: language === "ar" ? "إلغاء المسودة" : "Discard draft",
            style: "destructive",
            onPress: () => {
              void discard()
                .then(exit)
                .catch(() =>
                  Alert.alert(
                    language === "ar"
                      ? "تعذر إلغاء المسودة"
                      : "Could not discard draft",
                  ),
                );
            },
          },
        ],
      ),
  });
}

/** Same decision for header, footer, Android Back and native-stack gestures. */
export function useDraftBack({
  persist,
  step,
  fallback = "/",
  enabled = true,
  completed,
  localExit,
}: {
  persist: () => Promise<boolean | void>;
  step?: () => boolean;
  fallback?:
    string | { pathname: string; params?: Record<string, string | undefined> };
  enabled?: boolean;
  completed?: () => boolean;
  localExit?: () => void;
}) {
  const navigation = useNavigation(),
    router = useRouter();
  const focused = useIsFocused();
  const active = useRef(focused);
  active.current = focused;
  const { language } = useI18n();
  const latest = useRef({
    persist,
    step,
    fallback,
    enabled,
    completed,
    localExit,
    language,
  });
  latest.current = {
    persist,
    step,
    fallback,
    enabled,
    completed,
    localExit,
    language,
  };
  const [permitted, setPermitted] = useState(false);
  const pending = useRef<NavigationAction | (() => void) | null>(null);
  const flight = useRef(false);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setPermitted(false);
      return () => {
        active.current = false;
      };
    }, []),
  );
  useEffect(() => {
    if (!permitted || !pending.current) return;
    const action = pending.current;
    pending.current = null;
    if (typeof action === "function") action();
    else navigation.dispatch(action);
  }, [permitted, navigation]);
  const leave = useCallback(
    async (action?: NavigationAction | (() => void), skipStep = false) => {
      if (flight.current || pending.current) return;
      const current = latest.current;
      if (!skipStep && !current.completed?.() && current.step?.()) return;
      flight.current = true;
      try {
        if ((await current.persist()) === false)
          throw Error("FORM_SESSION_SAVE_FAILED");
        if (!active.current) return;
        const backAction =
          !action ||
          (typeof action !== "function" &&
            (action.type === "GO_BACK" || action.type === "POP"));
        pending.current =
          backAction && current.localExit
            ? current.localExit
            : (action ??
              (() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace(current.fallback as never)));
        setPermitted(true);
      } catch {
        Alert.alert(
          current.language === "ar"
            ? "لم تُحفظ المسودة"
            : "Draft was not saved",
          current.language === "ar"
            ? "تعديلاتك ما زالت هنا. أعد المحاولة قبل الخروج."
            : "Your entries are still here. Retry before leaving.",
        );
      } finally {
        flight.current = false;
      }
    },
    [router],
  );
  useEffect(() => {
    if (enabled) setPermitted(false);
  }, [enabled]);
  usePreventRemove(enabled && focused && !permitted, ({ data }) => {
    void leave(data.action);
  });
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android" || !enabled) return;
      const listener = BackHandler.addEventListener("hardwareBackPress", () => {
        void leave();
        return true;
      });
      return () => listener.remove();
    }, [leave, enabled]),
  );
  return {
    back: () => {
      void leave();
    },
    exit: (go: () => void) => {
      void leave(go, true);
    },
  };
}
