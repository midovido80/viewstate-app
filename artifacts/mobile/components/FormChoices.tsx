import React, {
  Children,
  Fragment,
  isValidElement,
  useState,
  type ReactNode,
} from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import { ChoiceTile as LegacyTile, ChoiceCard } from "./ChoiceTile";
export { ChoiceCard };
export function ChoiceTile(props: React.ComponentProps<typeof LegacyTile>) {
  return props.role === "button" ? (
    <LegacyTile {...props} />
  ) : (
    <CompactDropdown
      label={props.label}
      multiple
      options={[
        {
          value: props.optionId ?? props.label,
          label: props.label.replace(/^✓\s*/, ""),
          selected: props.selected,
          onPress: props.onPress,
          testID: props.testID,
        },
      ]}
    />
  );
}
export interface DropdownOption {
  value: string;
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}
/** Native modal list: full labels, independent multi-selection, no icon tiles. */
export function CompactDropdown({
  label,
  options,
  onSelect,
  multiple = false,
  testID,
}: {
  label?: string;
  options: readonly DropdownOption[];
  onSelect?: (value: string) => void;
  multiple?: boolean;
  testID?: string;
}) {
  const [open, setOpen] = useState(false),
    { isRTL, language, fonts } = useI18n(),
    colors = useColors();
  const selected = options.filter((o) => o.selected),
    align = isRTL ? ("right" as const) : ("left" as const);
  const text = {
    color: colors.foreground,
    fontFamily: fonts.regular,
    textAlign: align,
    writingDirection: isRTL ? ("rtl" as const) : ("ltr" as const),
    fontSize: 14,
    lineHeight: 21,
  };
  return (
    <View style={{ width: "100%", gap: 5 }}>
      {label && (
        <Text style={[text, { fontFamily: fonts.semiBold }]}>{label}</Text>
      )}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={
          label ?? (language === "ar" ? "الاختيارات" : "Options")
        }
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={{
          minHeight: 46,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          backgroundColor: colors.card,
          paddingHorizontal: 12,
          paddingVertical: 11,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text style={[text, { flex: 1 }]}>
          {selected.map((o) => o.label).join("، ") ||
            (language === "ar" ? "اختر…" : "Choose…")}
        </Text>
        <Text style={{ color: colors.primary }}>⌄</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{ flex: 1, justifyContent: "center", padding: 20 }}
          accessibilityViewIsModal
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={language === "ar" ? "إغلاق" : "Close"}
            onPress={() => setOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#142D5066",
            }}
          />
          <View
            style={{
              maxHeight: "75%",
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 14,
              gap: 8,
            }}
          >
            {label && (
              <Text style={[text, { fontFamily: fonts.bold }]}>{label}</Text>
            )}
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  testID={o.testID}
                  accessibilityRole={multiple ? "checkbox" : "radio"}
                  accessibilityState={{ checked: !!o.selected }}
                  onPress={() => {
                    o.onPress?.();
                    onSelect?.(o.value);
                    if (!multiple) setOpen(false);
                  }}
                  style={{
                    minHeight: 46,
                    paddingVertical: 11,
                    paddingHorizontal: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    flexDirection: isRTL ? "row-reverse" : "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={[text, { flex: 1 }]}>{o.label}</Text>
                  <Text style={{ color: colors.primary }}>
                    {o.selected ? "✓" : ""}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={{
                padding: 12,
                backgroundColor: colors.primary,
                borderRadius: 9,
              }}
            >
              <Text style={[text, { color: "white", textAlign: "center" }]}>
                {language === "ar" ? "تم" : "Done"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
function flatten(nodes: ReactNode): React.ReactElement[] {
  return Children.toArray(nodes).flatMap((node) =>
    !isValidElement(node)
      ? []
      : node.type === Fragment
        ? flatten((node.props as { children: ReactNode }).children)
        : [node],
  );
}
/** Opt-in replacement used only in capture/edit forms; filter controls stay unchanged. */
export function ChoiceGrid({
  children,
  testID,
  style,
}: {
  children: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  columns?: number;
  gap?: number;
}) {
  const items = flatten(children),
    choices = items.filter(
      (item) => item.type === ChoiceTile || item.type === ChoiceCard,
    );
  if (choices.length !== items.length || !choices.length)
    return (
      <View style={[style, { width: "100%", gap: 8 }]} testID={testID}>
        {children}
      </View>
    );
  const options = choices.map((item, i) => {
    const p = item.props as any;
    return {
      value: String(item.key ?? i),
      label: p.label ?? p.title,
      selected: p.selected,
      onPress: p.onPress ?? p.onSelect,
      testID: p.testID,
    };
  });
  const multiple = choices.some(
    (item) => item.type !== ChoiceCard && (item.props as any).role !== "radio",
  );
  return (
    <CompactDropdown options={options} multiple={multiple} testID={testID} />
  );
}
