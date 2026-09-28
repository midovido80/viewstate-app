import { useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { getPropertySuccessRoutes } from '@/services/propertyDetailPresentation';

export default function SuccessScreen() {
  const router = useRouter();
  const navigationStartedRef = useRef(false);
  const {
    propertyCoreId,
    linkPersonId,
    basicCaptureFollowUp,
    basicApartmentFollowUp,
  } = useLocalSearchParams<{
    propertyCoreId?: string;
    linkPersonId?: string;
    basicCaptureFollowUp?: string;
    basicApartmentFollowUp?: string;
  }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL, fonts } = useI18n();
  const navigateOnce = (destination: string, replace = false) => {
    if (navigationStartedRef.current) return;
    navigationStartedRef.current = true;
    if (replace) router.replace(destination as never);
    else router.push(destination as never);
  };
  const destinations = getPropertySuccessRoutes(propertyCoreId);
  const showCaptureFollowUp = basicCaptureFollowUp === '1' || basicApartmentFollowUp === '1';

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
      <View style={[styles.iconWrap, { backgroundColor: colors.success }]}>
        <Feather name="check" size={42} color={colors.primaryForeground} />
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
      {showCaptureFollowUp && propertyCoreId ? (
        <>
          <Button
            title={t('summary.add_details')}
            onPress={() => navigateOnce(`/property/${encodeURIComponent(propertyCoreId)}/enrich`)}
            size="large"
            testID="btn-add-property-details"
          />
          <Button
            title={t('summary.later')}
            onPress={() => navigateOnce(destinations.home, true)}
            variant="outline"
            size="large"
            testID="btn-finish-later"
          />
        </>
      ) : propertyCoreId ? (
        <>
          <Button
            title={t('summary.view_property')}
            onPress={() => destinations.detail && navigateOnce(destinations.detail)}
            size="large"
            testID="btn-view-property"
          />
          <Button
            title={t('summary.view_properties')}
            onPress={() => destinations.properties && navigateOnce(destinations.properties)}
            variant="outline"
            size="large"
            testID="btn-view-properties"
          />
          <Button
            title={t('summary.done')}
            onPress={() => navigateOnce('/', true)}
            variant="outline"
            size="large"
            testID="btn-later"
          />
        </>
      ) : (
        <Button
          title={t('summary.done')}
          onPress={() => navigateOnce(linkPersonId ? `/person/${encodeURIComponent(linkPersonId)}` : '/', true)}
          variant="outline"
          size="large"
          testID="btn-later"
        />
      )}
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