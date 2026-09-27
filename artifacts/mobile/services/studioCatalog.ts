export type StudioCatalogMode = 'offered' | 'wanted';

export type StudioCatalogFieldId =
  | 'transaction'
  | 'locationAreaId'
  | 'mapsLink'
  | 'price'
  | 'budgetMinimum'
  | 'budgetMaximum'
  | 'rentalPeriodId'
  | 'areaSquareMeters'
  | 'studioRoomCount'
  | 'bathrooms'
  | 'kitchen'
  | 'hall'
  | 'parking'
  | 'floorNumber'
  | 'description';

export interface StudioCatalogChoice {
  /** The semantic selection made by this choice in each mode. */
  readonly modeValues: Readonly<Partial<Record<StudioCatalogMode, string>>>;
  readonly label: readonly [english: string, arabic: string];
  readonly modeLabels?: Readonly<Partial<Record<StudioCatalogMode, readonly [english: string, arabic: string]>>>;
}

/**
 * Shared presentation and applicability contract for both Studio workflows.
 * Property facts and Requirement preferences are still projected separately
 * by studioFormModel; this catalog only defines their common form surface.
 */
export interface StudioCatalogField {
  readonly id: StudioCatalogFieldId;
  readonly label: readonly [english: string, arabic: string];
  readonly modeLabels?: Readonly<Partial<Record<StudioCatalogMode, readonly [english: string, arabic: string]>>>;
  readonly modes: readonly StudioCatalogMode[];
  readonly transactions?: readonly ('sale' | 'rent')[];
  readonly quickPicks?: readonly StudioCatalogChoice[];
  readonly untouchedValues?: Readonly<Partial<Record<StudioCatalogMode, string>>>;
  readonly fixedValue?: string;
  readonly helpText?: readonly [english: string, arabic: string];
}

export const STUDIO_FORM_FIELD_ORDER: Readonly<Record<StudioCatalogMode, readonly StudioCatalogFieldId[]>> = {
  offered: [
    'transaction',
    'locationAreaId',
    'price',
    'rentalPeriodId',
    'areaSquareMeters',
    'studioRoomCount',
    'bathrooms',
    'kitchen',
    'hall',
    'parking',
    'floorNumber',
    'description',
  ],
  wanted: [
    'locationAreaId',
    'transaction',
    'budgetMinimum',
    'budgetMaximum',
    'rentalPeriodId',
    'areaSquareMeters',
    'studioRoomCount',
    'bathrooms',
    'kitchen',
    'hall',
    'parking',
    'floorNumber',
    'description',
  ],
};

export const STUDIO_FORM_CATALOG: readonly StudioCatalogField[] = [
  {
    id: 'transaction',
    label: ['Transaction', 'نوع المعاملة'],
    modes: ['offered', 'wanted'],
    quickPicks: [
      { modeValues: { offered: 'rent', wanted: 'rent' }, label: ['Rent', 'للإيجار'] },
      {
        modeValues: { offered: 'sale', wanted: 'sale' },
        label: ['Sale', 'للبيع'],
        modeLabels: { wanted: ['Buy', 'للشراء'] },
      },
    ],
  },
  {
    id: 'locationAreaId',
    label: ['Area', 'المنطقة'],
    modeLabels: { wanted: ['Preferred area', 'المنطقة المفضلة'] },
    modes: ['offered', 'wanted'],
    helpText: ['Choose a canonical Kuwait area.', 'اختر منطقة معتمدة في الكويت.'],
  },
  {
    id: 'mapsLink',
    label: ['Google Maps link', 'رابط خرائط Google'],
    modes: ['offered'],
  },
  {
    id: 'price',
    label: ['Asking price (KWD)', 'السعر المطلوب (د.ك)'],
    modes: ['offered'],
  },
  {
    id: 'budgetMinimum',
    label: ['Minimum budget (KWD)', 'الحد الأدنى للميزانية (د.ك)'],
    modes: ['wanted'],
  },
  {
    id: 'budgetMaximum',
    label: ['Maximum budget (KWD)', 'الحد الأقصى للميزانية (د.ك)'],
    modes: ['wanted'],
  },
  {
    id: 'rentalPeriodId',
    label: ['Rental cadence', 'دورية الإيجار'],
    modes: ['offered', 'wanted'],
    transactions: ['rent'],
    quickPicks: [
      { modeValues: { offered: 'daily', wanted: 'daily' }, label: ['Daily', 'يومي'] },
      { modeValues: { offered: 'monthly', wanted: 'monthly' }, label: ['Monthly', 'شهري'] },
      { modeValues: { offered: 'yearly', wanted: 'yearly' }, label: ['Yearly', 'سنوي'] },
    ],
  },
  {
    id: 'areaSquareMeters',
    label: ['Studio area (m²)', 'مساحة الاستوديو (م²)'],
    modes: ['offered', 'wanted'],
  },
  {
    id: 'studioRoomCount',
    label: ['Open room', 'غرفة مفتوحة'],
    modes: ['offered', 'wanted'],
    fixedValue: '1',
  },
  {
    id: 'bathrooms',
    label: ['Bathrooms', 'الحمامات'],
    modes: ['offered', 'wanted'],
    fixedValue: '1',
    helpText: [
      'Studio records use one bathroom. Legacy values may need confirmation before replacing them.',
      'يحتوي قالب الاستوديو على حمام واحد. قد تتطلب القيم القديمة تأكيداً قبل استبدالها.',
    ],
  },
  {
    id: 'kitchen',
    label: ['Kitchen', 'مطبخ'],
    modes: ['offered', 'wanted'],
    quickPicks: [
      { modeValues: { offered: 'yes', wanted: 'required' }, label: ['Kitchen', 'مطبخ'] },
      { modeValues: { offered: 'no', wanted: 'must_not_have' }, label: ['No kitchen', 'بدون مطبخ'] },
    ],
    untouchedValues: { offered: 'unknown', wanted: 'not_important' },
  },
  {
    id: 'hall',
    label: ['Hall', 'صالة'],
    modes: ['offered', 'wanted'],
    quickPicks: [
      { modeValues: { offered: 'yes', wanted: 'required' }, label: ['Hall', 'صالة'] },
      { modeValues: { offered: 'no', wanted: 'must_not_have' }, label: ['No hall', 'بدون صالة'] },
    ],
    untouchedValues: { offered: 'unknown', wanted: 'not_important' },
  },
  {
    id: 'parking',
    label: ['Parking', 'موقف'],
    modes: ['offered', 'wanted'],
    quickPicks: [
      { modeValues: { offered: 'yes', wanted: 'required' }, label: ['Parking', 'موقف'] },
      { modeValues: { offered: 'no', wanted: 'must_not_have' }, label: ['No parking', 'بدون موقف'] },
    ],
    untouchedValues: { offered: 'unknown', wanted: 'not_important' },
  },
  {
    id: 'floorNumber',
    label: ['Floor number', 'رقم الطابق'],
    modes: ['offered', 'wanted'],
  },
  {
    id: 'description',
    label: ['Description / notes', 'الوصف / ملاحظات'],
    modeLabels: { offered: ['Description', 'الوصف'], wanted: ['Notes', 'ملاحظات'] },
    modes: ['offered', 'wanted'],
  },
];

export function getStudioCatalogField(id: StudioCatalogFieldId): StudioCatalogField {
  const field = STUDIO_FORM_CATALOG.find(candidate => candidate.id === id);
  if (!field) throw new Error(`UNKNOWN_STUDIO_CATALOG_FIELD:${id}`);
  return field;
}

export function getStudioCatalogFieldLabel(
  id: StudioCatalogFieldId,
  mode: StudioCatalogMode,
): readonly [english: string, arabic: string] {
  const field = getStudioCatalogField(id);
  return field.modeLabels?.[mode] ?? field.label;
}

export function getStudioCatalogChoiceLabel(
  choice: StudioCatalogChoice,
  mode: StudioCatalogMode,
): readonly [english: string, arabic: string] {
  return choice.modeLabels?.[mode] ?? choice.label;
}

export function isStudioCatalogFieldApplicable(
  id: StudioCatalogFieldId,
  mode: StudioCatalogMode,
  transaction?: 'sale' | 'rent',
): boolean {
  const field = getStudioCatalogField(id);
  return field.modes.includes(mode)
    && (transaction === undefined || field.transactions === undefined || field.transactions.includes(transaction));
}