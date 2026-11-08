/** Display format never changes the stored local wall-clock HH:mm. */
export type ClockFormat = 12 | 24;
export function timeParts(value: string, format: ClockFormat) {
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const hour24 = valid ? Number(value.slice(0, 2)) : 9;
  return { hour: format === 12 ? hour24 % 12 || 12 : hour24, minute: valid ? Number(value.slice(3)) : 0, period: hour24 >= 12 ? 1 : 0 };
}
export function timeFromParts(hour: number, minute: number, format: ClockFormat, period = 0) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59 || hour < (format === 12 ? 1 : 0) || hour > (format === 12 ? 12 : 23) || ![0, 1].includes(period)) throw new Error('Invalid time');
  return `${String(format === 12 ? hour % 12 + period * 12 : hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
export function hasFollowupTime(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function followupTimeLabel(value: string, format: ClockFormat, arabic: boolean) {
  if (!hasFollowupTime(value)) return arabic ? 'اختر الساعة' : 'Choose time';
  const p = timeParts(value, format);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}${format === 12 ? ` ${arabic ? p.period ? 'م' : 'ص' : p.period ? 'PM' : 'AM'}` : ''}`;
}
