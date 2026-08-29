import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

export default function SuccessScreen() {
  const router = useRouter();
  const { propertyCoreId, linkPersonId } = useLocalSearchParams<{ propertyCoreId?: string; linkPersonId?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL, fonts } = useI18n();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 24,
          paddingBottom: Math.max(insets.bottom, 20),
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
        <Feather name="check" size={42} color={colors.accentForeground} />
      </View>
      <Text
        style={[
          styles.title,
          { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' },
        ]}
      >
        {t('summary.success')}
      </Text>
      <Text
        style={[
          styles.detail,
          { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' },
        ]}
      >
        {t('summary.success_detail')}
      </Text>
      <View style={styles.spacer} />
      {propertyCoreId ? (
        <Button
          title={t('summary.add_details')}
          onPress={() => router.replace(`/property/${encodeURIComponent(propertyCoreId)}/enrich` as never)}
          size="large"
          testID="btn-add-details-now"
        />
      ) : null}
      <Button
        title={t('summary.done')}
        onPress={() => router.replace(linkPersonId ? `/person/${encodeURIComponent(linkPersonId)}` as never : '/' as never)}
        variant={propertyCoreId ? 'outline' : undefined}
        size="large"
        testID="btn-back-home"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 72,
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    marginBottom: 12,
  },
  detail: {
    fontSize: 16,
    lineHeight: 24,
  },
  spacer: {
    flex: 1,
  },
});