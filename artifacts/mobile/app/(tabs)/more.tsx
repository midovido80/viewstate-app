import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { PrimaryTabHeader } from '@/components/PrimaryTabHeader';
import { Feather } from '@expo/vector-icons';

export default function MoreScreen() {
  const colors = useColors();
  const { t, isRTL, fonts, language, setLanguage } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PrimaryTabHeader title={t('more.title')} />
      <View style={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('more.language')}
        </Text>
        <TouchableOpacity 
          style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
          onPress={toggleLanguage}
        >
          <View style={[styles.itemLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Feather name="globe" size={20} color={colors.primary} />
            <Text style={[styles.itemText, { color: colors.foreground, fontFamily: fonts.medium }]}>
              {language === 'en' ? 'العربية' : 'English'}
            </Text>
          </View>
          <Feather name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.mutedForeground} />
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: colors.mutedForeground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left', marginTop: 24 }]}>
          {t('more.appInfo')}
        </Text>
        <View style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.itemLeft, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Feather name="info" size={20} color={colors.primary} />
            <Text style={[styles.itemText, { color: colors.foreground, fontFamily: fonts.medium }]}>
              {t('more.version')}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  item: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemLeft: {
    alignItems: 'center',
    gap: 12,
  },
  itemText: {
    fontSize: 16,
  }
});
