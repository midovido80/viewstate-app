import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { ChoiceGrid } from '@/components/ChoiceTile';
import { orderPropertyAmenities } from '@/services/propertyAmenityOrder';

export function OrderedPropertyAmenities({ entries }: {
  entries: readonly { field: string; content: ReactNode; details?: boolean }[];
}) {
  return <ChoiceGrid>{orderPropertyAmenities(entries, entry => entry.field).map(entry =>
    entry.details
      ? <View key={entry.field} style={{ width: '100%', gap: 8 }}>{entry.content}</View>
      : <Fragment key={entry.field}>{entry.content}</Fragment>
  )}</ChoiceGrid>;
}
