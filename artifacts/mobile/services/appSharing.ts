export const VIEWSTATE_DOWNLOAD_URL =
  "https://viewstate-download.devotedangel1.chatgpt.site";

export function appInvitationMessage(language: string): string {
  return language === "ar"
    ? `جرّب ViewState لتنظيم عقاراتك والأشخاص وطلبات العملاء، والتعاون مع زملائك.\nحمّل التطبيق لأجهزة Android وسجّل بحساب جوجل:\n${VIEWSTATE_DOWNLOAD_URL}\nبعد التسجيل أقدر أرسل لك دعوة منفصلة لدائرة الثقة. تحميل التطبيق لا يضمك لأي دائرة تلقائيًا.`
    : `Try ViewState to organize properties, people and client requirements, and collaborate with colleagues.\nDownload for Android and sign in with Google:\n${VIEWSTATE_DOWNLOAD_URL}\nAfter you register, I can send a separate Trust Circle invitation. Downloading does not join any circle automatically.`;
}

export function appInvitationWhatsAppQuery(
  phone: string,
  language: string,
): string {
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone)) throw Error("INVALID_INVITE_PHONE");
  return `phone=${encodeURIComponent(phone.slice(1))}&text=${encodeURIComponent(appInvitationMessage(language))}`;
}
