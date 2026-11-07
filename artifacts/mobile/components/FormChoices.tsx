import { FieldValidationContext } from '@/components/FormField';
import { fieldSurface } from '@/constants/formFields';
import React, {
  Children,
  Fragment,
  isValidElement,
  useState,
  useContext,
  type ReactNode,
} from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useI18n } from "@/contexts/I18nContext";
import { isNumericChoiceSet, nextDesign as n } from '@/constants/nextDesign';
import { Feather } from '@expo/vector-icons';
import { useColors } from "@/hooks/useColors";
import { ChoiceTile as LegacyTile, ChoiceCard } from "./ChoiceTile";
export { ChoiceCard };
/** Services are direct, reversible toggles; descriptive single-choice groups retain their picker. */
export function ChoiceTile(props: React.ComponentProps<typeof LegacyTile>) {
  const { isRTL, fonts } = useI18n();
  const colors = useColors();
  if (props.role === "button") return <LegacyTile {...props} />;
  const label = props.label.replace(/^✓\s*/, "");
  return <Pressable testID={props.testID} onPress={props.onPress}
    accessibilityRole={props.role ?? "checkbox"}
    accessibilityLabel={props.accessibilityLabel ?? label}
    accessibilityState={{ checked: !!props.selected }}
    style={{ minHeight: 44, maxWidth: '100%', borderWidth: 1, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center',
      backgroundColor: props.selected ? colors.primary : colors.card,
      borderColor: props.selected ? colors.primary : colors.border }}>
    <Text style={{ color: props.selected ? colors.primaryForeground : colors.foreground,
      fontFamily: fonts.medium, fontSize: 14, lineHeight: 21,
      textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr' }}>{label}</Text>
  </Pressable>;
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
  inlineLabel = false,
  title,
  testID,
}: {
  label?: string;
  title?: string;
  options: readonly DropdownOption[];
  onSelect?: (value: string) => void;
  multiple?: boolean;
  inlineLabel?: boolean;
  testID?: string;
}) {
  const [open, setOpen] = useState(false),
    { isRTL, language, fonts } = useI18n(),
    colors = useColors();
  const invalid = useContext(FieldValidationContext);
  const numeric = !multiple && isNumericChoiceSet(options.map(option => option.value));
  const selected = options.filter((o) => o.selected),
    align = isRTL ? ("right" as const) : ("left" as const);
  const text = {
    color: colors.foreground,
    fontFamily: fonts.regular,
    textAlign: align,
    writingDirection: isRTL ? ("rtl" as const) : ("ltr" as const),
    fontSize: 16,
    lineHeight: 24,
  };
  return (
    <View style={{ width: "100%", gap: 8, direction: "ltr", flexDirection: label && inlineLabel ? (isRTL ? "row-reverse" : "row") : "column", alignItems: label && inlineLabel ? "center" : undefined }}>
      {label && (
        <Text style={[text, { fontFamily: fonts.semiBold, flex: inlineLabel ? 2 : undefined }]}>{label}</Text>
      )}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={
          label ?? title ?? (language === "ar" ? "الاختيارات" : "Options")
        }
        accessibilityState={{ expanded: open }}
        onPress={() => { Keyboard.dismiss(); setOpen(true); }}
        style={({ pressed }) => ({
          ...fieldSurface({ active: open || pressed, invalid: !!invalid }),
          minHeight: 48,
          flex: label && inlineLabel ? 3 : undefined,
          paddingHorizontal: 12, paddingVertical: 10,
          direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center', gap: 8,
        })}
      >
        <Text style={[text, { flex: 1 }]}>
          {selected.map((o) => o.label).join("، ") ||
            (language === "ar" ? "اختر…" : "Choose…")}
        </Text>
        <Feather name="chevron-down" size={16} color={n.muted} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="none"
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
              width: "100%",
              maxWidth: 440,
              alignSelf: "center",
              maxHeight: "75%",
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 14,
              gap: 8,
            }}
          >
            <View style={{ direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text accessibilityRole="header" style={[text, { fontFamily: fonts.bold, flex: 1 }]}>{label || title || (language === 'ar' ? 'اختر' : 'Choose')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={language === 'ar' ? 'إغلاق الاختيارات' : 'Close options'} onPress={() => setOpen(false)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Feather name="x" size={20} color={n.muted} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={numeric ? { direction: "ltr", flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8 } : undefined}>
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
                    minHeight: 48,
                    width: numeric ? /^\d+$/.test(o.value) ? '22%' : '100%' : '100%',
                    flexGrow: numeric && /^\d+$/.test(o.value) ? 1 : 0,
                    borderRadius: numeric ? 10 : 0,
                    backgroundColor: o.selected ? n.soft : n.white,
                    borderWidth: numeric ? 1 : 0,
                    borderColor: o.selected ? n.blue : n.border,
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    direction: "ltr", flexDirection: isRTL ? "row-reverse" : "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={[text, { flex: 1, textAlign: numeric ? "center" : align, fontFamily: o.selected ? fonts.semiBold : fonts.regular }]}>{o.label}</Text>
                  {!numeric && <Text style={{ color: colors.primary }}>{o.selected ? "✓" : ""}</Text>}
                </Pressable>
              ))}
            </ScrollView>
            {multiple && <Pressable
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
            </Pressable>}
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
  const { isRTL } = useI18n();
  const items = flatten(children),
    choices = items.filter(
      (item) => item.type === ChoiceTile || item.type === ChoiceCard,
    );
  if (choices.length !== items.length || !choices.length || choices.some(item => item.type === ChoiceTile && (item.props as any).role !== "radio"))
    return (
      <View style={[{ flexDirection: "row", flexWrap: "wrap", direction: isRTL ? "rtl" : "ltr" }, style, { width: "100%", gap: 8 }]} testID={testID}>
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
