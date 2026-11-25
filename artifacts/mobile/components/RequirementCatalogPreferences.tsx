import { Text } from "@/components/AppText";
import { RequirementServiceRow } from "@/components/RequirementServiceRows";
import { TextInput } from "@/components/FormField";
import { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import {
  APARTMENT_SUBTYPES,
  FURNISHING_VALUES,
  type CatalogPreference,
  type FloorUse,
  type PropertyDetailField,
  type PropertyType,
} from "@workspace/property-domain";
import { NumericQuickPick } from "@/components/NumericQuickPick";
import { ChoiceTile as ChoiceChip, ChoiceGrid } from "@/components/FormChoices";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/contexts/I18nContext";
import {
  getRequirementCatalogFields,
  parseRequirementCatalogNumber,
} from "@/services/requirementFieldMap";

const CHOICE_VALUES: Partial<Record<PropertyDetailField, readonly string[]>> = {
  apartmentSubtype: APARTMENT_SUBTYPES,
  furnishing: FURNISHING_VALUES,
  intendedUse: ["office", "retail", "warehouse", "residential"],
  commercialActivity: ["retail", "office", "restaurant", "clinic", "warehouse"],
  warehouseKind: ["industrial", "food"],
  warehouseLevels: ["basement", "ground"],
};
const CHOICE_LABELS: Record<string, readonly [string, string]> = {
  industrial: ["Industrial", "صناعي"],
  food: ["Food", "غذائي"],
  basement: ["Basement", "سرداب"],
  ground: ["Ground floor", "أرضي"],
  office: ["Office", "مكتب"],
  retail: ["Retail", "تجزئة"],
  warehouse: ["Warehouse", "مستودع"],
  residential: ["Residential", "سكني"],
  restaurant: ["Restaurant", "مطعم"],
  clinic: ["Clinic", "عيادة"],
};
type Props = {
  scopeKey: string;
  propertyType: PropertyType;
  floorUse?: FloorUse;
  values: readonly CatalogPreference[];
  onChange: (values: readonly CatalogPreference[]) => void;
  onInvalidChange?: (field: PropertyDetailField, invalid: boolean) => void;
  fields?: readonly PropertyDetailField[];
  inlineFeatures?: boolean;
};

export function RequirementCatalogPreferences({
  scopeKey,
  propertyType,
  floorUse,
  values,
  onChange,
  onInvalidChange,
  fields,
  inlineFeatures = false,
}: Props) {
  const colors = useColors();
  const { language, isRTL, fonts, t } = useI18n();
  const applicable = getRequirementCatalogFields(propertyType, floorUse);
  const definitions = fields
    ? fields.flatMap((field) =>
        applicable.filter((item) => item.field === field),
      )
    : applicable;
  const byField = new Map(values.map((value) => [value.field, value]));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    setDrafts({});
    return () =>
      definitions.forEach((definition) =>
        onInvalidChange?.(definition.field, false),
      );
  }, [scopeKey, propertyType, floorUse]);
  const update = (field: PropertyDetailField, value?: CatalogPreference) =>
    onChange([
      ...values.filter((item) => item.field !== field),
      ...(value ? [value] : []),
    ]);
  const clear = (field: PropertyDetailField) => {
    update(field);
    setDrafts((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    onInvalidChange?.(field, false);
  };
  const controls = definitions.map((definition) => {
    const { field, wanted } = definition;
    const current = byField.get(field);
    const label = definition.label[language === "ar" ? 1 : 0];
    const clearButton = (
      <TouchableOpacity
        onPress={() => clear(field)}
        accessibilityRole="button"
        accessibilityLabel={
          language === "ar" ? `مسح ${label}` : `Clear ${label}`
        }
        style={styles.clear}
      >
        <Text style={{ color: colors.mutedForeground }}>
          {language === "ar" ? "مسح" : "Clear"}
        </Text>
      </TouchableOpacity>
    );
    if (
      wanted?.storage === "catalogPreference" &&
      wanted.preferenceKind === "number"
    ) {
      const numericLabel =
        wanted.comparison === "minimum"
          ? language === "ar"
            ? `${label} (على الأقل)`
            : `${label} (at least)`
          : label;
      const changeNumber = (text: string) => {
        setDrafts((current) => ({ ...current, [field]: text }));
        const parsed = parseRequirementCatalogNumber(field, text);
        onInvalidChange?.(field, !parsed.ok);
        if (parsed.ok)
          parsed.preference ? update(field, parsed.preference) : clear(field);
      };
      if (
        definition.control === "count" ||
        definition.control === "numeric_quick_pick"
      )
        return (
          <View key={field} style={styles.field}>
            <NumericQuickPick
              inline
              scopeKey={`${scopeKey}:catalog:${field}`}
              label={numericLabel}
              value={
                drafts[field] ??
                (current?.kind === "number" ? String(current.value) : "")
              }
              onChangeText={changeNumber}
              onPendingValidityChange={(_, invalid) =>
                onInvalidChange?.(field, invalid)
              }
              testID={`requirement-preference-${field}`}
            />
            {clearButton}
          </View>
        );
      return (
        <View key={field} style={styles.field}>
          <Text
            style={[
              styles.label,
              { color: colors.foreground, fontFamily: fonts.semiBold },
            ]}
          >
            {numericLabel}
          </Text>
          <View style={styles.row}>
            <TextInput
              value={
                drafts[field] ??
                (current?.kind === "number" ? String(current.value) : "")
              }
              onChangeText={(text) => {
                setDrafts((current) => ({ ...current, [field]: text }));
                changeNumber(text);
              }}
              keyboardType="decimal-pad"
              testID={`requirement-preference-${field}`}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
            />
            {clearButton}
          </View>
        </View>
      );
    }
    if (definition.control === "boolean" || field.startsWith("has")) {
      const selected = current?.kind === "feature";
      const forbidden = selected && !current.value;
      if (inlineFeatures)
        return (
          <RequirementServiceRow
            key={field}
            label={label}
            state={forbidden ? "excluded" : selected ? "required" : "unset"}
            onPress={() =>
              selected && !forbidden
                ? clear(field)
                : update(field, { field, kind: "feature", value: true })
            }
            onExclude={() =>
              forbidden
                ? clear(field)
                : update(field, { field, kind: "feature", value: false })
            }
            testID={`requirement-preference-${field}`}
          />
        );
      return (
        <ChoiceChip
          key={field}
          optionId={field}
          label={`${selected ? "✓ " : ""}${label}${forbidden ? (language === "ar" ? " · يجب ألا تتوفر" : " · Must not have") : ""}`}
          selected={selected}
          onPress={() =>
            selected
              ? clear(field)
              : update(field, { field, kind: "feature", value: true })
          }
          testID={`requirement-preference-${field}`}
          role="checkbox"
        />
      );
    }
    const options = CHOICE_VALUES[field];
    if (!options) return null;
    return (
      <View key={field} style={styles.field}>
        <Text
          style={[
            styles.label,
            { color: colors.foreground, fontFamily: fonts.semiBold },
          ]}
        >
          {label}
        </Text>
        <ChoiceGrid>
          {options.map((option) => (
            <ChoiceChip
              key={option}
              optionId={`${field}:${option}`}
              role="radio"
              selected={current?.kind === "choice" && current.value === option}
              onPress={() =>
                current?.kind === "choice" && current.value === option
                  ? clear(field)
                  : update(field, { field, kind: "choice", value: option })
              }
              label={
                field === "furnishing"
                  ? t(`enrich.furnishing.${option}` as any)
                  : field === "apartmentSubtype"
                    ? t(`enrich.apartment_subtype.${option}` as any)
                    : (CHOICE_LABELS[option]?.[language === "ar" ? 1 : 0] ??
                      option)
              }
            />
          ))}
        </ChoiceGrid>
      </View>
    );
  });
  const onlyFeatures = definitions.every(
    (definition) =>
      definition.control === "boolean" || definition.field.startsWith("has"),
  );
  return inlineFeatures && onlyFeatures ? (
    <>{controls}</>
  ) : (
    <ChoiceGrid style={[styles.wrap, { direction: isRTL ? "rtl" : "ltr" }]}>
      {controls}
    </ChoiceGrid>
  );
}
const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: { width: "100%", gap: 6 },
  label: { fontSize: 14 },
  clear: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 },
  input: {
    flex: 1,
    minWidth: 120,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
});
