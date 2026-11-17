import React from "react";
import { View, useWindowDimensions } from "react-native";
import { useI18n } from "@/contexts/I18nContext";
import {
  pairPropertyFields,
  stackPropertyFields,
} from "@/services/propertyFormLayout";
export interface PropertyGridField {
  id: string;
  content: React.ReactNode;
  fullWidth?: boolean;
}
/** Original fields remain mounted with stable IDs when width/font scale changes. */
export function PropertyFieldGrid({
  items,
}: {
  items: readonly PropertyGridField[];
}) {
  const { isRTL } = useI18n();
  const { width, fontScale } = useWindowDimensions();
  const stacked = stackPropertyFields(width, fontScale);
  return (
    <View
      testID="property-field-grid"
      style={{
        direction: "ltr",
        flexDirection: isRTL ? "row-reverse" : "row",
        flexWrap: "wrap",
        columnGap: 12,
        rowGap: 16,
      }}
    >
      {pairPropertyFields(items).flatMap((row) =>
        row.map((item) => (
          <View
            key={item.id}
            testID={`property-grid-${item.id}`}
            style={{
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: stacked || row.length === 1 ? "100%" : "45%",
              minWidth: 0,
            }}
          >
            {item.content}
          </View>
        )),
      )}
    </View>
  );
}
