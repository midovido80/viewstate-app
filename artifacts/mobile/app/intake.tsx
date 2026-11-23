import { useImportAutosave } from "@/hooks/useImportAutosave";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";
import { useUserData } from "@/contexts/UserDataContext";
import { useI18n } from "@/contexts/I18nContext";
import { useDraftBack, useLocalFormDraft } from "@/hooks/useDraftBack";
import { TextInput } from "@/components/FormField";
import { Button } from "@/components/Button";
import { NextPage, NextSurface } from "@/components/next/NextSurfaces";
import { nextDesign as n } from "@/constants/nextDesign";
import { createImportInbox, type ImportEntry } from "@/services/importInbox";
import { generateDomainId } from "@/services/identity";
import { incomingImportNative } from "@/services/incomingImportNative";
import { createWebFileAttachments } from "@/services/attachments";

export default function ImportInbox() {
  const { storage, media } = useUserData(),
    { language, fonts, isRTL } = useI18n(),
    router = useRouter();
  const copy = (ar: string, en: string) => (language === "ar" ? ar : en);
  const inbox = useMemo(() => createImportInbox(storage), [storage]);
  const [text, setText] = useState(""),
    [files, setFiles] = useState<ImportEntry["files"]>([]);
  const [id, setId] = useState(() => generateDomainId());
  const [entries, setEntries] = useState<ImportEntry[]>([]),
    [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const persist = useLocalFormDraft({
    identity: "message-import-compose",
    value: { id, text, files },
    restore: (v) => {
      setId(v.id);
      setText(v.text);
      setFiles(v.files);
    },
  });
  useImportAutosave(JSON.stringify({ id, text, files }), persist, () =>
    setError(
      copy(
        "تعذر حفظ المسودة تلقائيًا؛ أعد المحاولة قبل الخروج.",
        "Could not autosave. Retry before leaving.",
      ),
    ),
  );
  const { back } = useDraftBack({ persist, fallback: "/" });
  const refresh = useCallback(async () => {
    try {
      setEntries(await inbox.read());
      setReady(true);
    } catch {
      setError(
        copy(
          "تعذر قراءة صندوق الاستيراد. لم تُحذف أي بيانات.",
          "Could not read the inbox. No data was deleted.",
        ),
      );
    }
  }, [inbox, language]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return inbox.subscribe(() => {
        void refresh();
      });
    }, [refresh, inbox]),
  );
  const style = {
    minHeight: 48,
    borderWidth: 1,
    borderColor: n.border,
    borderRadius: 10,
    padding: 12,
    color: n.ink,
    backgroundColor: n.white,
    fontFamily: fonts.regular,
    textAlign: isRTL ? ("right" as const) : ("left" as const),
  };
  const addFiles = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "video/mp4",
          "video/quicktime",
          "application/pdf",
        ],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      if (
        picked.assets.length + files.length > 20 ||
        picked.assets.some((f) => (f.size ?? 0) > 50 * 1024 * 1024)
      )
        throw Error("IMPORT_SIZE");
      let next = [...files];
      if (Platform.OS === "web") {
        const browserFiles = picked.assets
          .map((a) => a.file)
          .filter((f): f is File => !!f);
        if (browserFiles.length !== picked.assets.length)
          throw Error("FILE_MISSING");
        next = [
          ...files,
          ...(await createWebFileAttachments(
            `import-${id}`,
            files,
            browserFiles,
            generateDomainId,
            media.createIndexedDbWebAttachmentBlobStore(),
          )),
        ];
      } else {
        const fileStore = media.createExpoFileStore(FileSystem);
        for (const asset of picked.assets) {
          const mimeType = asset.mimeType ?? "";
          if (
            !/^(image\/(jpeg|png|webp)|video\/(mp4|quicktime)|application\/pdf)$/.test(
              mimeType,
            )
          )
            throw Error("UNSUPPORTED");
          const attachmentId = generateDomainId();
          const uri = await fileStore.copyToProperty(
            `import-${id}`,
            attachmentId,
            { uri: asset.uri, name: asset.name, mimeType },
          );
          next.push({
            id: attachmentId,
            uri,
            originalName: asset.name,
            mimeType,
            kind: mimeType.startsWith("image/")
              ? "image"
              : mimeType.startsWith("video/")
                ? "video"
                : "pdf",
            order: next.length,
          });
        }
      }
      // A picked attachment belongs to the composition until Review creates an inbox item.
      await persist.replace({ id, text, files: next });
      setFiles(next);
    } catch {
      setError(
        copy(
          "تعذر إضافة الملفات. الحد ٢٠ ملفًا، و٥٠ ميجابايت للملف. أعد المحاولة.",
          "Could not add files. Limit: 20 files, 50 MB each. Please retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const review = async () => {
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    setError("");
    try {
      await persist();
      const entry: ImportEntry = {
        id,
        text,
        files,
        status: "received",
        createdAt: new Date().toISOString(),
      };
      await inbox.add(entry);
      await inbox.update(entry);
      await persist.replace({ id: generateDomainId(), text: "", files: [] });
      router.push(`/intake-review/${encodeURIComponent(id)}` as never);
    } catch {
      setError(
        copy(
          "تعذر تأكيد الحفظ. الرسالة باقية؛ أعد المحاولة.",
          "Saving could not be confirmed. Your message is retained; retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <NextPage
      title={copy("استيراد رسالة أو إعلان", "Import a message or listing")}
      back={back}
      subtitle={copy(
        "من واتساب أو واتساب بيزنس أو أي تطبيق يتيح المشاركة. نجهز مسودة للمراجعة؛ لا نسجل عقارًا تلقائيًا.",
        "From WhatsApp, WhatsApp Business or another sharing app. Review a draft before creating any record.",
      )}
    >
      <NextSurface title={copy("رسالة جديدة", "New message")}>
        <TextInput
          accessibilityLabel={copy("الرسالة الأصلية", "Original message")}
          multiline
          maxLength={40000}
          editable={!busy}
          value={text}
          onChangeText={setText}
          placeholder={copy(
            "الصق نص العرض أو طلب العميل هنا…",
            "Paste an offer or client request…",
          )}
          style={[style, { minHeight: 150, textAlignVertical: "top" }]}
        />
        <Text
          style={{
            color: n.muted,
            fontFamily: fonts.regular,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {copy(
            "الرسالة الأصلية خاصة ولا تدخل في وصف المشاركة. يعمل الاستيراد والحفظ بدون إنترنت.",
            "Original messages stay private and out of shared descriptions. Import and saving work offline.",
          )}
        </Text>
        {files.map((f) => (
          <Text key={f.id} selectable style={{ color: n.ink }}>
            {f.originalName}
          </Text>
        ))}
        <Button
          variant="outline"
          disabled={busy}
          title={copy("إضافة صور أو فيديو أو PDF", "Add photos, video or PDF")}
          onPress={() => void addFiles()}
        />
        <Button
          loading={busy}
          disabled={busy || !ready || (!text.trim() && !files.length)}
          title={copy("تجهيز ومراجعة البيانات", "Prepare and review")}
          onPress={() => void review()}
        />
      </NextSurface>
      {error ? (
        <Text selectable accessibilityRole="alert" style={{ color: n.red }}>
          {error}
        </Text>
      ) : null}
      <NextSurface title={copy("صندوق الاستيراد", "Import inbox")}>
        {!ready ? (
          <Text>{copy("جارٍ القراءة…", "Loading…")}</Text>
        ) : !entries.length ? (
          <Text>
            {copy("لا توجد رسائل مستوردة بعد.", "No imported messages yet.")}
          </Text>
        ) : (
          entries
            .slice()
            .reverse()
            .map((e) => (
              <View
                key={e.id}
                style={{
                  gap: 8,
                  borderBottomWidth: 1,
                  borderColor: n.border,
                  paddingVertical: 8,
                }}
              >
                <Text
                  numberOfLines={3}
                  style={{
                    color: n.ink,
                    textAlign: isRTL ? "right" : "left",
                    fontFamily: fonts.regular,
                  }}
                >
                  {e.text || copy("مرفقات بدون نص", "Attachments without text")}
                </Text>
                <Button
                  variant="outline"
                  title={
                    e.status === "transferred"
                      ? copy("استكمال النموذج المرتبط", "Resume linked form")
                      : copy("مراجعة", "Review")
                  }
                  onPress={() => router.push(`/intake-review/${e.id}` as never)}
                />
              </View>
            ))
        )}
      </NextSurface>
      <Text style={{ color: n.muted, fontFamily: fonts.regular }}>
        {incomingImportNative
          ? copy(
              "يمكنك اختيار ViewState من قائمة مشاركة Android للمحتوى المدعوم.",
              "Choose ViewState in the Android share menu for supported content.",
            )
          : copy(
              "المشاركة المباشرة وقراءة الصور تحتاج APK الجديد. يمكنك استخدام اللصق وإضافة المرفقات هنا.",
              "Direct receiving and image text recognition require the new Android APK. Pasting and attachments work here.",
            )}
      </Text>
      <Button
        variant="outline"
        title={copy("استيراد جهات اتصال الهاتف", "Import phone contacts")}
        onPress={() => router.push("/person/new?entry=import" as never)}
      />
    </NextPage>
  );
}
