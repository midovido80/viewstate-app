import { Modal, ScrollView, Text, View } from 'react-native';
import {
  evaluateMatch,
  type Property,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { normalizeMyPropertyCandidate } from '@/services/myPropertiesMatchingSource';
import {
  matchingExplanationText,
  formatMatchingBudget,
} from '@/services/matchingPresentation';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { Button } from './Button';
import { PropertyFactStrip } from './PropertyVisualSummary';

export type CircleOpportunity = {
  id: string;
  property: Property;
  requirement: SeekerRequirement;
  ownProperty: boolean;
};
export function CircleMatchDetails({
  opportunity,
  onClose,
  onCooperate,
}: {
  opportunity: CircleOpportunity;
  onClose: () => void;
  onCooperate?: () => void;
}) {
  const { language, isRTL, fonts, t } = useI18n(),
    colors = useColors(),
    insets = useScreenInsets();
  const ar = language === 'ar',
    { property, requirement, ownProperty } = opportunity;
  const candidate = normalizeMyPropertyCandidate(property);
  const result = candidate
    ? evaluateMatch(requirement, candidate, { strictFields: ['location'] })
    : undefined;
  const offer = property.activeOffer;
  const price =
    offer.transaction === 'rent'
      ? formatRentalPrice(
          offer.rentalPrice.amount,
          offer.rentalPrice.currencyCode,
          offer.rentalPeriodId,
          language,
          t,
        )
      : formatPrice(
          offer.salePrice.amount,
          offer.salePrice.currencyCode,
          language,
        );
  const text = {
    color: colors.foreground,
    fontFamily: fonts.regular,
    textAlign: isRTL ? ('right' as const) : ('left' as const),
    lineHeight: 24,
  };
  const card = {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    borderRadius: 14,
    gap: 8,
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingHorizontal: 16,
          gap: 12,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            ...text,
            fontFamily: fonts.bold,
            fontSize: 23,
            lineHeight: 32,
          }}
        >
          {ar ? 'تفاصيل المطابقة' : 'Match details'}
        </Text>
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 16 }}>
          <View style={card}>
            <Text style={{ ...text, fontFamily: fonts.bold }}>
              {ownProperty
                ? ar
                  ? 'طلب عميل زميلك'
                  : 'Your colleague’s client request'
                : ar
                  ? 'طلب عميلك'
                  : 'Your client request'}
            </Text>
            <Text style={text}>
              {requirement.preferredAreaMode === 'all_kuwait'
                ? ar
                  ? 'كل مناطق الكويت'
                  : 'All Kuwait'
                : requirement.preferredAreaIds
                    .map((id) => getAreaById(id)?.[language] ?? id)
                    .join('، ')}
            </Text>
            <Text style={text}>
              {formatMatchingBudget(requirement, language)}
            </Text>
            {requirement.bedroomsMinimum !== undefined && (
              <Text style={text}>
                {ar ? 'غرف النوم المطلوبة: ' : 'Bedrooms needed: '}
                {requirement.bedroomsMinimum}
              </Text>
            )}
          </View>
          <View style={card}>
            <Text style={{ ...text, fontFamily: fonts.bold }}>
              {ownProperty
                ? ar
                  ? 'عقارك المشارك'
                  : 'Your shared property'
                : ar
                  ? 'عقار زميلك'
                  : 'Your colleague’s property'}
            </Text>
            <Text style={text}>
              {t(`propertyType.${property.core.propertyType}`)} •{' '}
              {getAreaById(property.core.locationArea.id)?.[language] ??
                property.core.locationArea.id}
            </Text>
            <Text style={text}>{price}</Text>
            <PropertyFactStrip property={property} compact />
          </View>
          <Text style={{ ...text, fontFamily: fonts.bold, fontSize: 18 }}>
            {ar ? 'ليش طابقناهم؟' : 'Why this match?'}
          </Text>
          {result?.explanations.map((item, index) => (
            <Text
              key={index}
              style={{
                ...text,
                color:
                  item.status === 'matched'
                    ? colors.foreground
                    : colors.mutedForeground,
              }}
            >
              {matchingExplanationText(item, language)}
            </Text>
          ))}
          <Text style={text}>
            {ar
              ? 'المعاينة والتوفر يحتاجون تأكيد من الزميل. بيانات العميل والمالك ما تنعرض في الدائرة.'
              : 'Confirm availability and viewing with your colleague. Client and owner details stay private.'}
          </Text>
        </ScrollView>
        {onCooperate ? (
          <Button
            title={ar ? 'طلب تعاون مع الزميل' : 'Request cooperation'}
            onPress={onCooperate}
          />
        ) : (
          <Text style={text}>
            {ar
              ? 'طلب التعاون موجود في قائمة الفرص.'
              : 'Cooperation request is available in Opportunities.'}
          </Text>
        )}
        <Button
          title={ar ? 'إغلاق' : 'Close'}
          variant="outline"
          onPress={onClose}
        />
      </View>
    </Modal>
  );
}
