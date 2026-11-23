import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useUserData } from "@/contexts/UserDataContext";
import { useCapture } from "@/contexts/CaptureContext";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import {
  cancelImport,
  pendingImportCancellations,
} from "@/services/importLifecycle";
import { Button } from "./Button";

export function ImportCancellationGate({ children }: { children: ReactNode }) {
  const { storage, store } = useUserData(),
    capture = useCapture(),
    { language, fonts } = useI18n(),
    colors = useColors();
  const [verifiedStorage, setVerifiedStorage] = useState<object | null>(null),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const pending = await pendingImportCancellations(storage);
      if (!pending.length) {
        if (active) setVerifiedStorage(storage);
        return;
      }
      if (!capture.isReady) return;
      for (const importId of pending)
        await cancelImport({
          storage,
          store,
          importId,
          hasPendingSave: (entry) =>
            entry.targetKind === "property" &&
            entry.targetId === capture.getCurrentDraft().propertyCoreId &&
            capture.saveRecoveryStatus !== "none",
          clearDraft: async (entry) => {
            if (
              entry.targetKind === "property" &&
              entry.targetId === capture.getCurrentDraft().propertyCoreId &&
              (!entry.targetPath ||
                JSON.parse(entry.targetPath).pathname !== "/capture/studio")
            ) {
              if (!(await capture.resetDraft()))
                throw Error("IMPORT_DRAFT_CHANGED");
            }
          },
        });
      if (active) setVerifiedStorage(storage);
    })().catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [storage, store, capture.isReady, attempt]);
  if (verifiedStorage === storage) return children;
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        gap: 16,
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.primary} />
      <Text
        style={{
          fontFamily: fonts.regular,
          color: colors.foreground,
          textAlign: "center",
        }}
      >
        {language === "ar"
          ? "جارٍ استكمال إلغاء المسودة…"
          : "Finishing import cancellation…"}
      </Text>
      {failed && (
        <Button
          title={language === "ar" ? "إعادة المحاولة" : "Retry"}
          onPress={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        />
      )}
    </View>
  );
}
