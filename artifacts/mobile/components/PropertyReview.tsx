import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { useI18n } from '@/contexts/I18nContext';
import { choiceIcon } from '@/services/choicePresentation';

export function PropertyReviewProgress({ step, total }: { step: number; total: number }) {
  const { language, isRTL, fonts } = useI18n();
  return <View style={{ gap: 8, marginBottom: 16 }}>
    <View style={{ direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: '#64748B', fontFamily: fonts.medium }}>{language === 'ar' ? `الخطوة ${step} من ${total}` : `Step ${step} of ${total}`}</Text>
      <Text style={{ color: '#2474D6', fontFamily: fonts.semiBold }}>{language === 'ar' ? 'المراجعة' : 'Review'}</Text>
    </View>
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: step }} style={{ height: 5, borderRadius: 4, backgroundColor: '#DBEAFE', overflow: 'hidden' }}>
      <View style={{ height: 5, width: `${Math.min(100, step / total * 100)}%`, backgroundColor: '#2474D6', alignSelf: isRTL ? 'flex-end' : 'flex-start' }} />
    </View>
  </View>;
}

/** Read-only summary. Save, recovery, classification and routing stay with each journey. */
export function PropertyReview({ propertyLabel, intent, area, price, priceLabel, cadence, children, progress }: {
  propertyLabel: string; intent: string; area: string; price?: string; priceLabel: string; cadence?: string; children?: ReactNode; progress?: { step: number; total: number };
}) {
  const { language, isRTL, fonts } = useI18n();
  const align = isRTL ? 'right' : 'left';
  const row = { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const, direction: 'ltr' as const };
  return <View testID="property-review" style={{ gap: 16 }}>
    {progress && <PropertyReviewProgress {...progress} />}
    <View style={{ gap: 8, paddingVertical: 6 }}>
      <Text style={{ color: '#173F78', fontFamily: fonts.bold, fontSize: 24, textAlign: align }}>{language === 'ar' ? 'راجع بيانات العقار' : 'Review property details'}</Text>
      <Text style={{ color: '#64748B', fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, textAlign: align }}>{language === 'ar' ? 'تأكد من البيانات الأساسية قبل الحفظ' : 'Check the basic information before saving'}</Text>
    </View>
    <View style={styles.card}>
      <View style={[row, { alignItems: 'center', gap: 12, paddingBottom: 18 }]}>
        <View style={styles.typeIcon}><Feather name={/shop|محل/i.test(propertyLabel) ? 'shopping-bag' : choiceIcon(propertyLabel)} size={30} color="#173F78" /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Text testID="review-property-type" style={{ color: '#173F78', fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, textAlign: align }}>{propertyLabel}</Text>
          <View style={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}><Text testID="review-intent" style={{ color: '#173F78', fontFamily: fonts.medium, fontSize: 14, textAlign: align }}>{intent}</Text></View>
        </View>
      </View>
      <View style={[styles.factRow, row]}>
        <Feather name="map-pin" size={24} color="#2474D6" />
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: '#64748B', fontFamily: fonts.regular, fontSize: 14, textAlign: align }}>{language === 'ar' ? 'المنطقة' : 'Area'}</Text>
          <Text testID="review-area" style={{ color: '#173F78', fontFamily: fonts.semiBold, fontSize: 18, textAlign: align }}>{area || (language === 'ar' ? 'غير محددة' : 'Not specified')}</Text>
        </View>
      </View>
      <View style={[styles.factRow, row, { alignItems: 'center' }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: '#64748B', fontFamily: fonts.regular, fontSize: 14, textAlign: align }}>{priceLabel}</Text>
          <Text testID="review-price" style={{ color: '#173F78', fontFamily: fonts.bold, fontSize: 27, lineHeight: 36, textAlign: align }}>{price ?? '—'}</Text>
          {cadence ? <Text testID="review-cadence" style={{ color: '#64748B', fontFamily: fonts.medium, fontSize: 14, textAlign: align }}>{cadence}</Text> : null}
        </View>
        <Feather name={cadence ? 'calendar' : 'tag'} size={24} color="#64748B" />
      </View>
    </View>
    {children ? <View style={styles.card}><Text style={{ color: '#173F78', fontFamily: fonts.semiBold, fontSize: 17, textAlign: align, marginBottom: 10 }}>{language === 'ar' ? 'المواصفات المسجلة' : 'Entered details'}</Text>{children}</View> : null}
    <View style={[styles.card, row, { alignItems: 'flex-start', gap: 12 }]}>
      <Feather name="file-plus" size={26} color="#2474D6" />
      <View style={{ flex: 1, gap: 7 }}>
        <Text style={{ color: '#173F78', fontFamily: fonts.semiBold, fontSize: 17, textAlign: align }}>{language === 'ar' ? 'التفاصيل الإضافية' : 'Additional details'}</Text>
        <Text style={{ color: '#64748B', fontFamily: fonts.regular, fontSize: 15, lineHeight: 24, textAlign: align }}>{language === 'ar' ? 'يمكنك استكمال المواصفات والصور والموقع الدقيق بعد الحفظ.' : 'You can complete specifications, photos and the precise location after saving.'}</Text>
      </View>
    </View>
  </View>;
}

export function PropertyReviewFooter({ title, onPress, loading = false, disabled = false, testID }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean; testID: string }) {
  const { language, isRTL, fonts } = useI18n();
  const insets = useScreenInsets();
  return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
    <TouchableOpacity testID={testID} onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ busy: loading, disabled: disabled || loading }}
      style={[styles.save, { direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row', opacity: disabled || loading ? 0.55 : 1 }]}>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="save" size={22} color="#FFFFFF" />}
      <Text style={{ color: '#FFFFFF', fontFamily: fonts.semiBold, fontSize: 18, flexShrink: 1, textAlign: 'center' }}>{title}</Text>
    </TouchableOpacity>
    <Text style={{ color: '#64748B', fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{language === 'ar' ? 'يمكنك استكمال التفاصيل بعد الحفظ' : 'You can complete the details after saving'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 18, padding: 18 },
  typeIcon: { width: 58, height: 58, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  factRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', paddingTop: 16, marginTop: 4, paddingBottom: 12, alignItems: 'center', gap: 12 },
  footer: { backgroundColor: '#FFFFFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', paddingHorizontal: 18, paddingTop: 14, gap: 9 },
  save: { minHeight: 54, borderRadius: 12, backgroundColor: '#2474D6', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12 },
});
