export type CircleMemberContact = {
  user_id: string;
  display_name: string;
  company: string;
  phone: string;
};

export type CircleAttribution = {
  members: CircleMemberContact[];
  requests: { id: string; owner_id: string }[];
  matches: { id: string; requester: string; publisher: string }[];
};

export function circleMemberName(
  member: CircleMemberContact | undefined,
  ar: boolean,
) {
  return (
    member?.display_name.trim() ||
    (ar ? "عضو لم يحدد اسمه" : "Member name unavailable")
  );
}

export function circleMemberPhone(phone: string) {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length < 6 || digits.length > 15) return undefined;
  return phone.trim().startsWith("+") ? `+${digits}` : digits;
}
