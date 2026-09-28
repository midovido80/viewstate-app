import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';

/**
 * Compatibility deep link only. Enter the hydrated editor directly so the
 * user does not briefly see the detail presentation before editing.
 */
export default function PropertyEnrichmentRedirect() {
  const params = useLocalSearchParams<{ propertyCoreId?: string | string[] }>();
  const id = Array.isArray(params.propertyCoreId) ? params.propertyCoreId[0] : params.propertyCoreId;
  const router = useRouter();
  const colors = useColors();
  const redirected = useRef(false);

  useEffect(() => {
    if (!id || redirected.current) return;
    redirected.current = true;
    router.replace(`/property/${encodeURIComponent(id)}/edit?completion=enrichment` as never);
  }, [id, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}