/** Presentation only: never derives or changes a persisted selection. */
export const CHOICE_GRID_GAP = 8;

export function choiceTileWidth(containerWidth: number): number | undefined {
  return Number.isFinite(containerWidth) && containerWidth > CHOICE_GRID_GAP
    ? (containerWidth - CHOICE_GRID_GAP) / 2
    : undefined;
}

// Existing Feather icons keep the interface consistent without another dependency.
// IDs are preferred; localized text also supports existing catalog labels and legacy values.
export function choiceIcon(label: string, optionId = '') {
  const text = `${optionId} ${label}`.toLowerCase();
  if (/supermarket|shopping|جمعية|سوبر|تسوق/.test(text)) return 'shopping-bag';
  if (/mosque|مسجد/.test(text)) return 'moon';
  if (/pharmacy|صيدلي/.test(text)) return 'plus-square';
  if (/hospital|clinic|medical|مستشفى|عيادة|طبي/.test(text)) return 'activity';
  if (/school|nursery|مدرسة|حضانة/.test(text)) return 'book-open';
  if (/bus|باص|حافل/.test(text)) return 'truck';
  if (/restaurant|مطعم/.test(text)) return 'coffee';
  if (/cafe|مقهى/.test(text)) return 'coffee';
  if (/laundry|غسيل|مغسلة/.test(text)) return 'droplet';
  if (/bank|atm|بنك|صراف/.test(text)) return 'credit-card';
  if (/gym|club|جيم|نادي/.test(text)) return 'award';
  if (/sea|beach|بحر|شاطئ/.test(text)) return 'sunset';
  if (/pool|مسبح/.test(text)) return 'droplet';
  if (/\bpark\b|garden|حديقة|ممشى/.test(text)) return 'feather';
  if (/solar|heater|heating|سخان|تدفئة/.test(text)) return 'sun';
  if (/central.?ac|split.?ac|conditioning|تكييف|مكيف/.test(text)) return 'wind';
  if (/elevator|lift|مصعد/.test(text)) return 'arrow-up-circle';
  if (/security|guard|أمن|امن|حارس/.test(text)) return 'shield';
  if (/balcony|بلكون|شرفة/.test(text)) return 'columns';
  if (/bbq|شواء/.test(text)) return 'thermometer';
  if (/fire|اطفاء|إطفاء/.test(text)) return 'shield';
  if (/electric|فاز|كهرباء/.test(text)) return 'zap';
  if (/parking|مواقف|موقف/.test(text)) return 'truck';
  if (/maid|driver|خادمة|سائق/.test(text)) return 'user';
  if (/family|bachelor|عائلات|عائلي|عزاب/.test(text)) return 'users';
  if (/furnish|مفروش|تأثيث/.test(text)) return 'package';
  if (/floor|basement|دور|طابق|سرداب|ارضي|أرضي/.test(text)) return 'layers';
  if (/warehouse|مخزن|مستودع/.test(text)) return 'box';
  if (/commercial|office|company|تجاري|مكتب|شركة/.test(text)) return 'briefcase';
  if (/area|location|منطقة|مناطق|الكويت/.test(text)) return 'map-pin';
  if (/rent|sale|buy|price|إيجار|ايجار|بيع|شراء/.test(text)) return 'tag';
  if (/monthly|yearly|daily|شهري|سنوي|يومي|سنوات|سنة/.test(text)) return 'calendar';
  if (/yes|نعم/.test(text)) return 'check';
  if (/^\s*(no|لا)\s*$/.test(text)) return 'minus';
  return 'home';
}
