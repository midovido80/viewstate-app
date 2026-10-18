import { Text, View } from 'react-native';
import { ChoiceChip } from '@/components/ChoiceChip';
import { DEMO_NEARBY_SERVICES } from '@/services/propertyDemoCatalog';

export function NearbyServicesSelector({ values, onChange, language, color, fontFamily }: {
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
  language: 'en' | 'ar';
  color: string;
  fontFamily: string;
}) {
  return <View style={{ gap: 10, marginTop: 12 }} testID="nearby-services-section">
    <Text style={{ color, fontFamily, textAlign: language === 'ar' ? 'right' : 'left' }}>{language === 'ar' ? 'الخدمات القريبة' : 'Nearby services'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', direction: language === 'ar' ? 'rtl' : 'ltr', gap: 8 }}>
      {DEMO_NEARBY_SERVICES.map(item => <ChoiceChip key={item.id} label={item.label[language === 'ar' ? 1 : 0]} selected={values.includes(item.id)}
        onPress={() => onChange(values.includes(item.id) ? values.filter(id => id !== item.id) : [...values, item.id])} testID={`nearby-service-${item.id}`} role="checkbox" />)}
    </View>
  </View>;
}
