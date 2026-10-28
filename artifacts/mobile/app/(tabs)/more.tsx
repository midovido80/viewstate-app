import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { AccountHeader, Avatar, Badge, Card, ErrorText, ReadyBanner, Row, SectionLabel, useCanWrite, useL } from '@/components/account/ui';
import { appVersion } from '@/components/account/InfoSections';

export default function MoreScreen() {
  const colors = useColors();
  const insets = useScreenInsets();
  const router = useRouter();
  const { t } = useI18n();
  const { state, setAppLanguage } = useAccountFoundation();
  const { canWrite } = useCanWrite();
  const { L, language, fonts, row, align } = useL();
  const [langError, setLangError] = useState<string | null>(null);
  const go = (s: string) => router.push(`/account/${s}` as never);
  const name = state.profile.name.trim();
  const switchLanguage = async () => {
    setLangError(null);
    try { await setAppLanguage(language === 'en' ? 'ar' : 'en'); }
    catch { setLangError(L('لم يُحفظ تغيير اللغة.', 'Language change was not saved.')); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F7FB' }}>
      <AccountHeader title={t('more.title')} root />
      <ReadyBanner />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 90 }} keyboardShouldPersistTaps="handled">
        <Card hero padded>
          <Pressable accessibilityRole="button" onPress={() => go(name ? 'profile' : 'welcome')} style={{ flexDirection: row, alignItems: 'center', gap: 12 }} testID="more-profile-card">
            <Avatar name={name} photo={state.profile.photo} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.foreground, textAlign: align }}>{name || L('أنشئ ملفك المحلي', 'Set up your local profile')}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.mutedForeground, textAlign: align }}>{state.profile.company || L('بدون تسجيل دخول', 'No sign-in required')}</Text>
              <View style={{ flexDirection: row }}><Badge kind="warn" text={L('على هذا الجهاز فقط', 'This device only')} /></View>
            </View>
            <Feather name="settings" size={20} color={colors.primary} />
          </Pressable>
        </Card>

        <SectionLabel>{L('اللغة', 'LANGUAGE')}</SectionLabel>
        <Card><Row first icon="globe" title={language === 'en' ? 'العربية' : 'English'} sub={L('التبديل إلى الإنجليزية', 'Switch to Arabic')} onPress={() => void switchLanguage()} disabled={!canWrite} testID="more-language" /></Card>
        <ErrorText>{langError}</ErrorText>

        <SectionLabel>{L('حسابك واختياراتك', 'YOUR ACCOUNT & PREFERENCES')}</SectionLabel>
        <Card>
          <Row first icon="user" title={L('حسابي', 'My account')} sub={L('الملف الشخصي ووسائل الدخول', 'Profile & sign-in methods')} onPress={() => go('account')} />
          <Row icon="shield" title={L('الخصوصية والمشاركة', 'Privacy & sharing')} sub={L('بيانات على جهازك، ومشاركة باختيارك', 'On-device data. Sharing you choose.')} onPress={() => go('privacy')} />
          <Row icon="sliders" title={L('إعدادات التطبيق', 'App settings')} sub={L('اللغة والإشعارات والحركة', 'Language, notifications & motion')} onPress={() => go('settings')} />
          <Row icon="database" title={L('بياناتي', 'My data')} sub={L('لا نسخ احتياطي ولا سحابة بعد', 'No backup or cloud yet')} onPress={() => go('data')} />
        </Card>

        <SectionLabel>{L('نحن معك', 'HERE TO HELP')}</SectionLabel>
        <Card>
          <Row first icon="help-circle" title={L('المساعدة والدعم', 'Help & support')} sub={L('دليل، مشكلة أو اقتراح', 'Guide, issues & ideas')} onPress={() => go('help')} />
          <Row icon="info" title={L('عن ViewState', 'About ViewState')} sub={`${L('الإصدار', 'Version')} ${appVersion().version}`} onPress={() => go('about')} />
        </Card>
      </ScrollView>
    </View>
  );
}
