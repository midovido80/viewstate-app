import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { TextInput } from '@/components/FormField';
import { PhoneNumberText } from '@/components/PhoneNumberText';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { PHONE_COUNTRIES, phoneCountryMatches, type PhoneCountryCode } from '@/services/phoneEntry';

export function PhoneCountrySheet({ country, onClose, onSelect }: {
  country?: PhoneCountryCode; onClose(): void; onSelect(country: PhoneCountryCode): void;
}) {
  const { isRTL, fonts, t } = useI18n();
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PhoneCountryCode | undefined>(country);
  const items = PHONE_COUNTRIES.filter(item => phoneCountryMatches(item, t(item.translationKey), query));
  const align = isRTL ? 'right' : 'left';
  const layout = isRTL ? 'row-reverse' : 'row';
  const closeLabel = isRTL ? 'إغلاق اختيار الدولة' : 'Close country picker';

  return (
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} style={styles.scrim} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.card }]}>
        <View style={[styles.header, { flexDirection: layout }]}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground, fontFamily: fonts.bold, textAlign: align }]}>
            {isRTL ? 'اختيار الدولة' : 'Choose country'}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.close}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <TextInput value={query} onChangeText={setQuery} autoCorrect={false}
          accessibilityLabel={isRTL ? 'ابحث باسم الدولة أو الرمز' : 'Search by country or calling code'}
          placeholder={isRTL ? 'ابحث باسم الدولة أو الرمز' : 'Search by country or calling code'}
          style={{ textAlign: align, color: colors.foreground, fontFamily: fonts.regular }} testID="phone-country-search" />
        <FlatList data={items} keyExtractor={item => item.code} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={{ textAlign: align, color: colors.mutedForeground }}>{isRTL ? 'ما لقينا دولة بهذا البحث.' : 'No countries match this search.'}</Text>}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="radio" accessibilityLabel={t(item.translationKey) + ' +' + item.dialCode}
              accessibilityState={{ selected: selected === item.code }} onPress={() => setSelected(item.code)}
              style={[styles.option, { flexDirection: layout, borderColor: colors.border }]}
              testID={'phone-country-option-' + item.code}>
              <Feather name={selected === item.code ? 'check-circle' : 'circle'} size={20}
                color={selected === item.code ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={{ textAlign: align, color: colors.foreground, fontFamily: fonts.medium }}>{t(item.translationKey)}</Text>
                {!country && item.code === 'KW' && <Text style={{ textAlign: align, color: colors.mutedForeground, fontSize: 12 }}>{isRTL ? 'مقترحة' : 'Suggested'}</Text>}
              </View>
              <PhoneNumberText style={{ color: colors.mutedForeground, fontFamily: fonts.semiBold }}>{'+' + item.dialCode}</PhoneNumberText>
            </Pressable>
          )} />
        <Button title={isRTL ? 'تأكيد الاختيار' : 'Confirm country'} disabled={!selected}
          onPress={() => { if (selected) onSelect(selected); }} testID="phone-country-confirm" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  scrim: { flex: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 10, maxHeight: '90%' },
  header: { direction: 'ltr', alignItems: 'center', gap: 8 },
  heading: { fontSize: 20, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  option: { direction: 'ltr', alignItems: 'center', gap: 10, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
