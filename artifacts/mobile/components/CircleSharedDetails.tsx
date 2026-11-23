import { Modal, ScrollView, Text, View } from 'react-native';
import type { Property, PropertyDetailField, SeekerRequirement } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { useI18n, type Translations } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice } from '@/constants/market';
import { propertyDetailLabels, formatPropertyDetailValue } from '@/services/propertyDetailPresentation';
import { getRequirementDetailsRows } from '@/services/requirementDetailsPresentation';

export function CircleSharedDetails({ property, requirement, onClose }: {
  property?: Property;
  requirement?: SeekerRequirement;
  onClose: () => void;
}) {
  const { language, isRTL, fonts, t } = useI18n();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const ar = language === 'ar';
  const translate = (key: string) => t(key as keyof Translations);
  const rows = requirement
    ? getRequirementDetailsRows(requirement, language, translate).filter(row => row.section !== 'notes')
    : [];
  const title = requirement
    ? ar ? 'متطلبات المطابقة' : 'Matched requirements'
    : ar ? 'مواصفات العقار المشارك' : 'Shared listing details';

  if (property) {
    const area = getAreaById(property.core.locationArea.id);
    const offer = property.activeOffer;
    const price = offer.transaction === 'rent' ? offer.rentalPrice : offer.salePrice;
    rows.push(
      { section: 'overview', field: 'type', label: ar ? 'نوع العقار' : 'Property type', value: translate(`propertyType.${property.core.propertyType}`) },
      { section: 'location', field: 'area', label: ar ? 'المنطقة' : 'Area', value: area?.[language] ?? property.core.locationArea.id },
      { section: 'overview', field: 'price', label: ar ? 'السعر' : 'Price', value: formatPrice(price.amount, price.currencyCode, language) },
    );
    if (property.areaSquareMeters !== undefined) rows.push({
      section: 'specifications', field: 'squareMeters', label: ar ? 'المساحة' : 'Size', value: `${property.areaSquareMeters} ${ar ? 'م²' : 'm²'}`,
    });
    for (const [key, value] of Object.entries(property.typeDetails ?? {})) {
      // Titles, private text, contacts, precise location and files have no display path here.
      if (['clarification', 'commercialActivity', 'intendedUse'].includes(key)
        || !Object.prototype.hasOwnProperty.call(propertyDetailLabels, key) || value == null) continue;
      const field = key as PropertyDetailField;
      rows.push({ section: 'specifications', field, label: propertyDetailLabels[field][ar ? 1 : 0], value: formatPropertyDetailValue(field, value, language) });
    }
  }

  return <Modal visible={Boolean(property || requirement)} animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: 16, gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 20, textAlign: isRTL ? 'right' : 'left' }}>{title}</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 14 }}>
          {rows.map(row => <View key={`${row.section}:${row.field}`} style={{ paddingVertical: 10, gap: 3, borderBottomWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{row.label}</Text>
            <Text style={{ color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{row.value}</Text>
          </View>)}
        </View>
      </ScrollView>
      <Button onPress={onClose} title={ar ? 'إغلاق' : 'Close'} />
    </View>
  </Modal>;
}
