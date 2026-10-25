import { useState } from 'react';
import { Text, View } from 'react-native';
import type { MatchResult, Property, SeekerRequirement } from '@workspace/property-domain';
import { PropertyFormCard } from '@/components/PropertyFormCard';
import { Button } from '@/components/Button';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { getAreaById } from '@/constants/kuwait-areas';
import { getSavedPropertyTypeLabel } from '@/services/savedPropertyClassification';
import { matchingCategoryLabel, matchingCriterionLabel, matchingComparisonRows, matchingExplanationText } from '@/services/matchingPresentation';
import { formatPrice, formatRentalPrice } from '@/constants/market';

export function MatchingResultCard({ result, rank, property, requirement, personName, onPress, onViewRequirement, onReplace, busy }: {
  result: MatchResult; rank: number; property?: Property; requirement: SeekerRequirement;
  personName?: string; onPress: () => void; onViewRequirement?: () => void; onReplace?: () => void; busy?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { language, isRTL, fonts, t } = useI18n(); const colors = useColors(); const ar = language === 'ar';
  const issues = result.explanations.filter(item => item.status === 'not_met');
  const unknowns = result.explanations.filter(item => item.status === 'unknown');
  const matched = result.explanations.filter(item => item.status === 'matched').length;
  const rows = matchingComparisonRows(result, requirement, property, language);
  const visibleRows = expanded ? rows : rows.slice(0, 5);
  const area = property ? getAreaById(property.core.locationArea.id) : undefined;
  const style = { color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' as const : 'left' as const };
  return <PropertyFormCard title={`${rank}. ${matchingCategoryLabel(result.category, language)}`} icon="target" testID={`matching-result-${result.propertyId}`}>
    <Text testID="matching-card-client" style={{ ...style, color: '#173F78', fontFamily: fonts.bold }}>{personName || (ar ? 'طلب مطابقة سريع' : 'Quick matching request')} · {requirement.purpose === 'rent' ? ar ? 'مطلوب للإيجار' : 'Rental request' : ar ? 'مطلوب للشراء' : 'Purchase request'}</Text>
    <Text style={{ ...style, fontFamily: fonts.semiBold, fontSize: 16 }}>{property ? getSavedPropertyTypeLabel(property, language, t(`propertyType.${property.core.propertyType}`)) : ar ? 'عقار مرشح' : 'Suggested property'} · {area?.[language] ?? (ar ? 'المنطقة غير معروفة' : 'Unknown area')}</Text>
    {property && <Text style={style}>{property.activeOffer.transaction === 'rent' ? formatRentalPrice(property.activeOffer.rentalPrice.amount, property.activeOffer.rentalPrice.currencyCode, property.activeOffer.rentalPeriodId, language, t) : formatPrice(property.activeOffer.salePrice.amount, property.activeOffer.salePrice.currencyCode, language)}</Text>}
    <View testID="matching-comparison-table" style={{ gap: 4 }}>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', padding: 6, backgroundColor: '#EFF6FF' }}>{(ar ? ['البند', 'طلب العميل', 'العقار', 'الحالة'] : ['Field', 'Client request', 'Property', 'Status']).map(label => <Text key={label} style={{ ...style, flex: 1, fontFamily: fonts.semiBold, fontSize: 11 }}>{label}</Text>)}</View>
      {visibleRows.map(row => <View key={row.field} testID={`matching-compare-${row.field}`} style={{ flexDirection: isRTL ? 'row-reverse' : 'row', paddingVertical: 5, borderBottomWidth: 1, borderColor: '#E2E8F0', gap: 4 }}>{[row.label, row.requested, row.offered, row.statusLabel].map((value, index) => <Text key={index} style={{ ...style, flex: 1, minWidth: 0, fontSize: 11, lineHeight: 17, color: row.status === 'unknown' && index === 3 ? '#946200' : colors.foreground }}>{value}</Text>)}</View>)}
    </View>
    {issues.slice(0, 2).map(item => <Text key={item.criterion} style={style}>{matchingExplanationText(item, language)}</Text>)}
    {result.priceAmount < requirement.budget.minimum && <Text testID="matching-below-budget" style={style}>{ar ? 'السعر أقل من بداية النطاق المسجل بـ' : 'Price is below the recorded range by '}{formatPrice(requirement.budget.minimum - result.priceAmount, requirement.budget.currencyCode, language)}.</Text>}
    {unknowns.length > 0 && <Text testID="matching-missing-summary" style={{ ...style, color: '#946200' }}>{ar ? 'غير مسجل: ' : 'Not recorded: '}{unknowns.slice(0, 2).map(item => matchingCriterionLabel(item.criterion, language)).join('، ')}{unknowns.length > 2 ? ar ? `، و${unknowns.length - 2} بنود أخرى` : `, and ${unknowns.length - 2} more` : ''}</Text>}
    <Text style={{ ...style, color: colors.mutedForeground, fontSize: 12 }}>{ar ? `متوافق ${matched} · مختلف ${result.differenceCount} · غير مسجل ${unknowns.length}` : `Meets ${matched} · Differs ${result.differenceCount} · Unknown ${unknowns.length}`}</Text>
    {(rows.length > 5) && <Button title={expanded ? ar ? 'اختصار المقارنة' : 'Collapse comparison' : ar ? 'عرض المقارنة كاملة' : 'Full comparison'} variant="outline" onPress={() => setExpanded(!expanded)} testID="matching-expand-comparison" />}
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8 }}>
      <Button title={ar ? 'عرض العقار' : 'View property'} onPress={onPress} disabled={busy} style={{ flex: 1 }} testID={`matching-open-${result.propertyId}`} />
      {onViewRequirement && <Button title={ar ? 'عرض الطلب' : 'View request'} onPress={onViewRequirement} disabled={busy} variant="outline" style={{ flex: 1 }} testID={`matching-request-${requirement.id}`} />}
      {onReplace && <Button title={ar ? 'استبدال' : 'Replace'} onPress={onReplace} disabled={busy} variant="outline" style={{ flex: 1 }} testID={`matching-replace-${result.propertyId}`} />}
    </View>
  </PropertyFormCard>;
}
