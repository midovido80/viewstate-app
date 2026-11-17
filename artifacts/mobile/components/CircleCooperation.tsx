import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Action, AssistantText } from '@/components/assistant/ui';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

type Purpose = 'availability' | 'viewing' | 'fit';
type Terms = 'agree_first' | 'split_evenly';
export type CooperationAction = 'accept' | 'decline' | 'close' | 'confirm';
export interface Cooperation {
  id: string;
  match_id: string;
  sender_id: string;
  recipient_id: string;
  publisher_id: string;
  requester_confirmed: boolean;
  publisher_confirmed: boolean;
  source_key: string | null;
  actionable: boolean;
  purpose: Purpose;
  terms: Terms | '';
  status: 'pending' | 'accepted' | 'declined' | 'closed' | 'completed';
}

export function CircleCooperationRequest({ busy, onClose, onSend }: {
  busy: boolean;
  onClose: () => void;
  onSend: (purpose: Purpose, terms: Terms) => void;
}) {
  const { language } = useI18n();
  const colors = useColors();
  const L = (ar: string, en: string) => language === 'ar' ? ar : en;
  const [purpose, setPurpose] = useState<Purpose>('viewing');
  const [terms, setTerms] = useState<Terms>('agree_first');
  const purposes: Record<Purpose, string> = {
    availability: L('استفسار عن التوفر', 'Check availability'),
    viewing: L('تنسيق معاينة', 'Arrange a viewing'),
    fit: L('مناقشة توافق العميل', 'Discuss the match'),
  };
  const proposals: Record<Terms, string> = {
    agree_first: L('نتفق على العمولة أولًا', 'Agree on commission first'),
    split_evenly: L('اقتراح: مناصفة العمولة', 'Propose splitting commission evenly'),
  };
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: '#14233a77', justifyContent: 'center', padding: 20 }}>
      <ScrollView style={{ maxHeight: '85%', width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: colors.card, borderRadius: 18 }}
        contentContainerStyle={{ padding: 20, gap: 10 }}>
        <AssistantText bold>{L('طلب تعاون', 'Request cooperation')}</AssistantText>
        <AssistantText>{L('الغرض من التواصل', 'Purpose')}</AssistantText>
        {(Object.keys(purposes) as Purpose[]).map(key => <Action key={key} label={purposes[key]}
          disabled={busy} tone={purpose === key ? 'primary' : 'secondary'} onPress={() => setPurpose(key)} />)}
        <AssistantText>{L('مقترح اتفاق التعاون', 'Proposed terms')}</AssistantText>
        {(Object.keys(proposals) as Terms[]).map(key => <Action key={key} label={proposals[key]}
          disabled={busy} tone={terms === key ? 'primary' : 'secondary'} onPress={() => setTerms(key)} />)}
        <AssistantText>{L('قبول الطلب يُبقي بيانات العميل ومصدر العقار خاصة.', 'Accepting keeps client and property-source details private.')}</AssistantText>
        <Action label={L('إرسال طلب التعاون', 'Send request')} disabled={busy} tone="primary" onPress={() => onSend(purpose, terms)} />
        <Action label={L('إلغاء', 'Cancel')} disabled={busy} onPress={onClose} />
      </ScrollView>
    </View>
  </Modal>;
}

export function CircleCooperationCard({ entry, owner, busy, onAction, onUpdateListing }: {
  entry: Cooperation;
  owner: string;
  busy: boolean;
  onAction: (action: CooperationAction) => void;
  onUpdateListing: () => void;
}) {
  const { language } = useI18n();
  const L = (ar: string, en: string) => language === 'ar' ? ar : en;
  const confirmed = owner === entry.publisher_id ? entry.publisher_confirmed : entry.requester_confirmed;
  const status = {
    pending: L('بانتظار الرد', 'Awaiting response'),
    accepted: confirmed ? L('بانتظار تأكيد الطرف الآخر', 'Awaiting the other broker’s confirmation') : L('تعاون مقبول', 'Cooperation accepted'),
    declined: L('تم الاعتذار', 'Declined'),
    closed: L('أُغلق دون اتفاق', 'Closed without agreement'),
    completed: L('تمت الصفقة', 'Deal completed'),
  }[entry.status];
  const purpose = {
    availability: L('استفسار عن التوفر', 'Check availability'),
    viewing: L('تنسيق معاينة', 'Arrange a viewing'),
    fit: L('مناقشة توافق العميل', 'Discuss the match'),
  }[entry.purpose];
  return <View style={{ gap: 6 }}>
    <AssistantText bold>{entry.sender_id === owner ? L('طلب صادر', 'Sent request') : L('طلب وارد', 'Received request')} · {status}</AssistantText>
    <AssistantText>{purpose}</AssistantText>
    {entry.terms !== '' && <AssistantText>{entry.terms === 'split_evenly'
      ? L('مناصفة العمولة', 'Split commission evenly') : L('الاتفاق على العمولة أولًا', 'Agree on commission first')}</AssistantText>}
    {entry.actionable && entry.status === 'pending' && entry.recipient_id === owner && <>
      <Action label={L('قبول التعاون', 'Accept cooperation')} disabled={busy} tone="primary" onPress={() => onAction('accept')} />
      <Action label={L('اعتذار', 'Decline')} disabled={busy} onPress={() => onAction('decline')} />
    </>}
    {entry.actionable && entry.status === 'accepted' && <>
      {!confirmed && <Action label={L('تأكيد إتمام الصفقة', 'Confirm deal completed')} disabled={busy} tone="primary" onPress={() => onAction('confirm')} />}
      <Action label={L('إغلاق دون اتفاق', 'Close without agreement')} disabled={busy} onPress={() => onAction('close')} />
    </>}
    {entry.status === 'completed' && entry.source_key && entry.publisher_id === owner && <Action
      label={L('تحديث حالة العقار', 'Update listing status')} disabled={busy} onPress={onUpdateListing} />}
  </View>;
}
