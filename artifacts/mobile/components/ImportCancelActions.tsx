import { useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useI18n } from "@/contexts/I18nContext";
import { useUserData } from "@/contexts/UserDataContext";
import { useCapture } from "@/contexts/CaptureContext";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "./Button";
import { cancelImport } from "@/services/importLifecycle";
import { createImportInbox, type ImportEntry } from "@/services/importInbox";

export function ImportCancelActions({
  importId,
  busy = false,
  pending = false,
  saved = false,
  onEdit,
  discard,
  exit,
}: {
  importId?: string;
  busy?: boolean;
  pending?: boolean;
  saved?: boolean;
  onEdit?: () => void;
  discard?: () => Promise<unknown>;
  exit?: (action: () => void) => unknown;
}) {
  const { storage, store } = useUserData(),
    capture = useCapture(),
    router = useRouter(),
    colors = useColors(),
    insets = useSafeAreaInsets();
  const { language, fonts, isRTL } = useI18n(),
    ar = language === "ar";
  const [open, setOpen] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const [savedEntry, setSavedEntry] = useState<ImportEntry | null>(null);
  useEffect(() => {
    if (!importId) return;
    let active = true;
    void createImportInbox(storage)
      .read()
      .then(async (entries) => {
        const entry = entries.find((entry) => entry.id === importId);
        if (
          entry?.targetId &&
          (await (entry.targetKind === "requirement"
            ? store.getRequirement(entry.targetId)
            : store.getProperty(entry.targetId))) &&
          active
        )
          setSavedEntry(entry);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [importId, storage, store, busy, saved]);
  if (!importId || saved) return null;
  if (savedEntry)
    return (
      <Button
        variant="outline"
        title={ar ? "فتح السجل المحفوظ" : "Open saved record"}
        onPress={() =>
          router.push(
            (savedEntry.targetKind === "requirement"
              ? `/requirement/view/${savedEntry.targetId}`
              : `/property/${savedEntry.targetId}`) as never,
          )
        }
      />
    );
  const cancel = async () => {
    if (working || busy || pending) return;
    setWorking(true);
    setError("");
    try {
      await cancelImport({
        storage,
        store,
        importId,
        hasPendingSave: (entry) =>
          pending ||
          (entry.targetKind === "property" &&
            entry.targetId === capture.getCurrentDraft().propertyCoreId &&
            capture.saveRecoveryStatus !== "none"),
        clearDraft: async (entry) => {
          await discard?.();
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
      setOpen(false);
      const navigate = () => router.replace("/intake" as never);
      if (exit) exit(navigate);
      else navigate();
    } catch (cause) {
      const code = (cause as Error).message;
      setError(
        code === "IMPORT_ALREADY_SAVED"
          ? ar
            ? "السجل محفوظ بالفعل. افتح تفاصيله إذا تبي تحذفه."
            : "This record is saved. Open its details to delete it."
          : code === "IMPORT_SAVE_PENDING"
            ? ar
              ? "انتظر اكتمال الحفظ أو استرداده قبل إلغاء الاستيراد."
              : "Finish or recover the pending save before cancelling."
            : ar
              ? "ما اكتمل الإلغاء. حاول مرة ثانية؛ ما أنشأنا أي سجل جديد."
              : "Cancellation did not finish. Retry; no new record was created.",
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <View
      style={{
        direction: "ltr",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: colors.card,
      }}
    >
      {onEdit && (
        <Button
          title={ar ? "تعديل البيانات" : "Edit details"}
          variant="outline"
          disabled={busy || working || pending}
          onPress={onEdit}
          testID="import-edit-data"
        />
      )}
      <Button
        title={ar ? "إلغاء الاستيراد" : "Cancel import"}
        variant="outline"
        disabled={busy || working || pending}
        onPress={() => {
          setError("");
          setOpen(true);
        }}
        testID="import-cancel-open"
      />
      {pending && (
        <Text
          style={{
            fontFamily: fonts.regular,
            color: colors.mutedForeground,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {ar
            ? "فيه عملية حفظ تحتاج استكمال قبل الإلغاء."
            : "Finish the pending save before cancelling."}
        </Text>
      )}
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => !working && setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            padding: 24,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
            justifyContent: "center",
            backgroundColor: "#00000066",
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: colors.cardRadius,
              padding: 24,
              gap: 16,
              direction: "ltr",
            }}
            accessibilityViewIsModal
          >
            <Text
              style={{
                fontFamily: fonts.bold,
                fontSize: 20,
                color: colors.foreground,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {ar ? "إلغاء الاستيراد؟" : "Cancel import?"}
            </Text>
            <Text
              style={{
                fontFamily: fonts.regular,
                color: colors.foreground,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {ar
                ? "بنمسح مسودة هذا الاستيراد. ما راح ينحفظ منها عقار أو طلب، والسجلات المحفوظة تبقى مثل ما هي."
                : "Remove this import draft without creating a property or request. Existing saved records stay unchanged."}
            </Text>
            {!!error && (
              <Text
                accessibilityRole="alert"
                style={{
                  color: colors.destructive,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {error}
              </Text>
            )}
            <Button
              title={ar ? "متابعة التعديل" : "Keep editing"}
              variant="outline"
              disabled={working}
              onPress={() => setOpen(false)}
            />
            <Button
              title={
                ar
                  ? "إلغاء الاستيراد ومسح المسودة"
                  : "Cancel import and remove draft"
              }
              loading={working}
              disabled={working}
              onPress={() => void cancel()}
              testID="import-cancel-confirm"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
