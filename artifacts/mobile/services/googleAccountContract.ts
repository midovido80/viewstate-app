import { assertAccountId } from './accountScope';

export const ACCOUNT_CLASSIFICATIONS = ['owner', 'broker', 'leasing_employee', 'real_estate_office', 'other'] as const;
export type AccountClassification = typeof ACCOUNT_CLASSIFICATIONS[number];
export interface UserContactProfile {
  user_id: string;
  display_name: string;
  phone: string;
  company: string;
  classification: AccountClassification;
  other_classification: string;
}
export type ProfileField = 'display_name' | 'phone' | 'classification' | 'other_classification';
export class AccountProfileValidationError extends Error {
  constructor(readonly fields: readonly ProfileField[]) { super('PROFILE_INCOMPLETE'); }
}
export function validateUserContactProfile(userId: string, value: Omit<UserContactProfile, 'user_id'>): UserContactProfile {
  assertAccountId(userId);
  const fields: ProfileField[] = [];
  const name = value.display_name.trim();
  const phone = value.phone.trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660)));
  if (!name || name.length > 150) fields.push('display_name');
  if (!/^\+?[0-9 ()-]{6,30}$/.test(phone) || phone.replace(/\D/g, '').length < 6 || phone.replace(/\D/g, '').length > 15) fields.push('phone');
  if (!ACCOUNT_CLASSIFICATIONS.includes(value.classification)) fields.push('classification');
  const other = value.classification === 'other' ? value.other_classification.trim() : '';
  if (value.classification === 'other' && (!other || other.length > 100)) fields.push('other_classification');
  if (fields.length) throw new AccountProfileValidationError(fields);
  if (value.company.trim().length > 150) throw new Error('COMPANY_TOO_LONG');
  return { user_id: userId.toLowerCase(), display_name: name, phone, company: value.company.trim(), classification: value.classification, other_classification: other };
}

export const NATIVE_ACCOUNT_CALLBACK = 'viewstate://auth/callback';
/** Production web callbacks must use HTTPS and an explicit path, without wildcards. */
export function webAccountCallback(origin: string): string {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('INVALID_AUTH_ORIGIN');
  }
  return `${url.origin}/auth/callback`;
}
export function readAccountCallback(url: string, expectedCallback: string): { code: string; flowId?: string } {
  const value = new URL(url);
  const expected = new URL(expectedCallback);
  // origin is "null" for custom schemes: compare protocol/host/path explicitly.
  if (value.protocol !== expected.protocol || value.host !== expected.host || value.pathname !== expected.pathname
    || value.username || value.password || expected.search || expected.hash || value.hash) throw new Error('INVALID_AUTH_CALLBACK');
  if (value.searchParams.has('error') || value.searchParams.has('error_description')) throw new Error('GOOGLE_SIGN_IN_REJECTED');
  const codes = value.searchParams.getAll('code');
  if (codes.length !== 1 || !codes[0] || codes[0].length > 4096) throw new Error('INVALID_AUTH_CODE');
  const flows = value.searchParams.getAll('sb_flow_id');
  if (flows.length > 1 || flows.length === 1 && !/^[A-Za-z0-9_-]{8,64}$/.test(flows[0])) throw new Error('INVALID_PKCE_FLOW');
  // Never accept implicit-flow access tokens, a return URL, or an injected owner ID.
  if ([...value.searchParams.keys()].some(key => key !== 'code' && key !== 'sb_flow_id')) throw new Error('UNEXPECTED_AUTH_PARAMETER');
  return { code: codes[0], ...(flows.length ? { flowId: flows[0] } : {}) };
}
