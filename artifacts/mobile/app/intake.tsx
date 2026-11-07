import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
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
  canonicalPropertyTypeChoice,
  getPropertyTypeChoices,
  getPropertyTypeChoiceLabel,
  type PropertyTypeChoice,
} from "@/services/propertySectorSelection";
import { getPropertyFormRoute } from "@/services/propertyFormRoutes";
import {
  canBeginMessageCapture,
  privateMessageNote,
} from "@/services/nextFormPresentation";

/** Explicit local capture: do not infer prices, service facts or contact permission from prose. */
export default function MessageIntake() {
  const { language, isRTL, fonts, t } = useI18n(),
    capture = useCapture(),
    router = useRouter(),
    ar = language === "ar";
  const [text, setText] = useState(""),
    [title, setTitle] = useState("");
  const [transaction, setTransaction] = useState<"sale" | "rent">("rent");
  const [choice, setChoice] = useState<PropertyTypeChoice>("apartment");
  const [phase, setPhase] = useState<
      "idle" | "preparing" | "staging" | "saving"
    >("idle"),
    [error, setError] = useState("");
  const startFlight = useRef(false),
    commitFlight = useRef(false);
  const transferred = useRef(false),
    mounted = useRef(true),
    focused = useRef(true);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const persist = useLocalFormDraft({
    identity: "next-message-intake",
    value: { text, title, transaction, choice },
    complete: transferred.current,
    completed: () => transferred.current,
    restore: (v) => {
      if (
        !["rent", "sale"].includes(v.transaction) ||
        !getPropertyTypeChoices("all", v.transaction).includes(v.choice)
      )
        throw Error("INTAKE_DRAFT_UNREADABLE");
      setText(v.text);
      setTitle(v.title);
      setTransaction(v.transaction);
      setChoice(v.choice);
    },
  });
  const { back } = useDraftBack({ persist, fallback: "/" });
  const selected = canonicalPropertyTypeChoice(choice);
  const subtype =
    selected.propertyType === "apartment"
      ? (selected.apartmentSubtype ?? "standard_apartment")
      : undefined;
  const target = getPropertyFormRoute({
    mode: "offered",
    transaction,
    ...selected,
    apartmentSubtype: subtype,
  });
  useEffect(() => {
    if (
      phase !== "staging" ||
      commitFlight.current ||
      capture.draft.privateNotes?.value !== text ||
      capture.draft.propertyType !== selected.propertyType
    )
      return;
    commitFlight.current = true;
    setPhase("saving");
    void capture
      .persistCurrentCapture()
      .then(async (ok) => {
        if (!ok) throw Error("SAVE_FAILED");
        transferred.current = true;
        await persist.discard();
        if (mounted.current) {
          setPhase("idle");
          setText("");
          setTitle("");
          if (focused.current) router.push(target as never);
        }
      })
      .catch(() => {
        transferred.current = false;
        if (mounted.current) {
          setPhase("idle");
          setError(
            ar
              ? "تعذر تأكيد الحفظ. الرسالة والمسودة محفوظتان للمراجعة؛ افتح المسودة قبل المتابعة."
              : "Saving could not be confirmed. Review the retained message and capture draft before continuing.",
          );
        }
      })
      .finally(() => {
        startFlight.current = false;
        commitFlight.current = false;
      });
  }, [phase, capture.draft]);
  const begin = async () => {
    setError("");
    if (
      !text.trim() ||
      !capture.isReady ||
      phase !== "idle" ||
      startFlight.current
    )
      return;
    if (
      !canBeginMessageCapture(
        capture.getCurrentDraft(),
        capture.getCurrentCaptureDetails(),
      )
    ) {
      setError(
        ar
          ? "لديك مسودة عقار بالفعل. أكملها أو ألغها من نموذجها أولًا؛ لن نستبدلها بالرسالة."
          : "A property draft already exists. Finish or discard it in its form first; this message will not replace it.",
      );
      return;
    }
    startFlight.current = true;
    setPhase("preparing");
    try {
      await persist();
      if (
        !focused.current ||
        !canBeginMessageCapture(
          capture.getCurrentDraft(),
          capture.getCurrentCaptureDetails(),
        )
      )
        throw Error("CAPTURE_CHANGED");
      const details = capture.updateCaptureDetails({
        ...(selected.floorUse ? { floorUse: selected.floorUse } : {}),
        ...(subtype ? { apartmentSubtype: subtype } : {}),
      });
      const updated =
        details &&
        capture.updateDraft({
          propertyType: selected.propertyType,
          apartmentSubtype: subtype,
          transaction,
          listingTitle: title.trim() || undefined,
          privateNotes: privateMessageNote(text),
        });
      if (!updated) throw Error("DRAFT_BLOCKED");
      setPhase("staging");
    } catch {
      startFlight.current = false;
      setPhase("idle");
      setError(
        ar
          ? "تعذر حفظ المسودة. أعد المحاولة؛ لم يُسجّل عقار."
          : "The draft could not be saved. Retry; no property was created.",
      );
    }
  };
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
  const copy = (a: string, e: string) => (ar ? a : e);
  return (
    <NextPage
      title={copy("راجع العرض الذي وصلك", "Review an incoming offer")}
      back={back}
      subtitle={copy(
        "الرسالة تُحفظ كملاحظة خاصة، ثم تكمل نموذج العقار الأصلي. راجع النوع والسعر والمنطقة بنفسك قبل الحفظ.",
        "The message stays a private note. Continue in the original property form and confirm type, price and area yourself.",
      )}
    >
      <NextSurface title={copy("الرسالة الأصلية", "Original message")}>
        <TextInput
          testID="intake-message"
          accessibilityLabel={copy("الرسالة الأصلية", "Original message")}
          editable={phase === "idle"}
          multiline
          value={text}
          onChangeText={(value) => {
            transferred.current = false;
            setText(value);
          }}
          placeholder={copy("الصق نص العرض هنا…", "Paste the offer here…")}
          style={[style, { minHeight: 160, textAlignVertical: "top" }]}
        />
        <Text
          style={{
            color: n.muted,
            fontFamily: fonts.regular,
            lineHeight: 22,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {copy(
            "قد تحتوي الرسالة على رقم المالك. لن نضع نصها في الوصف العام أو معاينة المشاركة.",
            "Messages can contain owner details. The original text is excluded from the public description and share preview.",
          )}
        </Text>
      </NextSurface>
      <NextSurface title={copy("أكد الأساسيات", "Confirm the basics")}>
        <TextInput
          accessibilityLabel={copy(
            "عنوان العرض — اختياري",
            "Listing title — optional",
          )}
          editable={phase === "idle"}
          value={title}
          onChangeText={setTitle}
          placeholder={copy(
            "عنوان للعرض — اختياري",
            "Listing title — optional",
          )}
          style={style}
        />
        <NextFieldPair
          first={
            <CompactDropdown
              label={copy("المعاملة", "Transaction")}
              options={["rent", "sale"].map((value) => ({
                value,
                label:
                  value === "rent"
                    ? copy("للإيجار", "For rent")
                    : copy("للبيع", "For sale"),
                selected: transaction === value,
              }))}
              onSelect={(v) => {
                if (phase === "idle" && (v === "rent" || v === "sale")) {
                  setTransaction(v);
                  if (v === "rent" && choice === "commercial_complex")
                    setChoice("office");
                }
              }}
            />
          }
          second={
            <CompactDropdown
              label={copy("نوع العقار", "Property type")}
              options={getPropertyTypeChoices("all", transaction).map(
                (value) => ({
                  value,
                  label: getPropertyTypeChoiceLabel(
                    value,
                    language,
                    t(
                      `propertyType.${canonicalPropertyTypeChoice(value).propertyType}`,
                    ),
                  ),
                  selected: value === choice,
                }),
              )}
              onSelect={(v) => {
                if (
                  phase === "idle" &&
                  getPropertyTypeChoices("all", transaction).includes(
                    v as PropertyTypeChoice,
                  )
                )
                  setChoice(v as PropertyTypeChoice);
              }}
            />
          }
        />
        <Text
          style={{
            color: n.muted,
            fontFamily: fonts.regular,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {copy(
            "«شقة» تفتح نموذج الشقة العادية. للاستوديو استخدم إضافة عقار من الرئيسية.",
            "Apartment opens the standard apartment form. Use Add property on Home for the original studio form.",
          )}
        </Text>
      </NextSurface>
      {error ? (
        <Text
          accessibilityRole="alert"
          selectable
          style={{
            color: n.red,
            fontFamily: fonts.regular,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {error}
        </Text>
      ) : null}
      <Button
        title={copy("أكمل في نموذج العقار", "Continue in property form")}
        disabled={
          !text.trim() ||
          !capture.isReady ||
          capture.draftLoadFailed ||
          phase !== "idle"
        }
        loading={phase !== "idle"}
        onPress={() => void begin()}
      />
      <Button
        variant="outline"
        disabled={phase !== "idle"}
        title={copy("فتح مسودة العقار الحالية", "Open current property draft")}
        onPress={async () => {
          try {
            await persist();
            router.push("/capture" as never);
          } catch {
            setError(
              copy(
                "تعذر حفظ الرسالة. أعد المحاولة.",
                "Could not retain the message. Please retry.",
              ),
            );
          }
        }}
      />
    </NextPage>
  );
}
