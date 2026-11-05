import { Text, View, useWindowDimensions } from "react-native";
import type { KitchenSpec } from "@workspace/property-domain";
import { CompactDropdown } from "./FormChoices";

import { useI18n } from "@/contexts/I18nContext";
const COUNT_OPTIONS = [0, 1, 2, 3] as const;
/** Count is array length; blank and explicit zero remain different. No defaults are invented. */
export function KitchenFields({
  value,
  onChange,
  commercial = false,
  scopeKey,
  onInvalidChange,
}: {
  value?: readonly KitchenSpec[];
  onChange: (value: readonly KitchenSpec[] | undefined) => void;
  commercial?: boolean;
  scopeKey: string;
  onInvalidChange?: (invalid: boolean) => void;
}) {
  const { language, isRTL, fonts } = useI18n(),
    { fontScale } = useWindowDimensions(),
    ar = language === "ar";
  const row = {
    flexDirection:
      fontScale > 1.4
        ? ("column" as const)
        : isRTL
          ? ("row-reverse" as const)
          : ("row" as const),
    gap: 6,
  };
  function update(index: number, field: keyof KitchenSpec, selected: string) {
    onChange(
      value?.map((item, i) =>
        i === index ? { ...item, [field]: selected } : item,
      ),
    );
  }
  const count = (
    <CompactDropdown
      inlineLabel={value?.length !== 1}
      label={ar ? "عدد المطابخ" : "Kitchens"}
      options={COUNT_OPTIONS.map(n => ({value: String(n), label: n === 0 ? (ar ? 'لا يوجد (0)' : 'None (0)') : String(n), selected: value?.length === n}))}
      testID="kitchen-count"
      onSelect={(raw) => {
        if (!raw) { onChange(undefined); onInvalidChange?.(false); return; }
        const count = Number(raw);
        if (!Number.isInteger(count) || count < 0 || count > 3) { onInvalidChange?.(true); return; }
        onInvalidChange?.(false);
        onChange(Array.from({length: count}, (_, i) => value?.[i] ?? {}));
      }}
    />
  );
  const field = (index: number, key: keyof KitchenSpec) => (
    <View key={key} style={{ flex: 1, minWidth: 0 }}>
      <CompactDropdown
        inlineLabel={!commercial && value?.length !== 1}
        label={
          key === "layout"
            ? ar
              ? "التصنيف"
              : "Layout"
            : key === "equipment"
              ? ar
                ? "التجهيز"
                : "Equipment"
              : ar
                ? "الاستخدام"
                : "Access"
        }
        options={(key === "layout"
          ? [
              ["regular", ar ? "عادي" : "Regular"],
              ["american", ar ? "أمريكي" : "American"],
              ["preparatory", ar ? "تحضيري" : "Preparatory"],
            ]
          : key === "equipment"
            ? [
                ["equipped", ar ? "مجهز" : "Equipped"],
                ["unequipped", ar ? "غير مجهز" : "Unequipped"],
              ]
            : [
                ["private", ar ? "خاص" : "Private"],
                ["shared", ar ? "مشترك" : "Shared"],
              ]
        ).map(([v, label]) => ({
          value: v,
          label,
          selected: value?.[index]?.[key] === v,
        }))}
        onSelect={(selected) => update(index, key, selected)}
      />
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      {value?.length === 1 ? (
        <>
          <View style={row}>
            <View style={{ flex: 1, minWidth: 0 }}>{count}</View>
            {field(0, "layout")}
            {field(0, "equipment")}
          </View>
          {commercial && field(0, "access")}
        </>
      ) : (
        <>
          {count}
          {value?.map((_, index) => (
            <View key={index} style={{ gap: 5 }}>
              <Text
                style={{
                  textAlign: isRTL ? "right" : "left",
                  fontFamily: fonts.semiBold,
                }}
              >
                {ar ? `المطبخ ${index + 1}` : `Kitchen ${index + 1}`}
              </Text>
              <View style={row}>
                {field(index, "layout")}
                {field(index, "equipment")}
                {commercial && field(index, "access")}
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
