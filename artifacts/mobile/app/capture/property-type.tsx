import { View, StyleSheet, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { CaptureHeader } from '@/components/CaptureHeader';
import { SelectCard } from '@/components/SelectCard';
import { Button } from '@/components/Button';
import { PROPERTY_TYPES } from '@workspace/property-domain';

export default function PropertyTypeScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { draft, updateDraft } = useCapture();
  const { t, fonts, isRTL } = useI18n();

  const handleNext = () => {
    if (draft.propertyType) {
      router.push('/capture/price' as any);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader step={2} totalSteps={4} />
      
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('propertyType.title')}</Text>
        
        {PROPERTY_TYPES.map(type => (
          <SelectCard 
            key={type}
            title={t(`propertyType.${type}` as keyof Translations)}
            selected={draft.propertyType === type}
            onSelect={() => updateDraft({ propertyType: type })}
            testID={`select-type-${type}`}
          />
        ))}
      </ScrollView>
      
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }]}>
        <Button 
          title={t('capture.next')} 
          onPress={handleNext} 
          disabled={!draft.propertyType}
          size="large"
          testID="btn-next"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    marginBottom: 32,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  }
});
