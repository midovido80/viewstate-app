import { projectPropertyIntent } from './recordIntentPresentation';
import {
  projectPropertyProfileDetails,
  type Property,
} from '@workspace/property-domain';
import { projectPropertyFacts } from './propertyFactProjection';
import { getBuiltPropertySector } from './propertySectorSelection';
import type { PropertySpecIconName } from '@/components/PropertySpecIcon';
export interface PropertyVisualFact {
  id: string;
  icon: PropertySpecIconName;
  value: string;
  label: string;
}
export function propertyVisualFacts(
  property: Property,
  language: 'ar' | 'en',
): PropertyVisualFact[] {
  const ar = language === 'ar',
    projection = projectPropertyFacts(property),
    f = {
      ...projection.templateFacts,
      ...projectPropertyProfileDetails(
        property.core.propertyType,
        property.activeOffer.transaction,
        (property.typeDetails ?? {}) as Record<string, unknown>,
      ),
    };
  const commercial =
    getBuiltPropertySector(
      property.core.propertyType,
      f.floorUse ?? f.propertyUse,
    ) === 'commercial';
  const out: PropertyVisualFact[] = [];
  const number = (
    id: string,
    icon: PropertySpecIconName,
    label: string,
    value: unknown,
    unit = '',
  ) => {
    if (typeof value === 'number' && Number.isFinite(value))
      out.push({
        id,
        icon,
        label,
        value: (unit ? String(Number(value.toFixed(2))) : String(value)) + unit,
      });
  };
  const raw = (property.typeDetails ?? {}) as Record<string, unknown>;
  const area = projection.areaSquareMeters ?? f.builtUpAreaSquareMeters ?? raw.builtUpAreaSquareMeters;
  if (!commercial)
    number(
      'bedrooms',
      'bed-outline',
      ar ? 'غرف' : 'Rooms',
      f.bedroomCount ?? f.studioRoomCount,
    );
  if (commercial)
    number(
      'area',
      'set-square',
      ar ? 'المساحة' : 'Area',
      area,
      ar ? ' م²' : ' m²',
    );
  number('bathrooms', 'shower', ar ? 'حمام' : 'Baths', f.bathroomCount);
  if (!commercial)
    number(
      'area',
      'set-square',
      ar ? 'المساحة' : 'Area',
      area,
      ar ? ' م²' : ' m²',
    );
  if (commercial)
    number(
      'automaticNumbers',
      'building',
      ar ? 'أرقام آلية' : 'Building IDs',
      f.automaticNumberCount,
    );
  const parkingCount =
    f.privateParkingCount ?? f.parkingSpaceCount ?? raw.parkingSpaceCount;
  const sharedParking = Array.isArray(f.parkingTypes) && f.parkingTypes.some(value => value === 'public' || value === 'paid');
  if (parkingCount === 0 && sharedParking) out.push({id:'parking',icon:'car',value:ar?'يوجد':'Yes',label:ar?'مواقف':'Parking'});
  else if (typeof parkingCount === 'number')
    out.push({
      id: 'parking',
      icon: parkingCount === 0 ? 'car-off' : 'car',
      value:
        parkingCount === 0 ? (ar ? 'لا يوجد' : 'None') : String(parkingCount),
      label: ar ? 'مواقف' : 'Parking',
    });
  else if (
    f.hasParking === false ||
    f.hasBuildingParking === false ||
    (Array.isArray(f.parkingTypes) && f.parkingTypes.length === 0)
  )
    out.push({
      id: 'parking',
      icon: 'car-off',
      value: ar ? 'لا يوجد' : 'None',
      label: ar ? 'مواقف' : 'Parking',
    });
  else if (
    f.hasParking === true ||
    f.hasBuildingParking === true ||
    (Array.isArray(f.parkingTypes) && f.parkingTypes.length > 0)
  )
    out.push({
      id: 'parking',
      icon: 'car',
      value: ar ? 'يوجد' : 'Yes',
      label: ar ? 'مواقف' : 'Parking',
    });
  if (!commercial && f.hasMaidRoom === true)
    out.push({
      id: 'maid',
      icon: 'users',
      value: ar ? 'يوجد' : 'Yes',
      label: ar ? 'غرفة خادمة' : 'Maid room',
    } as PropertyVisualFact);
  return out.slice(0, 5);
}
export function propertyOfferStatus(property: Property, language: 'ar' | 'en') {
  const intent = projectPropertyIntent(property, language);
  if (!intent.valid)
    return {
      rented: false,
      label: intent.label,
      background: '#ECEFF4',
      color: '#62738D',
    };
  const ar = language === 'ar',
    rented =
      property.activeOffer.transaction === 'rent' &&
      property.rentalAvailability === 'rented';
  return {
    rented,
    label: rented
      ? ar
        ? 'مؤجر'
        : 'Rented'
      : property.activeOffer.transaction === 'rent'
        ? ar
          ? 'معروض للإيجار'
          : 'Offered for rent'
        : ar
          ? 'معروض للبيع'
          : 'Offered for sale',
    background: rented ? '#FDE9ED' : '#DCF6E7',
    color: rented ? '#B32943' : '#127747',
  };
}
