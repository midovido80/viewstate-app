/** UI navigation and 12-hour input; persisted task times remain HH:mm. */
export type FollowupSheetMode = 'editor' | 'detail' | 'outcome' | 'reschedule' | 'calendar' | 'people' | 'properties' | 'person' | 'property' | 'cancel' | 'actions' | 'matches' | 'allTasks' | 'notifications' | 'requirements' | 'share' | 'time' | null;
export type TimeTarget = 'editor' | 'reschedule' | 'next';
export function parentFollowupSheet(mode: FollowupSheetMode, calendarBack: FollowupSheetMode, pickerBack: FollowupSheetMode, timeBack: FollowupSheetMode): FollowupSheetMode {
  if (mode === 'calendar') return calendarBack;
  if (mode === 'people' || mode === 'properties') return pickerBack;
  if (mode === 'time') return timeBack;
  return null;
}
export function clockParts(time: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const hour = valid ? Number(time.slice(0, 2)) : 9;
  return { hour: hour % 12 || 12, minute: valid ? Number(time.slice(3)) : 0, period: hour >= 12 ? 'PM' : 'AM' };
}
export function storedClockTime(hour: number, minute: number, period: 'AM' | 'PM'): string {
  if (!Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59 || !['AM', 'PM'].includes(period)) throw new Error('Invalid clock time');
  return String(hour % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}
