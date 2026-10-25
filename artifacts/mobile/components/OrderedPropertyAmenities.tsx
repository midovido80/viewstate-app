import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { ChoiceGrid } from '@/components/ChoiceTile';
import { orderPropertyAmenities } from '@/services/propertyAmenityOrder';

/** Keep the two-column choices uninterrupted; counts and conditional controls follow. */
export function OrderedPropertyAmenities({ entries, extra }: {
  entries: readonly { field: string; content: ReactNode; details?: boolean }[];
  extra?: ReactNode;
}) {
  const ordered = orderPropertyAmenities(entries, entry => entry.field);
  const choices = ordered.filter(entry => !entry.details);
  const details = ordered.filter(entry => entry.details);
  return <View style={{ gap: 12 }}>
    {(choices.length > 0 || extra) && <ChoiceGrid columns={2} testID="ordered-amenity-choices">
      {choices.map(entry => <Fragment key={entry.field}>{entry.content}</Fragment>)}
      {extra}
    </ChoiceGrid>}
    {details.length > 0 && <View style={{ gap: 12 }} testID="ordered-amenity-details">
      {details.map(entry => <View key={entry.field} style={{ width: '100%', gap: 8 }}>{entry.content}</View>)}
    </View>}
  </View>;
}
