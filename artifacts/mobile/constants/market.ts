import type { Language } from '@/contexts/I18nContext';
import type { PriceValue, Property, PropertyDraft } from '@workspace/property-domain';

export const MARKET_CONFIG = {
  id: 'kw-v001',
  countryCode: 'KW',
  currencyCode: 'KWD',
  currencyLabel: {
    en: 'KWD',
    ar: 'د.ك',
  },
} as const;

function normalizePrice(price: PriceValue): PriceValue;
function normalizePrice(price: PriceValue | undefined): PriceValue | undefined;
function normalizePrice(price: PriceValue | undefined): PriceValue | undefined {
  if (!price || price.currencyCode !== 'SAR') return price;
  return { ...price, currencyCode: MARKET_CONFIG.currencyCode };
}

export function normalizeDraftCurrency(draft: PropertyDraft): {
  draft: PropertyDraft;
  changed: boolean;
} {
  const salePrice = normalizePrice(draft.salePrice);
  const rentalPrice = normalizePrice(draft.rentalPrice);
  const changed = salePrice !== draft.salePrice || rentalPrice !== draft.rentalPrice;
  return {
    draft: changed ? { ...draft, salePrice, rentalPrice } : draft,
    changed,
  };
}

export function normalizePropertyCurrency(property: Property): {
  property: Property;
  changed: boolean;
} {
  if (property.activeOffer.transaction === 'sale') {
    const salePrice = normalizePrice(property.activeOffer.salePrice);
    if (salePrice === property.activeOffer.salePrice) {
      return { property, changed: false };
    }
    return {
      property: {
        ...property,
        activeOffer: { ...property.activeOffer, salePrice },
      },
      changed: true,
    };
  }

  const rentalPrice = normalizePrice(property.activeOffer.rentalPrice);
  if (rentalPrice === property.activeOffer.rentalPrice) {
    return { property, changed: false };
  }
  return {
    property: {
      ...property,
      activeOffer: { ...property.activeOffer, rentalPrice },
    },
    changed: true,
  };
}

export function formatPrice(
  amount: number,
  currencyCode: string,
  language: Language,
): string {
  const displayCode = currencyCode === MARKET_CONFIG.currencyCode
    ? MARKET_CONFIG.currencyLabel[language]
    : currencyCode;
  return `${amount.toLocaleString('en-KW')} ${displayCode}`;
}