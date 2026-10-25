import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { useI18n } from '@/contexts/I18nContext';

export function MatchingConfirmationList({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false); const { language, fonts } = useI18n();
  if (!count) return null;
  return <View style={{ gap: 8 }}>
    <Button title={language === 'ar' ? `${open ? 'إخفاء' : 'عرض'} ${count} مرشحين يحتاجون تأكيدًا` : `${open ? 'Hide' : 'Show'} ${count} candidates needing confirmation`} variant="outline" onPress={() => setOpen(!open)} testID="matching-toggle-confirmations" />
    {open && <><Text style={{ color: '#946200', fontFamily: fonts.medium }}>{language === 'ar' ? 'بيانات مؤثرة ناقصة — ليست ترشيحات جاهزة' : 'Important facts are missing — not ready suggestions'}</Text>{children}</>}
  </View>;
}
