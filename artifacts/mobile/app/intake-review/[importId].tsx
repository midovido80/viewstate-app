import { KuwaitAreaSelector } from "@/components/KuwaitAreaSelector";
import { useImportAutosave } from "@/hooks/useImportAutosave";
import * as FileSystem from "expo-file-system";
import { createWebFileAttachments } from "@/services/attachments";
import * as Sharing from "expo-sharing";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Text, View, Platform } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useUserData } from "@/contexts/UserDataContext";
import { useCapture } from "@/contexts/CaptureContext";
import { useI18n } from "@/contexts/I18nContext";
import { useDraftBack, useLocalFormDraft } from "@/hooks/useDraftBack";
import {
  NextPage,
  NextSurface,
  NextFieldPair,
} from "@/components/next/NextSurfaces";
import { TextInput } from "@/components/FormField";
import { Button } from "@/components/Button";
import { CompactDropdown } from "@/components/FormChoices";
import { nextDesign as n } from "@/constants/nextDesign";
import {
  createImportInbox,
  importTarget,
  type ImportEntry,
} from "@/services/importInbox";
import {
  analyzeImportMessage,
  suggestMessageParts,
  importWarningCopy,
  possibleSavedImportDuplicates,
  normalizeImportText,
  type ImportFacts,
} from "@/services/messageImport";
import { offeredImportSeed } from "@/services/importHandoff";
import { prepareImportedForm } from "@/services/importFormSessions";
import { canBeginMessageCapture } from "@/services/nextFormPresentation";
import { getPropertyFormRoute } from "@/services/propertyFormRoutes";
import {
  canonicalPropertyTypeChoice,
  getPropertyTypeChoices,
  getPropertyTypeChoiceLabel,
  type PropertyTypeChoice,
} from "@/services/propertySectorSelection";
import { incomingImportNative } from "@/services/incomingImportNative";
import { KUWAIT_AREAS } from "@/constants/kuwait-areas";
import { generateDomainId } from "@/services/identity";
import type { Person } from "@/services/people";

export default function ImportReviewRoute() {
  const { importId } = useLocalSearchParams<{ importId: string }>(),
    { storage } = useUserData();
  const inbox = useMemo(() => createImportInbox(storage), [storage]);
  const [entry, setEntry] = useState<ImportEntry | null>(null),
    [failed, setFailed] = useState(false);
  const { language } = useI18n();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void inbox
        .read()
        .then((entries) => {
          if (active) {
            setEntry(entries.find((e) => e.id === importId) ?? null);
            setFailed(!entries.some((e) => e.id === importId));
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
      return () => {
        active = false;
      };
    }, [inbox, importId]),
  );
  if (!entry)
    return (
      <NextPage
        title={language === "ar" ? "مراجعة الاستيراد" : "Review import"}
      >
        <Text>
          {failed
            ? language === "ar"
              ? "تعذر قراءة الرسالة. ارجع لصندوق الاستيراد وأعد المحاولة."
              : "Could not read this import. Return to the inbox and retry."
            : language === "ar"
              ? "جارٍ القراءة…"
              : "Loading…"}
        </Text>
      </NextPage>
    );
  return <ImportReview key={entry.id} initial={entry} />;
}
function ImportReview({ initial }: { initial: ImportEntry }) {
  const { storage, store, media } = useUserData(),
    capture = useCapture(),
    router = useRouter();
  const { language, isRTL, fonts, t } = useI18n(),
    ar = language === "ar";
  const copy = (a: string, e: string) => (ar ? a : e);
  const inbox = useMemo(() => createImportInbox(storage), [storage]);
  const [entry, setEntry] = useState(initial);
  useEffect(() => setEntry(initial), [initial]);
  const [facts, setFacts] = useState<ImportFacts>(
    () =>
      initial.facts ??
      analyzeImportMessage(
        [initial.text, initial.ocrText].filter(Boolean).join("\n\n"),
      ),
  );
  const [text, setText] = useState(initial.text),
    [seekerId, setSeekerId] = useState("");
  const [sourceRole, setSourceRole] = useState(""),
    [sourcePersonId, setSourcePersonId] = useState("");
  const [people, setPeople] = useState<Person[]>([]),
    [peopleQuery, setPeopleQuery] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false),
    [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [duplicates, setDuplicates] = useState<ImportEntry[]>([]),
    [mergeId, setMergeId] = useState("");
  const [candidates, setCandidates] = useState<ImportEntry[]>([]);
  const [savedDuplicates, setSavedDuplicates] = useState<
    { id: string; path: string }[]
  >([]);
  useEffect(() => {
    let live = true;
    void Promise.all([store.getProperties(), store.getRequirements()])
      .then(([p, r]) => {
        if (live)
          setSavedDuplicates(possibleSavedImportDuplicates(facts, p, r));
      })
      .catch(() => {
        if (live)
          setError(
            copy(
              "تعذر فحص التكرار؛ أعد المحاولة.",
              "Could not check duplicates; retry.",
            ),
          );
      });
    return () => {
      live = false;
    };
  }, [store, facts]);
  const active = useRef(true),
    flight = useRef(false);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void Promise.all([store.getPeople(), inbox.read()])
        .then(([p, list]) => {
          if (!active.current) return;
          setPeople(p);
          setCandidates(
            list.filter(
              (e) =>
                e.id !== entry.id &&
                e.status !== "transferred" &&
                !e.splitIds?.length &&
                !e.mergedInto,
            ),
          );
          void inbox.duplicates({ ...entry, text }).then((d) => {
            if (active.current) setDuplicates(d);
          });
        })
        .catch(() => {
          if (active.current)
            setError(
              copy(
                "تعذر قراءة بيانات المراجعة. أعد فتح الرسالة.",
                "Could not load review data. Reopen this import.",
              ),
            );
        });
      return () => {
        active.current = false;
      };
    }, [inbox, store, entry.id, text]),
  );
  const persist = useLocalFormDraft({
    identity: `import-review:${entry.id}`,
    value: {
      facts,
      text,
      seekerId,
      sourceRole,
      sourcePersonId,
      confirmed,
      duplicateConfirmed,
    },
    restore: (v) => {
      setFacts(v.facts);
      setText(v.text);
      setSeekerId(v.seekerId);
      setSourceRole(v.sourceRole);
      setSourcePersonId(v.sourcePersonId);
      setConfirmed(v.confirmed);
      setDuplicateConfirmed(v.duplicateConfirmed);
    },
  });
  useImportAutosave(
    JSON.stringify({
      facts,
      text,
      seekerId,
      sourceRole,
      sourcePersonId,
      confirmed,
      duplicateConfirmed,
    }),
    persist,
    () =>
      setError(
        copy(
          "تعذر حفظ المراجعة تلقائيًا؛ أعد المحاولة.",
          "Could not autosave review; retry.",
        ),
      ),
  );
  const { back } = useDraftBack({ persist, fallback: "/intake" });
  const style = {
    minHeight: 48,
    borderWidth: 1,
    borderColor: n.border,
    borderRadius: 10,
    padding: 12,
    color: n.ink,
    backgroundColor: n.white,
    textAlign: isRTL ? ("right" as const) : ("left" as const),
    fontFamily: fonts.regular,
  };
  const labelStyle = {
    color: n.ink,
    fontFamily: fonts.medium,
    textAlign: isRTL ? ("right" as const) : ("left" as const),
  };
  const update = (changes: Partial<ImportFacts>) => {
    setFacts((f) => ({ ...f, ...changes }));
    setConfirmed(false);
  };
  const dropdown = (
    label: string,
    options: { value: string; label: string }[],
    value: string,
    change: (v: string) => void,
  ) => (
    <CompactDropdown
      label={label}
      options={options.map((o) => ({ ...o, selected: value === o.value }))}
      onSelect={(v) => {
        if (!busy) change(v);
      }}
    />
  );
  const saveReview = async () => {
    const updated: ImportEntry = {
      ...entry,
      text,
      facts,
      duplicateConfirmed,
      status: entry.status === "transferred" ? "transferred" : "reviewed",
    };
    await persist();
    await inbox.update(updated);
    if (active.current) setEntry(updated);
    return updated;
  };
  const run = async (work: () => Promise<void>) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error && e.message === "IMPORT_EXISTING_CAPTURE"
            ? copy(
                "لديك مسودة عقار بالفعل. أكملها أولًا؛ رسالة الاستيراد محفوظة ولن تستبدلها.",
                "A property draft already exists. Complete it first; your import is safely retained.",
              )
            : copy(
                "تعذر إكمال العملية. الرسالة باقية؛ أعد المحاولة من هذه الصفحة.",
                "Could not finish. Your import is retained; retry from this screen.",
              ),
        );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  const copyFiles = async (recordId: string, sources: ImportEntry["files"]) => {
    const files: ImportEntry["files"] = [];
    for (const file of sources) {
      if (!active.current) throw Error("IMPORT_LEFT");
      if (Platform.OS === "web") {
        const blobs = media.createIndexedDbWebAttachmentBlobStore(),
          blob = await blobs.get(file.uri);
        if (!blob) throw Error("IMPORT_FILE_MISSING");
        const copies = await createWebFileAttachments(
          recordId,
          files,
          [
            {
              name: file.originalName,
              type: file.mimeType,
              size: blob.size,
              arrayBuffer: () => blob.arrayBuffer(),
            },
          ],
          generateDomainId,
          blobs,
        );
        files.push(...copies);
      } else {
        const id = generateDomainId(),
          uri = await media
            .createExpoFileStore(FileSystem)
            .copyToProperty(recordId, id, {
              uri: file.uri,
              name: file.originalName,
              mimeType: file.mimeType,
            });
        files.push({ ...file, id, uri, order: files.length });
      }
    }
    return files;
  };

  const continueForm = () =>
    run(async () => {
      if (
        !confirmed ||
        !facts.choice ||
        !facts.transaction ||
        !facts.intent ||
        (facts.transaction === "rent" && !facts.period)
      )
        throw Error("IMPORT_CONFIRM");
      if (
        facts.intent === "wanted" &&
        !(await store.getPeople()).some(
          (p) => p.id === seekerId && p.classifications.includes("seeker"),
        )
      )
        throw Error("IMPORT_PERSON_REQUIRED");
      const latestDuplicates = await inbox.duplicates({ ...entry, text });
      const saved = possibleSavedImportDuplicates(
        facts,
        await store.getProperties(),
        await store.getRequirements(),
      );
      if ((latestDuplicates.length || saved.length) && !duplicateConfirmed)
        throw Error("IMPORT_DUPLICATE");
      if (
        facts.intent === "offered" &&
        (!sourceRole ||
          (sourceRole !== "unknown" &&
            !(await store.getPeople()).some(
              (p) =>
                p.id === sourcePersonId &&
                p.classifications.includes(sourceRole as never),
            )))
      )
        throw Error("IMPORT_SOURCE_REQUIRED");
      const updated = await saveReview();
      let target: {
        pathname: string;
        params: Record<string, string>;
        targetId?: string;
      };
      let staged = updated;
      if (facts.intent === "wanted" || facts.choice === "studio") {
        target = await prepareImportedForm(
          storage,
          updated,
          facts,
          seekerId || undefined,
          generateDomainId,
          sourceRole !== "unknown"
            ? { personId: sourcePersonId, role: sourceRole }
            : undefined,
          copyFiles,
        );
      } else {
        if (
          !capture.isReady ||
          capture.draftLoadFailed ||
          !canBeginMessageCapture(
            capture.getCurrentDraft(),
            capture.getCurrentCaptureDetails(),
          )
        )
          throw Error("IMPORT_EXISTING_CAPTURE");
        const coreId = capture.getCurrentDraft().propertyCoreId!;
        const selected = canonicalPropertyTypeChoice(
          facts.choice as PropertyTypeChoice,
        );
        const route = getPropertyFormRoute({
          mode: "offered",
          transaction: facts.transaction,
          ...selected,
          ...(sourceRole !== "unknown"
            ? { linkPersonId: sourcePersonId, sourceRole }
            : {}),
          apartmentSubtype:
            selected.propertyType === "apartment"
              ? (selected.apartmentSubtype ?? "standard_apartment")
              : undefined,
        });
        target = {
          pathname: route.pathname,
          params: { ...route.params },
          targetId: coreId,
        };
        const files = await copyFiles(coreId, updated.files);
        if (
          !active.current ||
          !canBeginMessageCapture(
            capture.getCurrentDraft(),
            capture.getCurrentCaptureDetails(),
          )
        )
          throw Error("IMPORT_EXISTING_CAPTURE");
        staged = {
          ...updated,
          targetId: coreId,
          targetKind: "property",
          targetPath: JSON.stringify(target),
          targetFiles: files,
        };
        await inbox.update(staged);
        if (active.current) setEntry(staged);
        const seed = offeredImportSeed({ ...updated, files }, facts);
        if (
          !capture.updateCaptureDetails(seed.details) ||
          !capture.updateDraft(seed.draft) ||
          !(await capture.persistCurrentCapture())
        )
          throw Error("IMPORT_CAPTURE_SAVE");
      }
      const next = {
        ...staged,
        targetId: target.targetId,
        targetKind:
          facts.intent === "wanted"
            ? ("requirement" as const)
            : ("property" as const),
        status: "transferred" as const,
        targetPath: JSON.stringify(target),
      };
      await inbox.update(next);
      if (active.current) {
        setEntry(next);
        router.push(target as never);
      }
    });
  const recognize = () =>
    run(async () => {
      if (!incomingImportNative || !media.access)
        throw Error("OCR_APK_REQUIRED");
      const texts: string[] = [];
      for (const file of entry.files.filter((f) => f.kind === "image")) {
        media.access.assertUri(file.uri);
        const result = await incomingImportNative.recognize(
          file.uri,
          media.access.cacheDirectory,
        );
        if (result.text.trim()) texts.push(result.text.trim());
      }
      if (!texts.length) throw Error("OCR_NO_TEXT");
      const ocrText = texts.join("\n\n");
      if (ocrText.length > 40000) throw Error("OCR_TEXT_TOO_LONG");
      const next = { ...entry, text, ocrText };
      await inbox.update(next);
      if (active.current) {
        setEntry(next);
        setFacts(
          analyzeImportMessage([text, ocrText].filter(Boolean).join("\n\n")),
        );
        setConfirmed(false);
        setNotice(
          copy(
            "تمت قراءة النص. راجع الأرقام والكلمات قبل المتابعة.",
            "Text recognized. Check words and numbers before continuing.",
          ),
        );
      }
    });
  const parts = suggestMessageParts(text);
  const studioConflict =
    facts.choice === "studio" &&
    facts.details.bathroomCount !== undefined &&
    facts.details.bathroomCount !== "1";
  const choices = [
    ...getPropertyTypeChoices("all", facts.transaction),
    "studio",
  ];
  const detailFields = [
    ["bedroomCount", copy("غرف النوم", "Bedrooms")],
    ["bathroomCount", copy("الحمامات", "Bathrooms")],
    ["parkingSpaceCount", copy("المواقف", "Parking spaces")],
  ] as const;
  return (
    <NextPage
      title={copy("راجع البيانات المستوردة", "Review imported data")}
      back={back}
      subtitle={copy(
        "الحقول اقتراحات قابلة للتعديل. لا تُضاف البيانات لقوائمك إلا عند حفظ النموذج الأصلي.",
        "Suggestions are editable. A record is created only when you save the original form.",
      )}
    >
      {entry.mergedInto ? (
        <NextSurface
          title={copy(
            "أُلحقت المرفقات بمسودة أخرى",
            "Files attached to another draft",
          )}
        >
          <Button
            title={copy("فتح المسودة المرتبطة", "Open linked draft")}
            onPress={() =>
              router.push(`/intake-review/${entry.mergedInto}` as never)
            }
          />
        </NextSurface>
      ) : entry.splitIds?.length ? (
        <NextSurface
          title={copy(
            "تم تقسيم الرسالة إلى مسودات",
            "Message split into drafts",
          )}
        >
          {entry.splitIds.map((id, index) => (
            <Button
              key={id}
              variant="outline"
              title={`${copy("مراجعة المسودة", "Review draft")} ${index + 1}`}
              onPress={() => router.push(`/intake-review/${id}` as never)}
            />
          ))}
        </NextSurface>
      ) : entry.status === "transferred" && entry.targetPath ? (
        <NextSurface title={copy("تم تجهيز النموذج", "Form prepared")}>
          <Text style={labelStyle}>
            {copy(
              "استكمل النموذج المرتبط. الحفظ النهائي يتم داخله؛ الرسالة الأصلية باقية هنا.",
              "Resume the linked form to finish saving. The original message stays here.",
            )}
          </Text>
          <Button
            title={copy("استكمال النموذج", "Resume form")}
            onPress={() =>
              void run(async () => {
                const saved = entry.targetId
                  ? entry.targetKind === "requirement"
                    ? await store.getRequirement(entry.targetId)
                    : await store.getProperty(entry.targetId)
                  : null;
                if (saved) {
                  router.push(
                    (entry.targetKind === "requirement"
                      ? `/requirement/view/${entry.targetId}`
                      : `/property/${entry.targetId}`) as never,
                  );
                  return;
                }
                const target = importTarget(entry);
                if (
                  target.pathname !== "/capture/studio" &&
                  entry.targetKind === "property" &&
                  capture.getCurrentDraft().propertyCoreId !== entry.targetId
                )
                  throw Error("IMPORT_DRAFT_UNAVAILABLE");
                router.push(target as never);
              })
            }
          />
          <Button
            variant="outline"
            disabled={busy}
            title={copy(
              "نسخ إلى مسودة استيراد جديدة",
              "Copy to a new import draft",
            )}
            onPress={() =>
              void run(async () => {
                const next: ImportEntry = {
                  id: generateDomainId(),
                  text: entry.text,
                  ocrText: entry.ocrText,
                  files: entry.files,
                  facts: entry.facts,
                  createdAt: new Date().toISOString(),
                  status: "received",
                };
                await inbox.add(next);
                if (active.current)
                  router.push(`/intake-review/${next.id}` as never);
              })
            }
          />
          <Button
            variant="outline"
            title={copy("استيراد جديد", "New import")}
            onPress={() => router.push("/intake" as never)}
          />
        </NextSurface>
      ) : (
        <>
          <NextSurface
            title={copy("الرسالة الأصلية — خاصة", "Original message — private")}
          >
            <TextInput
              accessibilityLabel={copy("نص الرسالة", "Message text")}
              multiline
              maxLength={40000}
              value={text}
              editable={!busy}
              onChangeText={(value) => {
                setText(value);
                setConfirmed(false);
                setDuplicateConfirmed(false);
              }}
              style={[style, { minHeight: 130, textAlignVertical: "top" }]}
            />
            <Button
              variant="outline"
              disabled={busy}
              title={copy("إعادة تحليل النص", "Analyze text again")}
              onPress={() => {
                setFacts(
                  analyzeImportMessage(
                    [text, entry.ocrText].filter(Boolean).join("\n\n"),
                  ),
                );
                setConfirmed(false);
              }}
            />
            {entry.ocrText ? (
              <Text selectable style={labelStyle}>
                {entry.ocrText}
              </Text>
            ) : null}
            {entry.files.map((file) => (
              <Button
                key={file.id}
                variant="outline"
                disabled={busy}
                title={file.originalName}
                onPress={() =>
                  void run(async () => {
                    await media.openAttachment(file, Sharing, Platform.OS);
                  })
                }
              />
            ))}
            {entry.files.some((f) => f.kind === "image") ? (
              <>
                <Button
                  variant="outline"
                  loading={busy}
                  disabled={busy || !incomingImportNative || !media.access}
                  title={copy("قراءة النص من الصور", "Read text from images")}
                  onPress={recognize}
                />
                <Text style={{ color: n.muted }}>
                  {copy(
                    "قراءة الصور متاحة على APK الجديد فقط، محليًا وبدون رفع الصور. الفيديو وPDF يُرفقان بدون تحليل.",
                    "Image OCR is available in the new Android APK, locally without uploading. Video and PDF are attachments only.",
                  )}
                </Text>
              </>
            ) : null}
            {parts.length > 1 ? (
              <Button
                variant="outline"
                disabled={busy || !!entry.files.length}
                title={copy(
                  `تقسيم إلى ${parts.length} مسودات للمراجعة`,
                  `Split into ${parts.length} drafts to review`,
                )}
                onPress={() =>
                  void run(async () => {
                    const splitIds = parts.map(
                      (_, index) => `${entry.id}-part-${index}`,
                    );
                    for (const [index, part] of parts.entries())
                      await inbox.add({
                        id: `${entry.id}-part-${index}`,
                        text: part,
                        files: [],
                        status: "received",
                        createdAt: entry.createdAt,
                      });
                    const next = { ...entry, splitIds };
                    await inbox.update(next);
                    if (active.current) setEntry(next);
                    setNotice(
                      copy(
                        "تم تجهيز المسودات بصندوق الاستيراد. راجع كل واحدة منفصلة.",
                        "Drafts prepared in the inbox. Review each separately.",
                      ),
                    );
                  })
                }
              />
            ) : null}
          </NextSurface>
          <NextSurface title={copy("البيانات المقترحة", "Suggested fields")}>
            {studioConflict ? (
              <Text style={{ color: n.red }}>
                {copy(
                  "الرسالة تذكر عدد حمامات مختلفًا عن نموذج الاستوديو الحالي. راجع النوع أو العدد في الرسالة؛ لن نستبدل العدد بواحد تلقائيًا.",
                  "The bathroom count conflicts with the original studio template. Review the type or source count; it will not be silently replaced with one.",
                )}
              </Text>
            ) : null}
            {[
              ...new Set([
                ...facts.warnings,
                ...(entry.ocrText ? ["ocr"] : []),
              ]),
            ].map((w) => (
              <Text
                key={w}
                style={{
                  color: n.red,
                  textAlign: isRTL ? "right" : "left",
                  fontFamily: fonts.regular,
                }}
              >
                {importWarningCopy[w]?.[ar ? 0 : 1]}
              </Text>
            ))}
            <NextFieldPair
              first={dropdown(
                copy("نوع الرسالة", "Message type"),
                [
                  {
                    value: "offered",
                    label: copy("عرض عقار", "Property offer"),
                  },
                  {
                    value: "wanted",
                    label: copy("طلب عميل", "Client request"),
                  },
                ],
                facts.intent ?? "",
                (v) =>
                  update({
                    intent: v as ImportFacts["intent"],
                    allKuwait: v === "wanted" ? facts.allKuwait : false,
                    areaIds:
                      v === "offered" && facts.areaIds.length > 1
                        ? []
                        : facts.areaIds,
                  }),
              )}
              second={dropdown(
                copy("المعاملة", "Transaction"),
                [
                  { value: "rent", label: copy("إيجار", "Rent") },
                  {
                    value: "sale",
                    label: copy("بيع / شراء", "Sale / purchase"),
                  },
                ],
                facts.transaction ?? "",
                (v) =>
                  update({
                    transaction: v as "rent" | "sale",
                    ...(v === "rent" && facts.choice === "commercial_complex"
                      ? { choice: undefined }
                      : {}),
                  }),
              )}
            />
            {dropdown(
              copy("نوع العقار", "Property type"),
              choices.map((value) => ({
                value,
                label:
                  value === "studio"
                    ? copy("استوديو", "Studio")
                    : getPropertyTypeChoiceLabel(
                        value as PropertyTypeChoice,
                        language,
                        t(
                          `propertyType.${canonicalPropertyTypeChoice(value as PropertyTypeChoice).propertyType}`,
                        ),
                      ),
              })),
              facts.choice ?? "",
              (v) => update({ choice: v }),
            )}
            {facts.intent === "wanted"
              ? dropdown(
                  copy("نطاق المناطق", "Area scope"),
                  [
                    {
                      value: "specific",
                      label: copy("مناطق محددة", "Specific areas"),
                    },
                    {
                      value: "all",
                      label: copy("كل مناطق الكويت", "All Kuwait areas"),
                    },
                  ],
                  facts.allKuwait ? "all" : "specific",
                  (v) =>
                    update({
                      allKuwait: v === "all",
                      areaIds: v === "all" ? [] : facts.areaIds,
                    }),
                )
              : null}
            {facts.intent !== "wanted" || !facts.allKuwait ? (
              <View style={{ gap: 8 }}>
                <Text style={labelStyle}>
                  {copy(
                    facts.intent === "wanted" ? "المناطق المطلوبة" : "المنطقة",
                    facts.intent === "wanted" ? "Requested areas" : "Area",
                  )}
                </Text>
                <KuwaitAreaSelector
                  selectedIds={facts.areaIds}
                  multiSelect={facts.intent === "wanted"}
                  onChange={(ids) => {
                    if (!busy) update({ areaIds: ids, allKuwait: false });
                  }}
                  testID="import-area"
                />
              </View>
            ) : (
              <Text style={labelStyle}>
                {copy("كل مناطق الكويت", "All Kuwait areas")}
              </Text>
            )}
            {facts.areaIds.length ? (
              <Text style={labelStyle}>
                {facts.areaIds
                  .map((id) => {
                    const a = KUWAIT_AREAS.find((a) => a.id === id);
                    return ar ? a?.ar : a?.en;
                  })
                  .join(" — ")}
              </Text>
            ) : null}
            <NextFieldPair
              first={
                <View style={{ gap: 8 }}>
                  <Text style={labelStyle}>
                    {copy(
                      facts.intent === "wanted"
                        ? "أقصى ميزانية — د.ك"
                        : "السعر — د.ك",
                      facts.intent === "wanted"
                        ? "Maximum budget — KWD"
                        : "Price — KWD",
                    )}
                  </Text>
                  <ImportAmount
                    accessibilityLabel={copy("السعر", "Price")}
                    editable={!busy}
                    value={facts.price}
                    onChangeNumber={(v) => update({ price: v })}
                    style={style}
                  />
                </View>
              }
              second={dropdown(
                copy("مدة الإيجار", "Rental period"),
                ["daily", "monthly", "yearly"].map((value) => ({
                  value,
                  label:
                    value === "daily"
                      ? copy("يومي", "Daily")
                      : value === "monthly"
                        ? copy("شهري", "Monthly")
                        : copy("سنوي", "Yearly"),
                })),
                facts.period ?? "",
                (v) => update({ period: v as ImportFacts["period"] }),
              )}
            />
            {facts.intent === "wanted" ? (
              <View style={{ gap: 8 }}>
                <Text style={labelStyle}>
                  {copy("أقل ميزانية — اختياري", "Minimum budget — optional")}
                </Text>
                <ImportAmount
                  accessibilityLabel={copy("أقل ميزانية", "Minimum budget")}
                  editable={!busy}
                  value={facts.minimum}
                  onChangeNumber={(v) => update({ minimum: v })}
                  style={style}
                />
              </View>
            ) : null}
            <Text style={{ color: n.muted }}>
              {copy(
                "الأعداد والمواصفات المستخرجة ستظهر في النموذج الأصلي حسب نوع العقار. يمكنك تعديلها هناك.",
                "Extracted specifications appear in the original form where applicable; edit them there.",
              )}
            </Text>
            {detailFields.map(([field, label]) => (
              <Text key={field} style={labelStyle}>
                {label}:{" "}
                {facts.details[field] ?? copy("غير محدد", "Unspecified")}
              </Text>
            ))}
            {facts.areaSquareMeters !== undefined ? (
              <Text style={labelStyle}>
                {copy("المساحة", "Area")}: {facts.areaSquareMeters} m²
              </Text>
            ) : null}
          </NextSurface>
          {facts.intent === "offered" ? (
            <NextSurface title={copy("أكد مصدر العرض", "Confirm the source")}>
              {dropdown(
                copy("صفة المصدر", "Source role"),
                [
                  {
                    value: "unknown",
                    label: copy(
                      "غير معروف — أستكمله لاحقًا",
                      "Unknown — complete later",
                    ),
                  },
                  { value: "owner", label: copy("مالك", "Owner") },
                  { value: "broker", label: copy("وسيط", "Broker") },
                  {
                    value: "real_estate_company",
                    label: copy("شركة عقارية", "Real-estate company"),
                  },
                  { value: "building_guard", label: copy("حارس", "Guard") },
                ],
                sourceRole,
                (v) => {
                  setSourceRole(v);
                  setSourcePersonId("");
                  setConfirmed(false);
                },
              )}
              {sourceRole && sourceRole !== "unknown"
                ? dropdown(
                    copy("الشخص المصدر", "Source person"),
                    people
                      .filter((p) =>
                        p.classifications.includes(sourceRole as never),
                      )
                      .map((p) => ({ value: p.id, label: p.name })),
                    sourcePersonId,
                    (v) => {
                      setSourcePersonId(v);
                      setConfirmed(false);
                    },
                  )
                : null}
              <Text style={{ color: n.muted }}>
                {copy(
                  "مرسل الرسالة ليس بالضرورة المالك؛ الربط يتم باختيارك فقط.",
                  "The sender is not necessarily the owner. Link a source only by your explicit selection.",
                )}
              </Text>
              <Button
                variant="outline"
                title={copy("إضافة شخص", "Add person")}
                onPress={() =>
                  void run(async () => {
                    await saveReview();
                    router.push("/person/new" as never);
                  })
                }
              />
            </NextSurface>
          ) : null}
          {facts.intent === "wanted" ? (
            <NextSurface
              title={copy("اربط الطلب بشخص", "Link request to a person")}
            >
              <TextInput
                accessibilityLabel={copy("بحث الأشخاص", "Find a person")}
                placeholder={copy(
                  "ابحث بالاسم أو الرقم…",
                  "Search name or number…",
                )}
                value={peopleQuery}
                onChangeText={setPeopleQuery}
                style={style}
              />
              {dropdown(
                copy("الشخص", "Person"),
                people
                  .filter((p) => p.classifications.includes("seeker"))
                  .filter((p) =>
                    `${p.name} ${p.displayPhone}`
                      .toLowerCase()
                      .includes(peopleQuery.toLowerCase()),
                  )
                  .map((p) => ({
                    value: p.id,
                    label: `${p.name} — ${p.displayPhone}`,
                  })),
                seekerId,
                (v) => {
                  setSeekerId(v);
                  setConfirmed(false);
                },
              )}
              <Button
                variant="outline"
                title={copy("إضافة شخص أولًا", "Add a person first")}
                onPress={() =>
                  void run(async () => {
                    await saveReview();
                    router.push("/person/new" as never);
                  })
                }
              />
              <Text style={{ color: n.muted }}>
                {copy(
                  "الرسالة ومرفقاتها تظل خاصة بصندوق الاستيراد؛ لا تُنسخ لملاحظات الطلب القابلة للمشاركة.",
                  "Original text and files stay private in the import inbox, outside shareable request notes.",
                )}
              </Text>
            </NextSurface>
          ) : null}
          {duplicates.length || savedDuplicates.length ? (
            <NextSurface
              title={copy(
                "قد تكون الرسالة مستوردة بالفعل",
                "Possible duplicate import",
              )}
            >
              {savedDuplicates.map((d) => (
                <Button
                  key={d.id}
                  variant="outline"
                  title={copy("فتح السجل المشابه", "Open similar saved record")}
                  onPress={() => router.push(d.path as never)}
                />
              ))}
              {duplicates.map((d) => (
                <Button
                  key={d.id}
                  variant="outline"
                  title={copy("فتح الرسالة السابقة", "Open previous import")}
                  onPress={() => router.push(`/intake-review/${d.id}` as never)}
                />
              ))}
              <Button
                variant="outline"
                title={
                  duplicateConfirmed
                    ? copy(
                        "✓ أؤكد أنها رسالة مستقلة",
                        "✓ Confirmed separate import",
                      )
                    : copy(
                        "تأكيد استيراد نسخة مستقلة",
                        "Confirm separate import",
                      )
                }
                onPress={() => setDuplicateConfirmed((v) => !v)}
              />
            </NextSurface>
          ) : null}
          {entry.files.length && candidates.length ? (
            <NextSurface
              title={copy(
                "إلحاق المرفقات بمسودة أخرى",
                "Attach files to another draft",
              )}
            >
              {dropdown(
                copy("المسودة", "Draft"),
                candidates.map((e) => ({
                  value: e.id,
                  label: e.text.slice(0, 80) || copy("مرفقات", "Attachments"),
                })),
                mergeId,
                setMergeId,
              )}
              <Button
                variant="outline"
                disabled={busy || !mergeId}
                title={copy("إلحاق الملفات المحددة", "Attach these files")}
                onPress={() =>
                  void run(async () => {
                    const current = (await inbox.read()).find(
                      (e) =>
                        e.id === mergeId &&
                        e.status !== "transferred" &&
                        !e.splitIds?.length &&
                        !e.mergedInto,
                    );
                    if (!current) throw Error("IMPORT_TARGET_MISSING");
                    const files = [
                      ...current.files,
                      ...entry.files.filter(
                        (f) => !current.files.some((c) => c.id === f.id),
                      ),
                    ].map((f, order) => ({ ...f, order }));
                    await inbox.update({ ...current, files });
                    const merged = { ...entry, mergedInto: current.id };
                    await inbox.update(merged);
                    if (active.current) setEntry(merged);
                    setNotice(
                      copy(
                        "أُلحقت المرفقات. راجع المسودة المختارة.",
                        "Files attached. Review the selected draft.",
                      ),
                    );
                  })
                }
              />
            </NextSurface>
          ) : null}
          {entry.targetId &&
          entry.targetId === capture.getCurrentDraft().propertyCoreId ? (
            <Button
              variant="outline"
              title={copy(
                "فتح مسودة العقار الحالية",
                "Open current property draft",
              )}
              onPress={() =>
                router.push(
                  (entry.targetPath
                    ? importTarget(entry)
                    : "/capture") as never,
                )
              }
            />
          ) : null}
          <Button
            variant="outline"
            disabled={busy}
            title={
              confirmed
                ? copy(
                    "✓ راجعت البيانات وأؤكدها",
                    "✓ Details reviewed and confirmed",
                  )
                : copy(
                    "راجعت البيانات وأؤكدها",
                    "I have reviewed these details",
                  )
            }
            onPress={() => setConfirmed((v) => !v)}
          />
          <Button
            disabled={
              busy ||
              studioConflict ||
              !confirmed ||
              !facts.choice ||
              !facts.intent ||
              !facts.transaction ||
              (facts.transaction === "rent" && !facts.period) ||
              (facts.intent === "wanted" && !seekerId) ||
              (facts.intent === "offered" &&
                (!sourceRole ||
                  (sourceRole !== "unknown" && !sourcePersonId))) ||
              (!!(duplicates.length || savedDuplicates.length) &&
                !duplicateConfirmed)
            }
            loading={busy}
            title={copy(
              "استكمال في النموذج الأصلي",
              "Continue in original form",
            )}
            onPress={continueForm}
          />
          <Button
            variant="outline"
            disabled={busy}
            title={copy("حفظ للمراجعة لاحقًا", "Save for later review")}
            onPress={() =>
              void run(async () => {
                await saveReview();
                setNotice(
                  copy("تم حفظ المراجعة محليًا.", "Review saved locally."),
                );
              })
            }
          />
        </>
      )}
      {entry.status === "transferred" ||
      entry.splitIds?.length ||
      entry.mergedInto ? (
        <NextSurface
          title={copy("الأصل المحفوظ — خاص", "Retained original — private")}
        >
          <Text selectable style={labelStyle}>
            {entry.text}
          </Text>
          {entry.ocrText ? (
            <Text selectable style={labelStyle}>
              {entry.ocrText}
            </Text>
          ) : null}
          {entry.files.map((file) => (
            <Button
              key={file.id}
              variant="outline"
              title={file.originalName}
              onPress={() =>
                void run(async () => {
                  await media.openAttachment(file, Sharing, Platform.OS);
                })
              }
            />
          ))}
        </NextSurface>
      ) : null}
      {notice ? (
        <Text selectable style={{ color: n.green }}>
          {notice}
        </Text>
      ) : null}
      {error ? (
        <Text selectable accessibilityRole="alert" style={{ color: n.red }}>
          {error}
        </Text>
      ) : null}
    </NextPage>
  );
}

function ImportAmount({
  value,
  onChangeNumber,
  ...props
}: {
  value?: number;
  onChangeNumber: (value: number | undefined) => void;
  accessibilityLabel: string;
  style: object;
  editable?: boolean;
}) {
  const [raw, setRaw] = useState(value === undefined ? "" : String(value));
  useEffect(() => {
    if (Number(raw) !== value && !(value === undefined && !raw.trim()))
      setRaw(value === undefined ? "" : String(value));
  }, [value]);
  return (
    <TextInput
      {...props}
      keyboardType="decimal-pad"
      value={raw}
      onChangeText={(input) => {
        const next = normalizeImportText(input).replace(/٫/g, ".");
        if (!/^\d*(?:\.\d*)?$/.test(next)) return;
        setRaw(next);
        onChangeNumber(next && next !== "." ? Number(next) : undefined);
      }}
    />
  );
}
