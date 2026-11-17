/** Shared cancellation text color; press handlers and native cancellation semantics stay unchanged. */
export const CANCEL_ACTION_COLOR = '#DC2626';

export function isCancelActionLabel(label: string): boolean {
  return /(?:^|\s)(?:cancel|إلغاء|الغاء)(?=\s|$)/iu.test(label.trim());
}
