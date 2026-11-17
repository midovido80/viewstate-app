import { validateUserContactProfile, type UserContactProfile } from './googleAccountContract';
export const ONBOARDING_SEEN_KEY = '@viewstate_account_welcome_v1';
export function accountEntryStage(profile: UserContactProfile | null, welcomeSeen: boolean): 'profile' | 'welcome' | 'ready' {
  if (!profile) return 'profile';
  validateUserContactProfile(profile.user_id, profile);
  return welcomeSeen ? 'ready' : 'welcome';
}
export const ACCOUNT_ROLE_LABELS = {
  owner: ['مالك', 'Owner'], broker: ['وسيط / Broker', 'Broker'], leasing_employee: ['موظف تأجير', 'Leasing employee'], real_estate_office: ['مكتب عقاري', 'Real estate office'], other: ['أخرى', 'Other'],
} as const;
/** Sharing consent is per share and defaults off. No email or photo is disclosed implicitly. */
export function accountShareSignature(profile: UserContactProfile | null, include: boolean, language: 'ar' | 'en'): string {
  if (!include || !profile) return '';
  const p = validateUserContactProfile(profile.user_id, profile);
  const role = p.classification === 'other' ? p.other_classification : ACCOUNT_ROLE_LABELS[p.classification][language === 'ar' ? 0 : 1];
  return '\n\n' + [language === 'ar' ? 'للتواصل' : 'Contact', p.display_name, p.phone, p.company, role].filter(Boolean).join('\n');
}
