import { PropertyFormCard } from '@/components/PropertyFormCard';
import { Text, View } from 'react-native';
import { ChoiceTile as ChoiceChip, ChoiceGrid } from '@/components/ChoiceTile';
import { DEMO_NEARBY_SERVICES } from '@/services/propertyDemoCatalog';

export function NearbyServicesSelector({ values, onChange, language, color, fontFamily }: {
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
  language: 'en' | 'ar';
  color: string;
  fontFamily: string;
}) {
  return <PropertyFormCard title={language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'} icon="map-pin" testID="nearby-services-section">

    <ChoiceGrid style={{ flexDirection: 'row', flexWrap: 'wrap', direction: language === 'ar' ? 'rtl' : 'ltr', gap: 8 }}>
      {DEMO_NEARBY_SERVICES.map(item => <ChoiceChip key={item.id} optionId={item.id} label={item.label[language === 'ar' ? 1 : 0]} selected={values.includes(item.id)}
        onPress={() => onChange(values.includes(item.id) ? values.filter(id => id !== item.id) : [...values, item.id])} testID={`nearby-service-${item.id}`} role="checkbox" />)}
    </ChoiceGrid>
  </PropertyFormCard>;
}
