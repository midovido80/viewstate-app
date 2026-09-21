import type {
  PropertyCaptureCategoryId,
  PropertyType,
  Transaction,
} from '@workspace/property-domain';

export interface DemoNumericField {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly kind?: 'count' | 'decimal';
}

export interface DemoChoiceField {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly options: readonly { id: string; label: readonly [string, string] }[];
}

export interface DemoCategoryDefinition {
  readonly id: PropertyCaptureCategoryId;
  readonly canonicalType: PropertyType;
  readonly transaction: Transaction;
  readonly label: readonly [string, string];
  readonly subtitle: readonly [string, string];
  readonly numericFields: readonly DemoNumericField[];
  readonly choices: readonly DemoChoiceField[];
  readonly features: readonly { id: string; label: readonly [string, string] }[];
}

const option = (id: string, en: string, ar: string) => ({ id, label: [en, ar] as const });
const field = (id: string, en: string, ar: string, kind: 'count' | 'decimal' = 'count') => ({ id, label: [en, ar] as const, kind });

export const DEMO_NEARBY_SERVICES = [
  option('supermarket', 'Supermarket / Co-op', 'جمعية / سوبر ماركت'),
  option('school', 'School', 'مدرسة'),
  option('hospital', 'Hospital', 'مستشفى'),
  option('mosque', 'Mosque', 'مسجد'),
  option('restaurant', 'Restaurant', 'مطعم'),
  option('bus_station', 'Bus station', 'محطة باص'),
  option('bank_atm', 'Bank / ATM', 'بنك / صراف آلي'),
  option('pharmacy', 'Pharmacy', 'صيدلية'),
  option('club_gym', 'Club / Gym', 'نادي / جيم'),
  option('beach', 'Beach', 'شاطئ'),
] as const;

const features = (items: readonly [string, string, string][]) =>
  items.map(([id, en, ar]) => option(id, en, ar));

export const PROPERTY_DEMO_CATALOG: readonly DemoCategoryDefinition[] = [
  {
    id: 'whole_building_corporate_rent', canonicalType: 'whole_building', transaction: 'rent',
    label: ['Whole building — corporate rent', 'عمارة كاملة للإيجار للشركات'],
    subtitle: ['Staff or worker housing', 'سكن موظفين أو عمال'],
    numericFields: [field('floorCount', 'Number of floors', 'عدد الأدوار'), field('apartmentCount', 'Apartments / units', 'عدد الشقق / الوحدات'), field('roomsPerUnit', 'Rooms per unit', 'الغرف في كل وحدة'), field('bathroomsPerUnit', 'Bathrooms per unit', 'الحمامات في كل وحدة'), field('elevatorCount', 'Elevators', 'عدد المصاعد')],
    choices: [{ id: 'occupancy', label: ['Occupancy status', 'حالة الإشغال'], options: [option('vacant', 'Fully vacant', 'شاغرة بالكامل'), option('partially_occupied', 'Partially occupied', 'مشغولة جزئياً'), option('fully_rented', 'Fully rented', 'مؤجرة بالكامل')] }],
    features: features([['corporate_housing', 'Corporate housing', 'سكن شركات'], ['parking', 'Parking', 'مواقف سيارات'], ['security', 'Guard / security', 'حارس / أمن'], ['central_ac', 'Central air conditioning', 'تكييف مركزي'], ['owner_maintenance', 'Owner maintenance', 'صيانة على المالك'], ['utilities_included', 'Water and electricity included', 'شامل الماء والكهرباء'], ['elevator', 'Elevator', 'مصعد']]),
  },
  {
    id: 'whole_building_sale', canonicalType: 'whole_building', transaction: 'sale',
    label: ['Whole building — sale', 'عمارة كاملة للبيع'], subtitle: ['Investment property', 'عقار استثماري'],
    numericFields: [field('floorCount', 'Number of floors', 'عدد الأدوار'), field('apartmentCount', 'Apartments', 'عدد الشقق'), field('shopCount', 'Shops', 'عدد المحلات'), field('buildingAgeYears', 'Building age (years)', 'عمر العقار بالسنوات'), field('monthlyIncome', 'Current monthly income', 'الدخل الشهري الحالي', 'decimal')],
    choices: [{ id: 'condition', label: ['Building condition', 'حالة العقار'], options: [option('fully_rented', 'Fully rented', 'مؤجرة بالكامل'), option('partially_occupied', 'Partially occupied', 'مشغولة جزئياً'), option('vacant', 'Vacant', 'شاغرة')] }],
    features: features([['freehold', 'Freehold deed', 'وثيقة حرة'], ['existing_income', 'Existing income', 'دخل قائم'], ['parking', 'Parking', 'مواقف سيارات'], ['elevator', 'Elevator', 'مصعد'], ['security', 'Guard / security', 'حارس / أمن'], ['main_road', 'Main road', 'شارع رئيسي'], ['corner', 'Corner', 'زاوية']]),
  },
  {
    id: 'commercial_complex_sale', canonicalType: 'commercial_complex', transaction: 'sale',
    label: ['Commercial complex / mall — sale', 'مجمع تجاري للبيع'], subtitle: ['Mall or shops complex', 'مول أو مجمع محلات'],
    numericFields: [field('floorCount', 'Number of floors', 'عدد الأدوار'), field('shopCount', 'Shops', 'عدد المحلات'), field('officeCount', 'Offices', 'عدد المكاتب'), field('parkingSpaceCount', 'Parking spaces', 'عدد المواقف'), field('frontageWidthMeters', 'Frontage (m)', 'طول الواجهة بالمتر', 'decimal')],
    choices: [{ id: 'activity', label: ['Current use', 'الاستخدام الحالي'], options: [option('retail', 'Retail', 'تجزئة'), option('restaurants', 'Restaurants and cafés', 'مطاعم ومقاهٍ'), option('offices', 'Offices', 'مكاتب'), option('mixed', 'Mixed use', 'متعدد الاستخدامات')] }],
    features: features([['restaurants', 'Restaurant zone', 'منطقة مطاعم'], ['elevator', 'Elevators', 'مصاعد'], ['escalators', 'Escalators', 'سلالم كهربائية'], ['parking', 'Parking', 'مواقف سيارات'], ['central_ac', 'Central air conditioning', 'تكييف مركزي'], ['fire_system', 'Fire system', 'نظام إطفاء'], ['operations', 'Operations management', 'إدارة تشغيل']]),
  },
  {
    id: 'family_apartment', canonicalType: 'apartment', transaction: 'rent',
    label: ['Family apartment', 'شقة للعائلات'], subtitle: ['Family residence', 'سكن عائلي'],
    numericFields: [field('bedroomCount', 'Bedrooms', 'غرف النوم'), field('bathroomCount', 'Bathrooms', 'الحمامات'), field('floorNumber', 'Floor number', 'رقم الطابق')],
    choices: [{ id: 'furnishing', label: ['Furnishing', 'الفرش'], options: [option('furnished', 'Furnished', 'مفروشة'), option('unfurnished', 'Unfurnished', 'غير مفروشة'), option('semi_furnished', 'Semi-furnished', 'مفروشة جزئياً')] }, { id: 'kitchen', label: ['Kitchen', 'نوع المطبخ'], options: [option('closed', 'Closed', 'مغلق'), option('open', 'Open', 'مفتوح'), option('fully_equipped', 'Fully equipped', 'مجهز بالكامل')] }],
    features: features([['balcony', 'Balcony', 'بلكونة'], ['maid_room', 'Maid room', 'غرفة خادمة'], ['laundry_room', 'Laundry room', 'غرفة غسيل'], ['pool', 'Pool', 'مسبح'], ['gym', 'Gym', 'جيم'], ['parking', 'Parking', 'موقف سيارة'], ['elevator', 'Elevator', 'مصعد'], ['security', 'Guard / security', 'حارس / أمن']]),
  },
  {
    id: 'bachelor_apartment', canonicalType: 'apartment', transaction: 'rent',
    label: ['Bachelor / corporate apartment', 'شقة للعزاب أو الشركات'], subtitle: ['Individuals or staff housing', 'سكن أفراد أو موظفين'],
    numericFields: [field('roomCount', 'Rooms', 'عدد الغرف'), field('bathroomCount', 'Bathrooms', 'الحمامات'), field('capacity', 'Capacity', 'السعة المناسبة للأفراد'), field('floorNumber', 'Floor number', 'رقم الطابق')],
    choices: [{ id: 'allowedCategory', label: ['Allowed category', 'الفئة المسموحة'], options: [option('bachelors', 'Bachelors', 'عزاب'), option('companies', 'Companies', 'شركات'), option('both', 'Bachelors and companies', 'عزاب وشركات')] }],
    features: features([['electricity_included', 'Electricity included', 'شامل الكهرباء'], ['water_included', 'Water included', 'شامل الماء'], ['maintenance', 'Maintenance', 'صيانة'], ['parking', 'Parking', 'موقف سيارة'], ['elevator', 'Elevator', 'مصعد'], ['security', 'Guard / security', 'حارس / أمن'], ['furnished', 'Furnished', 'مفروشة']]),
  },
  {
    id: 'house', canonicalType: 'house', transaction: 'sale',
    label: ['House', 'بيت'], subtitle: ['Government or private house', 'بيت حكومي أو خاص'],
    numericFields: [field('floorCount', 'Number of floors', 'عدد الأدوار'), field('roomCount', 'Rooms', 'عدد الغرف'), field('bathroomCount', 'Bathrooms', 'الحمامات'), field('streetCount', 'Number of streets', 'عدد الشوارع')],
    choices: [{ id: 'condition', label: ['House condition', 'حالة البيت'], options: [option('new', 'New', 'جديد'), option('renovated', 'Renovated', 'مجدّد'), option('needs_renovation', 'Needs renovation', 'يحتاج ترميم')] }],
    features: features([['garden', 'Garden', 'حديقة'], ['courtyard', 'Courtyard', 'حوش'], ['diwaniya', 'Diwaniya', 'ديوانية'], ['maid_room', 'Maid room', 'غرفة خادمة'], ['elevator', 'Elevator', 'مصعد'], ['covered_parking', 'Covered parking', 'مواقف مظللة'], ['separate_entrance', 'Separate entrance', 'مدخل مستقل']]),
  },
  {
    id: 'villa', canonicalType: 'villa', transaction: 'sale',
    label: ['Villa', 'فيلا'], subtitle: ['Independent villa', 'فيلا مستقلة'],
    numericFields: [field('floorCount', 'Number of floors', 'عدد الأدوار'), field('bedroomCount', 'Bedrooms', 'غرف النوم'), field('bathroomCount', 'Bathrooms', 'الحمامات'), field('masterBedroomCount', 'Master bedrooms', 'غرف ماستر')],
    choices: [{ id: 'furnishing', label: ['Furnishing', 'الفرش'], options: [option('furnished', 'Furnished', 'مفروشة'), option('unfurnished', 'Unfurnished', 'غير مفروشة'), option('semi_furnished', 'Semi-furnished', 'مفروشة جزئياً')] }],
    features: features([['garden', 'Garden', 'حديقة'], ['private_pool', 'Private pool', 'مسبح خاص'], ['diwaniya', 'Diwaniya', 'ديوانية'], ['maid_room', 'Maid room', 'غرفة خادمة'], ['driver_room', 'Driver room', 'غرفة سائق'], ['elevator', 'Elevator', 'مصعد'], ['covered_parking', 'Covered parking', 'مواقف مظللة'], ['solar_heater', 'Solar heater', 'سخان شمسي']]),
  },
  {
    id: 'chalet', canonicalType: 'chalet', transaction: 'sale',
    label: ['Chalet', 'شاليه'], subtitle: ['Coastal or recreational', 'ساحلي أو ترفيهي'],
    numericFields: [field('bedroomCount', 'Bedrooms', 'غرف النوم'), field('bathroomCount', 'Bathrooms', 'الحمامات'), field('frontageWidthMeters', 'Waterfront frontage (m)', 'الواجهة البحرية بالمتر', 'decimal'), field('capacity', 'Capacity', 'سعة الأشخاص')],
    choices: [{ id: 'view', label: ['View', 'الإطلالة'], options: [option('direct_sea', 'Direct sea view', 'بحرية مباشرة'), option('side_sea', 'Side view', 'جانبية'), option('none', 'No view', 'بدون إطلالة')] }, { id: 'furnishing', label: ['Furnishing', 'الفرش'], options: [option('furnished', 'Furnished', 'مفروش'), option('unfurnished', 'Unfurnished', 'غير مفروش')] }],
    features: features([['private_beach', 'Private beach', 'شاطئ خاص'], ['pool', 'Pool', 'مسبح'], ['boat_mooring', 'Boat mooring', 'مرسى قارب'], ['garden', 'Garden', 'حديقة'], ['bbq', 'BBQ area', 'منطقة شواء'], ['maid_room', 'Maid room', 'غرفة خادمة'], ['parking', 'Parking', 'مواقف سيارات']]),
  },
  {
    id: 'warehouse', canonicalType: 'warehouse', transaction: 'rent',
    label: ['Warehouse / store', 'مستودع أو مخزن'], subtitle: ['Storage or logistics', 'تخزين أو نشاط لوجستي'],
    numericFields: [field('heightMeters', 'Height (m)', 'الارتفاع بالمتر', 'decimal'), field('doorCount', 'Doors', 'عدد الأبواب'), field('officeCount', 'Offices', 'عدد المكاتب'), field('electricalPower', 'Electrical power (A)', 'قدرة الكهرباء بالأمبير')],
    choices: [{ id: 'license', label: ['License type', 'نوع الترخيص'], options: [option('storage', 'Store', 'مخزن'), option('industrial', 'Industrial', 'صناعي'), option('food', 'Food', 'غذائي'), option('logistics', 'Logistics', 'لوجستي')] }, { id: 'truckAccess', label: ['Truck access', 'دخول الشاحنات'], options: [option('trailers', 'Trailers', 'تريلات'), option('medium_trucks', 'Medium trucks', 'شاحنات متوسطة'), option('light_transport', 'Light transport', 'سيارات نقل خفيف')] }],
    features: features([['ac', 'Air conditioning', 'تكييف'], ['fire_system', 'Fire system', 'نظام إطفاء'], ['loading', 'Loading and unloading', 'تحميل وتنزيل'], ['industrial_floor', 'Industrial floor', 'أرضية صناعية'], ['security', 'Security', 'حراسة'], ['cameras', 'Cameras', 'كاميرات'], ['parking', 'Parking', 'مواقف']]),
  },
  {
    id: 'duplex', canonicalType: 'apartment', transaction: 'sale',
    label: ['Duplex', 'دوبلكس'], subtitle: ['Two connected levels', 'طابقان متصلان'],
    numericFields: [field('bedroomCount', 'Bedrooms', 'غرف النوم'), field('bathroomCount', 'Bathrooms', 'الحمامات'), field('livingRoomCount', 'Living rooms', 'عدد الصالات'), field('floorCount', 'Levels', 'عدد الطوابق')],
    choices: [{ id: 'furnishing', label: ['Furnishing', 'الفرش'], options: [option('furnished', 'Furnished', 'مفروش'), option('unfurnished', 'Unfurnished', 'غير مفروش'), option('semi_furnished', 'Semi-furnished', 'مفروش جزئياً')] }],
    features: features([['private_roof', 'Private roof', 'سطح خاص'], ['garden', 'Garden', 'حديقة'], ['balcony', 'Balcony', 'بلكونة'], ['maid_room', 'Maid room', 'غرفة خادمة'], ['pool', 'Pool', 'مسبح'], ['gym', 'Gym', 'جيم'], ['parking_two', 'Two parking spaces', 'موقفان'], ['separate_entrance', 'Separate entrance', 'مدخل مستقل']]),
  },
];

export function getDemoCategory(id: PropertyCaptureCategoryId | undefined) {
  return PROPERTY_DEMO_CATALOG.find(category => category.id === id);
}

export function parseDemoNumericInput(value: string, decimal = false): number | null {
  const normalized = value
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٫,]/g, '.');
  if (!normalized || (decimal ? !/^(?:\d+\.?\d*|\.\d+)$/.test(normalized) : !/^\d+$/.test(normalized))) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function hasPopulatedCategoryCapture(values: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(values)) {
    if (key === 'areaSquareMeters' || key === 'areaUnit' || value === undefined || value === null || value === '') continue;
    if (key === 'nearbyServices') {
      try {
        const nearby = typeof value === 'string' ? JSON.parse(value) : value;
        if (Array.isArray(nearby) && nearby.length === 0) continue;
      } catch {
        // An unreadable value is conservatively treated as populated.
      }
    }
    if (key === 'demoMetadata' && typeof value === 'object' && value !== null) {
      const metadata = value as Record<string, unknown>;
      const hasValues = Object.entries(metadata).some(([field, entry]) => {
        if (field === 'categoryId' || entry === undefined || entry === null || entry === '') return false;
        return Array.isArray(entry) ? entry.length > 0 : Object.keys(entry as object).length > 0;
      });
      if (!hasValues) continue;
    }
    return true;
  }
  return false;
}