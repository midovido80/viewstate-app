import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
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
  if (!count && !error) return null;
  return (
    <View style={{ backgroundColor: n.soft, padding: 10, gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          error
            ? void read()
                .then(() => setError(false))
                .then(receive)
                .catch(() => setError(true))
            : router.push("/intake" as never)
        }
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text
          style={{
            color: n.navy,
            textAlign: language === "ar" ? "right" : "left",
            fontFamily: fonts.medium,
          }}
        >
          {error
            ? language === "ar"
              ? "تعذر استقبال المشاركة — اضغط لإعادة المحاولة"
              : "Could not receive share — tap to retry"
            : language === "ar"
              ? `${count} عناصر استيراد بانتظار المراجعة`
              : `${count} imports to review`}
        </Text>
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
