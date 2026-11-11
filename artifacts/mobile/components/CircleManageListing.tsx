import { Modal, Pressable, Text, View } from 'react-native';
import type { Property } from '@workspace/property-domain';
import { Action, AssistantText } from '@/components/assistant/ui';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { listingStatus, type ListingStatus } from '@/services/propertyLifecycle';

interface Props {
  property: Property;
  title: string;
  busy: boolean;
  onClose: () => void;
  onStatus: (status: ListingStatus) => void;
  onWithdraw: () => void;
}

export function CircleManageListing({ property, title, busy, onClose, onStatus, onWithdraw }: Props) {
  const { language } = useI18n();
  const colors = useColors();
  const L = (ar: string, en: string) => language === 'ar' ? ar : en;
  const current = listingStatus(property);
  const rent = property.activeOffer.transaction === 'rent';
  const unavailable = rent ? 'rented' : 'sold';
  const label = {
    active: rent ? L('معروض للإيجار', 'Offered for rent') : L('معروض للبيع', 'Offered for sale'),
    rented: L('مؤجّر', 'Rented'),
    sold: L('مباع', 'Sold'),
    paused: L('موقوف', 'Paused'),
  }[current];
  return <Modal visible transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
    <View style={{ flex: 1, backgroundColor: '#14233a77', justifyContent: 'center', padding: 20 }}>
      <View accessibilityViewIsModal style={{
        width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: 18,
        backgroundColor: colors.card, padding: 20, gap: 12,
      }} testID="circle-manage-dialog">
        <View style={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AssistantText bold>{L('إدارة الإعلان', 'Manage listing')}</AssistantText>
            <AssistantText>{title}</AssistantText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={L('إغلاق', 'Close')} hitSlop={10}
            disabled={busy} onPress={onClose}><Text style={{ color: colors.foreground, fontSize: 24 }}>×</Text></Pressable>
        </View>
        <View style={{ borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 5 }}>
          <Text style={{ color: current === 'active' ? '#14674a' : colors.destructive, textAlign: language === 'ar' ? 'right' : 'left' }}>{label}</Text>
          <AssistantText>{current === 'active' ? L('معروض داخل الدائرة', 'Published in this circle')
            : L('متوقف عن الظهور للأعضاء', 'Hidden from members')}</AssistantText>
        </View>
        {current !== unavailable && <Action label={rent ? L('تحديث الحالة إلى مؤجّر', 'Mark as rented') : L('تحديث الحالة إلى مباع', 'Mark as sold')}
          disabled={busy} onPress={() => onStatus(unavailable)} testID="circle-manage-unavailable" />}
        <Action label={L('سحب الإعلان من الدائرة', 'Withdraw listing from circle')} tone="danger"
          disabled={busy} onPress={onWithdraw} testID="circle-manage-withdraw" />
        {current !== 'active' && <Action label={L('إعادة الحالة إلى متاح', 'Make available again')}
          disabled={busy} onPress={() => onStatus('active')} testID="circle-manage-reopen" />}
        <AssistantText>{L('السحب يوقف المشاركة والمطابقات المرتبطة. العقار يظل محفوظًا في مخزونك.',
          'Withdrawing stops sharing and related matches. The listing stays in your inventory.')}</AssistantText>
      </View>
    </View>
  </Modal>;
}
