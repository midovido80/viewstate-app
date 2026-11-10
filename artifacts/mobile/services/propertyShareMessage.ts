import type { Property, PropertyDetailField, PropertyShareSelection } from '@workspace/property-domain';

const detailIcons: Partial<Record<PropertyDetailField, string>> = {
  plotAreaSquareMeters: '📐', builtUpAreaSquareMeters: '📐', availableAreaSquareMeters: '📐',
  buildingAgeBand: '📅', floorCount: '🏢', floorNumber: '🪜',
  bedroomCount: '🛏️', masterBedroomCount: '🛏️', studioRoomCount: '🛏️',
  bathroomCount: '🚿', bathroomsPerUnit: '🚿', hasMaidRoom: '🧹',
  parkingSpaceCount: '🚗', privateParkingCount: '🚗', parkingTypes: '🚗',
  frontageWidthMeters: '↔️', ceilingHeightMeters: '↕️', kitchens: '🍽️',
  hasKitchen: '🍽️', kitchenAccess: '🍽️', furnishing: '🛋️', livingRoomCount: '🛋️',
  hasPool: '🏊', hasSharedPool: '🏊', hasSharedGym: '🏋️', hasGarden: '🌿',
  hasCentralAC: '❄️', hasSplitAC: '❄️', hasColdStorage: '❄️',
  elevatorCount: '🛗', hasElevator: '🛗', hasServiceElevator: '🛗',
  hasSecurityGuard: '🛡️', hasGuardRoom: '🛡️', hasCCTV: '📹',
  hasMezzanine: '🏢', hasBasement: '🏢', apartmentCount: '🏘️', unitCount: '🏘️',
  shopCount: '🏪', officeCount: '🏢', monthlyIncome: '💵',
  electricityCapacity: '⚡', electricityPhase: '⚡', hasLoadingArea: '🚚',
  loadingBayCount: '🚚', hasVehicleRamp: '🚚', automaticNumberCount: '🔢',
};

const detailOrder: readonly PropertyDetailField[] = [
  'plotAreaSquareMeters', 'builtUpAreaSquareMeters', 'availableAreaSquareMeters',
  'buildingAgeBand', 'floorCount', 'floorNumber', 'bedroomCount', 'masterBedroomCount',
  'studioRoomCount', 'bathroomCount', 'hasMaidRoom', 'parkingSpaceCount', 'privateParkingCount',
  'frontageWidthMeters', 'ceilingHeightMeters',
];

export function propertyMessageDetailValue(field: PropertyDetailField, value: string, language: 'ar' | 'en'): string {
  if (!value) return value;
  if (field.endsWith('SquareMeters')) return `${value} ${language === 'ar' ? 'م²' : 'm²'}`;
  if (field === 'frontageWidthMeters' || field === 'ceilingHeightMeters') {
    return `${value} ${language === 'ar' ? 'متر' : 'm'}`;
  }
  if (field === 'floorNumber' && value === '0') return language === 'ar' ? 'أرضي' : 'Ground floor';
  if (field === 'hasMaidRoom' && value === (language === 'ar' ? 'نعم' : 'Yes')) {
    return language === 'ar' ? 'متوفرة' : 'Available';
  }
  return value.replace(/\s*\n\s*/g, ' · ');
}

const propertyIcons: Partial<Record<Property['core']['propertyType'], string>> = {
  villa: '🏡', house: '🏡', chalet: '🏡', shop: '🏪', warehouse: '📦',
};

export function propertyMessageStyle(
  property: Property, selection: PropertyShareSelection, language: 'ar' | 'en',
  typeName: string, areaName: string, excludedDetails: readonly PropertyDetailField[],
) {
  const arabic = language === 'ar';
  const sale = property.activeOffer.transaction === 'sale';
  const transaction = sale ? (arabic ? 'للبيع' : 'For sale') : (arabic ? 'للإيجار' : 'For rent');
  const fields = selection.normalFields;
  const icon = propertyIcons[property.core.propertyType] ?? '🏢';
  const location = fields.includes('area') ? ` ${arabic ? 'في' : 'in'} ${areaName}` : '';
  const title = fields.includes('transaction') && fields.includes('property_type')
    ? `${icon} ${transaction} – ${typeName}${location}` : '';
  return {
    title, detailIcons, excludedDetails, detailOrder,
    priceLabel: sale ? (arabic ? 'سعر البيع' : 'Sale price') : (arabic ? 'الإيجار' : 'Rent'),
  };
}

export function isPropertyDownloadUrl(value?: string): value is string {
  if (!value || value !== value.trim() || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function propertyMessageFooter(
  language: 'ar' | 'en', sender: { name: string; phone?: string | null } | undefined,
  isBroker: boolean, downloadUrl?: string,
): string {
  const arabic = language === 'ar';
  const lines: string[] = [];
  const contact = [sender?.name?.trim(), sender?.phone?.trim()].filter(Boolean).join(' – ');
  if (contact) lines.push(arabic ? '☎️ للاستفسار والتواصل' : '☎️ Contact', contact);
  if (isBroker && isPropertyDownloadUrl(downloadUrl)) {
    if (lines.length) lines.push('');
    lines.push(arabic ? '📲 حمّل تطبيق ViewState' : '📲 Download ViewState', downloadUrl);
  }
  return lines.length ? '\n\n' + lines.join('\n') : '';
}
