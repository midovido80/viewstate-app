export const PENDING_CIRCLE_INVITE = "@viewstate/pending-circle-invite/v1";
const inviteHost = "taduvwcajtjpceavlxrc.supabase.co";
export function circleInviteToken(input: string): string | null {
  const text = input.trim();
  if (/^[a-f0-9]{64}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.username || url.password) return null;
    const token =
      url.protocol === "viewstate:" && url.hostname === "circle-invite"
        ? url.pathname.slice(1)
        : url.protocol === "https:" &&
            url.hostname === inviteHost &&
            url.pathname === "/functions/v1/circle-invite"
          ? url.searchParams.get("token")
          : null;
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}
export function circleInviteUrl(token: string): string {
  if (!circleInviteToken(token)) throw Error("INVALID_INVITE");
  return `https://${inviteHost}/functions/v1/circle-invite?token=${token}`;
}
export function circleInviteMessage(
  name: string,
  circle: string,
  link: string,
  language: string,
): string {
  return language === "ar"
    ? `${name} يدعوك للانضمام إلى دائرة «${circle}» في ViewState. شارك عقاراتك وطابقها مع طلبات العملاء.\n${link}\nافتح الرابط وراجع الدعوة قبل القبول. إذا ما فتح، افتح دائرة الثقة ← قبول دعوة، والصق الرابط. صالح 7 أيام ويستخدمه أول شخص يقبل الدعوة، حتى لو تم تحويله له. لا تحوّل الرابط لشخص آخر.`
    : `${name} invites you to “${circle}” on ViewState.\n${link}\nReview before accepting. If the link does not open, paste it in Trust Circle → Accept invitation. Valid for 7 days; the first person who accepts can join, including anyone it is forwarded to. Do not forward this link.`;
}
export function canInvitePerson(roles: readonly string[]): boolean {
  return roles.some((role) =>
    [
      "broker",
      "real_estate_company",
      "property_management",
      "owner_agent",
      "building_guard",
    ].includes(role),
  );
}
