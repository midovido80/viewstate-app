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
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import { Button } from "@/components/Button";
import { createWorkspaceSyncDevice } from "@/services/workspaceSyncDevice";
import type { UserResources } from "@/contexts/UserDataContext";
import type { createGoogleAccountDevice } from "@/services/googleAccountDevice";
import type { SyncConflict } from "@/services/workspaceSync";
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
  const [status, setStatus] = useState<
      "local" | "syncing" | "synced" | "offline" | "error" | "conflict"
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
      setStatus("syncing");
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
        setStatus(state.conflicts.length ? "conflict" : "synced");
        ready.current = true;
      } catch (error) {
        if (!alive) return;
        const code = (error as Error).message;
        setStatus(
          /CONNECTION|FETCH|NETWORK|REAUTHENTICATE|HTTP_40[13]/i.test(code)
            ? "offline"
            : "error",
        );
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
    const online = () => schedule();
    if (typeof window !== "undefined")
      window.addEventListener("online", online);
    return () => {
      alive = false;
      unsubscribe();
      lifecycle.remove();
      clearInterval(interval);
      if (timer) clearTimeout(timer);
      if (typeof window !== "undefined")
        window.removeEventListener("online", online);
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
        ? "بدون اتصال — يمكنك متابعة العمل؛ التغييرات محفوظة على الجهاز."
        : "Offline — keep working. Changes are saved on this device."
      : status === "conflict"
        ? ar
          ? `${conflicts.length} تعارض يحتاج مراجعة — شغلك المحلي محفوظ`
          : `${conflicts.length} conflicts to review — local work is preserved`
        : status === "error"
          ? ar
            ? "المزامنة تحتاج مراجعة — بياناتك محفوظة ويمكنك متابعة العمل."
            : "Sync needs attention — your data is saved and work can continue."
          : status === "synced"
            ? ar
              ? "تمت المزامنة"
              : "Synced"
            : ar
              ? "بيانات الجهاز متاحة — جارٍ التحقق والمزامنة…"
              : "Device data is available — checking and syncing…";
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
  async function resolve(conflict: SyncConflict, choice: "local" | "remote") {
    const sync = engine.current;
    if (!sync) return;
    await sync.resolve(conflict.key, choice);
    setConflicts((current) => current.filter((c) => c.key !== conflict.key));
    retry.current();
  }
  return (
    <>
      {status !== "synced" && (
        <Pressable
          testID="workspace-sync-status"
          accessibilityRole="button"
          onPress={() =>
            status === "conflict" ? setOpen(true) : retry.current()
          }
          style={{
            paddingHorizontal: 14,
            paddingVertical: 7,
            backgroundColor:
              status === "conflict" ? "#FEF3C7" : colors.secondary,
          }}
        >
          <Text style={[text, { fontSize: 12, lineHeight: 19 }]}>{copy}</Text>
        </Pressable>
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
            paddingTop: 42,
            paddingHorizontal: 18,
            paddingBottom: 24,
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
            {conflicts.map((conflict) => (
              <View key={conflict.key} style={{ paddingVertical: 12, gap: 8 }}>
                <Text style={[text, { fontFamily: fonts.semiBold }]}>
                  {recordTitle(conflict.key)}
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
                        ? ar
                          ? "تم حذف السجل"
                          : "Record deleted"
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
                    <Button
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
