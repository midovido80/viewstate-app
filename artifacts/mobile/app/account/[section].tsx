import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { AccountScreen, Note, useL } from '@/components/account/ui';
import { AccountSection } from '@/components/account/AccountSection';
import { ProfileSection } from '@/components/account/ProfileSection';
import { PrivacySection, SharingSection, PermissionsSection } from '@/components/account/PrivacySection';
import { SettingsSection, NotificationsSection } from '@/components/account/SettingsSection';
import { DataSection, HelpSection, AboutSection, LegalSection } from '@/components/account/InfoSections';
import { WelcomeSection, PhoneSection, ProviderSection } from '@/components/account/OnboardingSections';

export default function AccountSectionRoute() {
  const { section, method } = useLocalSearchParams<{ section: string; method?: string }>();
  const { ready } = useAccountFoundation();
  const { L } = useL();
  if ((section === 'profile' || section === 'setup') && !ready) {
    // Do not mount the editor with empty initial inputs before local settings load.
    return <AccountScreen title={L('الملف الشخصي', 'Personal profile')}><Note>{L('سيظهر المحرر بعد تحميل الإعدادات المحلية.', 'The editor appears once local settings have loaded.')}</Note></AccountScreen>;
  }
  switch (section) {
    case 'profile': return <ProfileSection />;
    case 'setup': return <ProfileSection setup />;
    case 'privacy': return <PrivacySection />;
    case 'sharing': return <SharingSection />;
    case 'permissions': return <PermissionsSection />;
    case 'settings': return <SettingsSection />;
    case 'notifications': return <NotificationsSection />;
    case 'data': return <DataSection />;
    case 'help': return <HelpSection />;
    case 'about': return <AboutSection />;
    case 'legal': return <LegalSection />;
    case 'welcome': return <WelcomeSection />;
    case 'phone': return <PhoneSection />;
    case 'provider': return <ProviderSection method={method} />;
    default: return <AccountSection />;
  }
}
