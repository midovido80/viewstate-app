/**
 * Device-local account presentation, NOT an authenticated identity or data owner.
 * This namespace never reads/writes the property, person, requirement or media stores.
 */
export const ACCOUNT_STORAGE_KEY = '@viewstate_account_foundation_v1';
export type AccountLanguage = 'en' | 'ar';
export interface LocalProfile { name: string; company: string; photo: string }
export interface ShareChoices { source: boolean; location: boolean; media: boolean; notes: boolean }
export interface NotificationChoices { enabled: boolean; followups: boolean; matches: boolean; marketing: boolean }
export interface FeedbackDraft { id: string; subject: string; message: string; savedAt: string; status: 'not_sent' }
export interface AccountFoundation {
  schemaVersion: 1;
  profile: LocalProfile;
  language?: AccountLanguage;
  sharing: ShareChoices;
  notifications: NotificationChoices;
  reducedMotion: boolean;
  feedback: FeedbackDraft[];
}
export function initialAccountFoundation(): AccountFoundation {
  return {
    schemaVersion: 1, profile: { name: '', company: '', photo: '' },
    sharing: { source: false, location: false, media: true, notes: false },
    notifications: { enabled: false, followups: false, matches: false, marketing: false },
    reducedMotion: false, feedback: [],
  };
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid local settings text');
  return value;
}
export function validateLocalProfile(profile: LocalProfile): LocalProfile {
  const name = text(profile.name, 100).trim();
  if (!name) throw new Error('Name is required');
  const company = text(profile.company, 150).trim();
  const photo = text(profile.photo, 960000);
  if (photo && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(photo)) throw new Error('Invalid profile photo');
  return { name, company, photo };
}
/** Reject opaque/newer records without overwriting them or silently reverting defaults. */
export function decodeAccountFoundation(raw: string | null): AccountFoundation {
  if (raw === null) return initialAccountFoundation();
  const data: unknown = JSON.parse(raw);
  if (!object(data) || data.schemaVersion !== 1 || !object(data.profile)
    || !object(data.sharing) || !object(data.notifications) || !Array.isArray(data.feedback)
    || typeof data.reducedMotion !== 'boolean'
    || (data.language !== undefined && data.language !== 'en' && data.language !== 'ar')) {
    throw new Error('Unsupported or damaged local profile/settings. Stored data was preserved.');
  }
  const profile = {
    name: text(data.profile.name, 100), company: text(data.profile.company, 150),
    photo: text(data.profile.photo, 960000),
  };
  if (profile.photo && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(profile.photo)) throw new Error('Invalid stored photo');
  const sharing = {} as ShareChoices;
  const notifications = {} as NotificationChoices;
  for (const key of ['source', 'location', 'media', 'notes'] as const) {
    if (typeof data.sharing[key] !== 'boolean') throw new Error('Invalid sharing settings');
    sharing[key] = data.sharing[key];
  }
  for (const key of ['enabled', 'followups', 'matches', 'marketing'] as const) {
    if (typeof data.notifications[key] !== 'boolean') throw new Error('Invalid notification settings');
    notifications[key] = data.notifications[key];
  }
  if (data.feedback.length > 20) throw new Error('Invalid draft count');
  const feedback = data.feedback.map((draft): FeedbackDraft => {
    if (!object(draft) || draft.status !== 'not_sent') throw new Error('Invalid feedback draft');
    return { id: text(draft.id, 100), subject: text(draft.subject, 120),
      message: text(draft.message, 2000), savedAt: text(draft.savedAt, 40), status: 'not_sent' };
  });
  return { schemaVersion: 1, profile, language: data.language as AccountLanguage | undefined,
    sharing, notifications, reducedMotion: data.reducedMotion, feedback };
}
export interface SettingsStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
/** Serializes successful writes; failed writes never publish success or poison later writes. */
export function createAccountRepository(storage: SettingsStorage) {
  let current: AccountFoundation | undefined;
  let queue = Promise.resolve();
  return {
    async load() {
      current = undefined;
      const next = decodeAccountFoundation(await storage.getItem(ACCOUNT_STORAGE_KEY));
      current = next;
      return next;
    },
    update(change: (state: AccountFoundation) => AccountFoundation): Promise<AccountFoundation> {
      let output!: AccountFoundation;
      const operation = queue.then(async () => {
        if (!current) throw new Error('Local settings are not ready');
        const next = decodeAccountFoundation(JSON.stringify(change(JSON.parse(JSON.stringify(current)))));
        await storage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(next));
        current = next;
        output = next;
      });
      queue = operation.catch(() => undefined);
      return operation.then(() => output);
    },
  };
}
export function appendFeedback(state: AccountFoundation, subject: string, message: string, id: string, savedAt: string): AccountFoundation {
  subject = text(subject, 120).trim(); message = text(message, 2000).trim();
  if (!subject || !message) throw new Error('Subject and details are required');
  if (state.feedback.length >= 20) throw new Error('Draft limit reached. Remove an old draft first.');
  return { ...state, feedback: [...state.feedback, { id, subject, message, savedAt, status: 'not_sent' }] };
}
/** Fictional, per-share example only. Never passed to actual property-sharing code. */
export function fictionalSharePreview(language: AccountLanguage, choices: ShareChoices): string[] {
  const ar = language === 'ar';
  return [
    ar ? 'مثال وهمي فقط — لا يغيّر مشاركة العقارات الفعلية' : 'Fictional example only — does not change actual property sharing',
    ar ? 'شقة بالسالمية • 490 د.ك شهريًا' : 'Apartment in Salmiya • 490 KWD / month',
    ar ? '3 غرف • حمامان • تكييف مركزي' : '3 bedrooms • 2 bathrooms • Central AC',
    ...(choices.source ? [ar ? 'المصدر: مالك وهمي • رقم غير حقيقي' : 'Source: fictional owner • no real phone'] : []),
    ...(choices.location ? [ar ? 'الموقع الدقيق: عنوان وهمي' : 'Precise location: fictional address'] : []),
    ...(choices.media ? [ar ? 'مثال مرفقات: صورتان وملف PDF (لا ملفات فعلية)' : 'Example attachments: two images and a PDF (no actual files)'] : []),
    ...(choices.notes ? [ar ? 'ملاحظة داخلية وهمية: قابل للتفاوض' : 'Fictional internal note: negotiable'] : []),
  ];
}
