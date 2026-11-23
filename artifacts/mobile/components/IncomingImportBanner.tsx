import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { AppState, Pressable, Text, View } from "react-native";
import * as FileSystem from "expo-file-system";
import { usePathname, useRouter } from "expo-router";
import { isRequirementEditorPath, isCircleWorkspacePath } from "@/services/screenInsets";
import { isNotificationScreen } from "@/services/notificationFeed";
import { useUserData } from "@/contexts/UserDataContext";
import { useI18n } from "@/contexts/I18nContext";
import {
  createImportInbox,
  parseNativeDelivery,
  type ImportEntry,
} from "@/services/importInbox";
import { incomingImportNative } from "@/services/incomingImportNative";
import { nextDesign as n } from "@/constants/nextDesign";

/** Mounted only inside the active account gate. No automatic navigation over an open form. */
export function IncomingImportBanner() {
  const { storage, media } = useUserData(),
    router = useRouter(),
    { language, fonts } = useI18n();
  const pathname = usePathname();
  const inbox = useMemo(() => createImportInbox(storage), [storage]);
  const [count, setCount] = useState(0),
    [error, setError] = useState(false);
  const drain = useRef(false);
  const [canDismiss, setCanDismiss] = useState(false);
  const running = useRef(false),
    active = useRef(true);
  const read = useCallback(async () => {
    const entries = await inbox.read();
    if (active.current)
      setCount(
        entries.filter(
          (e) =>
            e.status !== "transferred" && !e.splitIds?.length && !e.mergedInto,
        ).length,
      );
  }, [inbox]);
  const receive = useCallback(
    async function receivePending(): Promise<void> {
      if (!incomingImportNative) return;
      if (running.current) {
        drain.current = true;
        return;
      }
      let nativeRead = false;
      running.current = true;
      try {
        const deliveries = await incomingImportNative.pending(
          media.access?.cacheDirectory ?? "legacy",
        );
        nativeRead = true;
        for (const raw of deliveries) {
          if (!active.current) return;
          const delivery = parseNativeDelivery(JSON.parse(raw));
          if(await inbox.isCancelled(delivery.id)){await incomingImportNative.acknowledge(delivery.id);continue;}
          const existing = (await inbox.read()).find(
            (e) => e.id === delivery.id,
          );
          if (!existing) {
            const files: ImportEntry["files"] = [];
            const fileStore = media.createExpoFileStore(FileSystem);
            try {
              for (const [index, source] of delivery.files.entries()) {
                const id = `${delivery.id}-${index}`;
                const uri = await fileStore.copyToProperty(
                  `import-${delivery.id}`,
                  id,
                  source,
                );
                files.push({
                  id,
                  uri,
                  originalName: source.name,
                  mimeType: source.mimeType,
                  kind: source.mimeType.startsWith("image/")
                    ? "image"
                    : source.mimeType.startsWith("video/")
                      ? "video"
                      : "pdf",
                  order: index,
                });
              }
              await inbox.add({
                id: delivery.id,
                text: delivery.text,
                files,
                createdAt: new Date().toISOString(),
                status: "received",
              });
            } catch (e) {
              // Only delete unowned copies when the durable inbox did not retain them.
              const retained = await inbox
                .read()
                .then((v) => v.some((e) => e.id === delivery.id))
                .catch(() => true);
              if (!retained)
                for (const file of files)
                  await fileStore.delete(file.uri).catch(() => {});
              throw e;
            }
          }
          await incomingImportNative.acknowledge(delivery.id);
        }
        if (active.current) {
          setError(false);
          setCanDismiss(false);
        }
        await read();
      } catch {
        if (active.current) {
          setError(true);
          setCanDismiss(!nativeRead);
        }
      } finally {
        running.current = false;
        if (drain.current && active.current) {
          drain.current = false;
          void receivePending();
        }
      }
    },
    [inbox, media, read],
  );
  useEffect(() => {
    active.current = true;
    void read().catch(() => setError(true));
    void receive();
    const unsubscribe = inbox.subscribe(() => {
      void read().catch(() => setError(true));
    });
    const share = incomingImportNative?.addListener("incomingShare", () => {
      void receive();
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void receive();
    });
    return () => {
      active.current = false;
      unsubscribe();
      share?.remove();
      app.remove();
    };
  }, [inbox, read, receive]);
  if (isNotificationScreen(pathname) || isRequirementEditorPath(pathname) || isCircleWorkspacePath(pathname) || pathname === '/intake' || pathname.startsWith('/intake-review/') || (!count && !error)) return null;
  return (
    <View style={{ backgroundColor: n.soft, paddingHorizontal: 14, gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        testID="incoming-import-review"
        onPress={() =>
          error
            ? void read()
                .then(() => setError(false))
                .then(receive)
                .catch(() => setError(true))
            : router.push("/intake" as never)
        }
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, direction: language === "ar" ? "rtl" : "ltr" }}
      >
        <Feather name={error ? "alert-circle" : "inbox"} size={18} color={n.navy} />
        <Text
          style={{
            color: n.navy,
            textAlign: language === "ar" ? "right" : "left",
            fontFamily: fonts.medium,
            flex: 1,
          }}
        >
          {error
            ? language === "ar"
              ? "تعذر استقبال المشاركة — اضغط لإعادة المحاولة"
              : "Could not receive share — tap to retry"
            : language === "ar"
              ? `راجع الوارد (${count})`
              : `${count} imports to review`}
        </Text>
        <Feather name={language === "ar" ? "chevron-left" : "chevron-right"} size={16} color={n.navy} />
      </Pressable>
      {error && canDismiss && incomingImportNative ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void incomingImportNative
              ?.dismissCurrent()
              .then(() => setError(false));
          }}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={{ color: n.red }}>
            {language === "ar"
              ? "تجاهل المشاركة التي تعذر استقبالها"
              : "Dismiss failed incoming share"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
