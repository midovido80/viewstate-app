import { Text } from "@/components/AppText";
import { getRequirementDetailsRows } from "@/services/requirementDetailsPresentation";
import {
  propertyDetailLabels,
  formatPropertyDetailValue,
} from "@/services/propertyDetailPresentation";
import type {
  PropertyDetailField,
  SeekerRequirement,
} from "@workspace/property-domain";
import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/Button";
import { createWorkspaceSyncDevice } from "@/services/workspaceSyncDevice";
import type { UserResources } from "@/contexts/UserDataContext";
import type { createGoogleAccountDevice } from "@/services/googleAccountDevice";
import type { SyncConflict } from "@/services/workspaceSync";
import {
  canChooseSyncVersion,
  syncMissingVersionLabel,
  syncValidationIssueMessage,
  syncConflictDifferences,
  syncConflictName,
} from "@/services/syncConflictPresentation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  workspaceSyncProblem,
  workspaceSyncProblemMessage,
  type SyncProblem,
} from "@/services/workspaceSyncStatus";
type Device = Awaited<ReturnType<typeof createGoogleAccountDevice>>;
export function WorkspaceConnection({
  resources,
  device,
  revalidate,
}: {
  resources: UserResources;
  device: Device;
  revalidate: () => Promise<boolean>;
}) {
  const { language, isRTL, fonts, t } = useI18n(),
    colors = useColors(),
    ar = language === "ar";
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState("");
  const [damagedState, setDamagedState] = useState(false);
  const [problem, setProblem] = useState<SyncProblem>("unknown");
  const [statusDetails, setStatusDetails] = useState(false);
  const [status, setStatus] = useState<
      "local" | "synced" | "offline" | "error" | "conflict"
    >("local"),
    [conflicts, setConflicts] = useState<SyncConflict[]>([]),
    [open, setOpen] = useState(false);
  const [expandedRaw, setExpandedRaw] = useState<string | null>(null);
  const engine = useRef<ReturnType<typeof createWorkspaceSyncDevice> | null>(
      null,
    ),
    retry = useRef(() => {});
  const ready = useRef(false);
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout> | undefined,
      flight = false,
      again = false;
    const sync = createWorkspaceSyncDevice(resources, device);
    engine.current = sync;
    const run = async () => {
      if (
        !alive ||
        (AppState.currentState && AppState.currentState !== "active")
      )
        return;
      if (flight) {
        again = true;
        return;
      }
      flight = true;
      // Keep the last visible state during background checks to avoid moving the screen.
      try {
        if (!(await revalidate())) {
          if (alive) setStatus("offline");
          return;
        }
        resources.scope.assertActive();
        const pending = await device.offline.read();
        resources.scope.assertActive();
        if (
          pending?.pendingProfile &&
          pending.account.userId === resources.scope.userId
        ) {
          const stored = await device.account.saveProfile(pending.profile);
          resources.scope.assertActive();
          await device.offline.acknowledgeProfile(
            pending.profile,
            pending.account,
            stored,
          );
        }
        const state = await sync.sync();
        if (!alive) return;
        setConflicts(state.conflicts);
        setDamagedState(false);
        setStatus(state.conflicts.length ? "conflict" : "synced");
        ready.current = true;
      } catch (error) {
        if (!alive) return;
        const code = (error as Error).message;
        const reason = workspaceSyncProblem(error);
        setProblem(reason);
        setDamagedState(code === "SYNC_STATE_DAMAGED");
        setStatus(
          reason === "offline"
            ? "offline"
            : reason === "pending"
              ? "local"
              : "error",
        );
        if (reason === "pending") again = true;
      } finally {
        flight = false;
        if (again && alive) {
          again = false;
          timer = setTimeout(() => void run(), 1000);
        }
      }
    };
    retry.current = () => void run();
    void run();
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), 1200);
    };
    const unsubscribe = resources.subscribeChanges(schedule),
      lifecycle = AppState.addEventListener("change", (state) => {
        if (state === "active") schedule();
      });
    const interval = setInterval(() => void run(), 30000);
    // React Native also defines window, without the browser online event API.
    const browserWindow =
      Platform.OS === "web" && typeof window !== "undefined" ? window : null;
    browserWindow?.addEventListener("online", schedule);
    return () => {
      alive = false;
      unsubscribe();
      lifecycle.remove();
      clearInterval(interval);
      if (timer) clearTimeout(timer);
      browserWindow?.removeEventListener("online", schedule);
    };
  }, [resources, device]);
  const align = isRTL ? ("right" as const) : ("left" as const),
    text = {
      color: colors.foreground,
      fontFamily: fonts.regular,
      textAlign: align,
    };
  const copy =
    status === "offline"
      ? ar
        ? "نسخة حسابك غير متصلة — التغييرات محفوظة على الجهاز. اضغط للتفاصيل."
        : "Your account copy is offline — changes are saved on this device. Tap for details."
      : status === "conflict"
        ? ar
          ? conflicts.some((conflict) => conflict.validationIssues?.length)
            ? `${conflicts.length} سجل يحتاج تصحيح قبل المزامنة — شغلك المحلي محفوظ`
            : `${conflicts.length} تعارض يحتاج مراجعة — شغلك المحلي محفوظ`
          : conflicts.some((conflict) => conflict.validationIssues?.length)
            ? `${conflicts.length} records need correction before sync — local work is preserved`
            : `${conflicts.length} conflicts to review — local work is preserved`
        : status === "error"
          ? ar
            ? "لم يكتمل حفظ نسخة حسابك — بيانات الجهاز محفوظة. اضغط لمعرفة السبب."
            : "Your account copy did not finish saving — device data is preserved. Tap for details."
          : status === "synced"
            ? ar
              ? "تمت المزامنة"
              : "Synced"
            : ar
              ? "جارٍ تحديث نسخة حسابك الخاصة؛ يمكنك متابعة العمل…"
              : "Updating your private account copy; you can keep working…";
  function preview(value: unknown, key: string): string {
    if (value === undefined) return ar ? "تم حذف السجل" : "Record deleted";
    const v = value as Record<string, any>;
    if (key.startsWith("requirement/"))
      return getRequirementDetailsRows(
        value as SeekerRequirement,
        language,
        (k) => t(k as any),
      )
        .map((row) => `${row.label}: ${row.value}`)
        .join("\n");
    if (key.startsWith("person/"))
      return [v.name, v.displayPhone, v.notes].filter(Boolean).join("\n");
    if (key.startsWith("property/")) {
      const offer = v.activeOffer,
        price =
          offer?.transaction === "rent" ? offer.rentalPrice : offer?.salePrice;
      return [
        t(`propertyType.${v.core?.propertyType}` as any),
        v.core?.description?.value,
        v.core?.locationArea?.id,
        price ? `${price.amount} ${price.currencyCode}` : "",
        ...Object.entries(v.typeDetails ?? {})
          .filter(([field]) => field in propertyDetailLabels)
          .map(
            ([field, val]) =>
              `${propertyDetailLabels[field as PropertyDetailField][ar ? 1 : 0]}: ${formatPropertyDetailValue(field as PropertyDetailField, val, language)}`,
          ),
        v.core?.privateNotes?.value,
      ]
        .filter(Boolean)
        .join("\n");
    }
    return (
      [v.title, v.date, v.time, v.notes].filter(Boolean).join("\n") ||
      (ar
        ? "تغيير في بيانات السجل؛ يمكنك عرض التفاصيل أدناه."
        : "Record data changed; details are available below.")
    );
  }
  function recordTitle(key: string) {
    return (
      (
        {
          property: ar ? "عقار" : "Property",
          person: ar ? "شخص" : "Person",
          requirement: ar ? "متطلبات" : "Requirements",
          task: ar ? "متابعة" : "Follow-up",
          source: ar ? "مصدر العقار" : "Property source",
          link: ar ? "ارتباط عقار وشخص" : "Property/contact link",
        } as Record<string, string>
      )[key.split("/")[0]] ?? (ar ? "سجل متابعة" : "Follow-up record")
    );
  }
  async function resolve(
    conflict: SyncConflict,
    choice: "local" | "remote" | "repair_missing_person",
  ) {
    const sync = engine.current;
    if (!sync || resolving) return;
    setResolving(true);
    setResolutionError("");
    try {
      if (choice === "repair_missing_person")
        await sync.repairMissingRequirementPerson(conflict.key);
      else await sync.resolve(conflict.key, choice);
      const next = await sync.sync();
      setConflicts(next.conflicts);
      setStatus(next.conflicts.length ? "conflict" : "synced");
      if (!next.conflicts.length) {
        setOpen(false);
        setExpandedRaw(null);
      }
      if (next.conflicts.some((item) => item.key === conflict.key))
        setResolutionError(
          next.conflicts.find((item) => item.key === conflict.key)
            ?.validationIssues?.length
            ? syncValidationIssueMessage(
                next.conflicts.find((item) => item.key === conflict.key)!
                  .validationIssues![0],
                language,
              )
            : ar
              ? "تغيرت النسخة أو تعارضت مع سجل مرتبط. راجع القيم الحالية وحاول مرة ثانية."
              : "The version or a linked record changed. Review the current values and retry.",
        );
    } catch {
      setResolutionError(
        ar
          ? "ما اكتملت المزامنة. بياناتك على الجهاز محفوظة؛ حاول مرة ثانية."
          : "Sync did not complete. Your device data is preserved; retry.",
      );
    } finally {
      setResolving(false);
    }
  }
  async function recoverDamagedState() {
    if (!engine.current || resolving) return;
    setResolving(true);
    setResolutionError("");
    try {
      const state = await engine.current.recoverDamagedState();
      resources.scope.assertActive();
      setDamagedState(false);
      setConflicts(state.conflicts);
      setStatus(state.conflicts.length ? "conflict" : "local");
      setOpen(state.conflicts.length > 0);
      if (!state.conflicts.length) retry.current();
    } catch {
      setResolutionError(
        ar
          ? "ما اكتمل الاسترداد. النسخ محفوظة؛ حاول مرة ثانية عند توفر الاتصال."
          : "Recovery did not complete. Versions are preserved; retry when connected.",
      );
    } finally {
      setResolving(false);
    }
  }
  return (
    <>
      {status !== "synced" && (
        <Pressable
          testID="workspace-sync-status"
          accessibilityRole="button"
          onPress={() =>
            status === "conflict" ? setOpen(true) : setStatusDetails(true)
          }
          style={{
            paddingTop: insets.top + 7,
            paddingHorizontal: 14,
            paddingVertical: 7,
            backgroundColor:
              status === "conflict" ? "#FEF3C7" : colors.secondary,
          }}
        >
          <Text style={[text, { fontSize: 12, lineHeight: 19 }]}>{copy}</Text>
          {status === "conflict" && (
            <Text style={[text, { fontFamily: fonts.bold }]}>
              {ar ? "مراجعة التعارضات" : "Review conflicts"}
            </Text>
          )}
        </Pressable>
      )}
      <Modal
        visible={statusDetails}
        transparent
        animationType="slide"
        onRequestClose={() => setStatusDetails(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "#00000066",
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              padding: 20,
              borderRadius: 16,
              gap: 14,
            }}
          >
            <Text style={[text, { fontFamily: fonts.bold, fontSize: 20 }]}>
              {ar ? "حفظ نسخة حسابك الخاصة" : "Your private account copy"}
            </Text>
            <Text style={text}>
              {ar
                ? "المزامنة تحفظ سجلات العقارات والأشخاص والطلبات والمتابعات والمرفقات في مساحة حساب جوجل الخاصة، لتحديثها بين أجهزتك. لا تنشرها للزملاء أو دوائر الثقة؛ المشاركة في الدائرة إجراء منفصل تختاره أنت."
                : "Synchronization saves your properties, people, requests, follow-ups and attachments in your private Google-linked account space across devices. It does not publish them to colleagues or Trust Circles; circle sharing is a separate action you choose."}
            </Text>
            <Text style={text} testID="workspace-sync-problem">
              {status === "synced"
                ? ar
                  ? "نسخة حسابك الخاصة محدثة الآن."
                  : "Your private account copy is now up to date."
                : status === "local"
                  ? copy
                  : workspaceSyncProblemMessage(
                      status === "offline" ? "offline" : problem,
                      ar,
                    )}
            </Text>
            <Button
              title={
                ar
                  ? "إعادة محاولة حفظ نسخة الحساب"
                  : "Retry saving account copy"
              }
              onPress={() => {
                setStatusDetails(false);
                retry.current();
              }}
            />
            <Button
              title={ar ? "إغلاق والمتابعة" : "Close and continue"}
              variant="outline"
              onPress={() => setStatusDetails(false)}
            />
          </View>
        </View>
      </Modal>
      {damagedState && (
        <View
          style={{ padding: 14, gap: 8, backgroundColor: colors.secondary }}
        >
          <Text style={text}>
            {ar
              ? "تعطلت معلومات المزامنة. سنحفظ نسخة للاسترداد من بيانات الجهاز والسحابة، ثم تراجع كل اختلاف قبل المزامنة. اختيار نسخة غير موجودة يعني حذف السجل."
              : "Sync history is damaged. Save recovery copies of device and cloud data, then review every difference before syncing. Choosing an absent version deletes that record."}
          </Text>
          <Button
            disabled={resolving}
            title={
              ar
                ? "حفظ النسخ ومراجعة الاختلافات"
                : "Save copies and review differences"
            }
            onPress={() => void recoverDamagedState()}
          />
          {!!resolutionError && (
            <Text accessibilityRole="alert" style={text}>
              {resolutionError}
            </Text>
          )}
        </View>
      )}
      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        animationType="slide"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: insets.top + 16,
            paddingHorizontal: 18,
            paddingBottom: Math.max(insets.bottom, 24),
            gap: 12,
          }}
        >
          <Text style={[text, { fontFamily: fonts.bold, fontSize: 20 }]}>
            {ar ? "مراجعة تعارضات المزامنة" : "Review sync conflicts"}
          </Text>
          <Text style={text}>
            {ar
              ? "لم نستبدل أي نسخة متعارضة. راجع القيم واختر النسخة التي تريد اعتمادها."
              : "Neither conflicting version was overwritten. Review the values and choose which version to use."}
          </Text>
          <ScrollView>
            {!!resolutionError && (
              <Text
                accessibilityRole="alert"
                style={[text, { color: colors.destructive }]}
              >
                {resolutionError}
              </Text>
            )}
            {conflicts.map((conflict) => (
              <View key={conflict.key} style={{ paddingVertical: 12, gap: 8 }}>
                <Text style={[text, { fontFamily: fonts.semiBold }]}>
                  {recordTitle(conflict.key)}
                  {syncConflictName(conflict)
                    ? ` — ${syncConflictName(conflict)}`
                    : ""}
                </Text>
                {conflict.validationIssues?.map((issue, index) => (
                  <Text
                    key={`${issue.code}-${index}`}
                    style={[text, { color: colors.destructive }]}
                  >
                    {syncValidationIssueMessage(issue, language)}
                  </Text>
                ))}
                {conflict.validationIssues?.some(
                  (issue) => issue.code === "missing_requirement_person",
                ) && (
                  <Button
                    title={
                      ar
                        ? "إصلاح الربط والاحتفاظ بالطلب"
                        : "Keep request and repair missing link"
                    }
                    testID={`sync-repair-missing-person-${conflict.key}`}
                    loading={resolving}
                    disabled={resolving}
                    onPress={() =>
                      void resolve(conflict, "repair_missing_person")
                    }
                  />
                )}
                {!!conflict.validationIssues?.length &&
                  conflict.local !== undefined && (
                    <Button
                      title={ar ? "مراجعة بيانات السجل" : "Review record data"}
                      variant="outline"
                      disabled={resolving}
                      testID={`sync-review-record-${conflict.key}`}
                      onPress={() => {
                        setOpen(false);
                        const [kind, ...parts] = conflict.key.split("/");
                        const id = encodeURIComponent(parts.join("/"));
                        router.push(
                          (kind === "requirement"
                            ? `/requirement/${id}?edit=1`
                            : kind === "property"
                              ? `/property/${id}?edit=1`
                              : kind === "person"
                                ? `/person/${id}`
                                : "/properties") as never,
                        );
                      }}
                    />
                  )}
                <Text style={text}>
                  {ar ? "الحقول المختلفة:" : "Different fields:"}{" "}
                  {(conflict.validationIssues?.length
                    ? conflict.validationIssues.flatMap((issue) =>
                        issue.paths.map((path) => ({ path: path.split(".") })),
                      )
                    : syncConflictDifferences(conflict.local, conflict.remote)
                  )
                    .map(({ path }) => {
                      const field = path[path.length - 1];
                      if (!field)
                        return ar
                          ? "إضافة أو حذف سجل"
                          : "Record creation or deletion";
                      const labels: Record<string, string> = ar
                        ? {
                            name: "الاسم",
                            listingTitle: "عنوان العقار",
                            notes: "الملاحظات",
                            privateNotes: "الملاحظات الخاصة",
                            displayPhone: "رقم الهاتف",
                            normalizedPhone: "الرقم الدولي",
                            classifications: "الأدوار",
                            amount: "القيمة",
                            currencyCode: "العملة",
                            rentalPeriodId: "دورية الإيجار",
                            transaction: "نوع المعاملة",
                            minimum: "الحد الأدنى",
                            maximum: "الحد الأعلى",
                            preferredAreaIds: "المناطق",
                            seekerId: "صاحب الطلب",
                            preferredAreaMode: "نطاق المناطق",
                            propertyType: "نوع العقار",
                            budget: "الميزانية",
                            catalogPreferences: "تفضيلات المواصفات",
                          }
                        : {};
                      return (
                        labels[field] ??
                        (field in propertyDetailLabels
                          ? propertyDetailLabels[field as PropertyDetailField][
                              ar ? 1 : 0
                            ]
                          : path.join(" / "))
                      );
                    })
                    .join(ar ? "، " : ", ")}
                </Text>
                {(["local", "remote"] as const).map((choice) => (
                  <View
                    key={choice}
                    style={{
                      padding: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      gap: 8,
                    }}
                  >
                    <Text style={[text, { fontFamily: fonts.semiBold }]}>
                      {choice === "local"
                        ? ar
                          ? "نسخة الجهاز"
                          : "Device version"
                        : ar
                          ? "نسخة السحابة"
                          : "Cloud version"}
                    </Text>
                    <Text selectable style={text}>
                      {conflict[choice] === undefined
                        ? syncMissingVersionLabel(conflict, choice, language)
                        : preview(conflict[choice], conflict.key)}
                    </Text>
                    {conflict[choice] !== undefined && (
                      <>
                        <Pressable
                          onPress={() =>
                            setExpandedRaw(
                              expandedRaw === `${conflict.key}:${choice}`
                                ? null
                                : `${conflict.key}:${choice}`,
                            )
                          }
                        >
                          <Text style={text}>
                            {ar ? "تفاصيل السجل" : "Record details"}
                          </Text>
                        </Pressable>
                        {expandedRaw === `${conflict.key}:${choice}` && (
                          <Text selectable style={text}>
                            {JSON.stringify(conflict[choice], null, 2)}
                          </Text>
                        )}
                      </>
                    )}
                    {canChooseSyncVersion(conflict) && (
                      <Button
                        disabled={resolving}
                        variant="outline"
                        title={
                          choice === "local"
                            ? ar
                              ? "اعتماد نسخة الجهاز"
                              : "Use device version"
                            : ar
                              ? "اعتماد نسخة السحابة"
                              : "Use cloud version"
                        }
                        onPress={() =>
                          void resolve(conflict, choice).catch(() =>
                            setStatus("error"),
                          )
                        }
                      />
                    )}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
          <Button
            title={ar ? "إغلاق والمتابعة" : "Close and continue working"}
            onPress={() => setOpen(false)}
          />
        </View>
      </Modal>
    </>
  );
}
