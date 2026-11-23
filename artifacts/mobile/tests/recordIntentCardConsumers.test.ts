import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import {
  getPersonDirectIntentActivityLines,
  getPropertyCardSummary,
  getRequirementCardSummary,
  type CardSummaryFormatters,
} from '../services/cardSummaryPresentation.ts';
import { getWantedApartmentSubtypeLabel } from '../services/propertyDetailPresentation.ts';
import {
  projectPropertyIntent,
  projectRecordCardBadges,
  projectRecordIntent,
  projectRequirementIntent,
} from '../services/recordIntentPresentation.ts';

const formatters: CardSummaryFormatters = {
  language: 'en',
  translate: key => ({
    'propertyType.apartment': 'Apartment',
    'propertyType.villa': 'Villa',
    'enrich.apartment_subtype.studio': 'Studio',
  })[key] ?? key,
  formatPrice: (amount, currencyCode) => `${currencyCode} ${amount}`,
  formatRentalPrice: (amount, currencyCode, period) => `${currencyCode} ${amount}/${period ?? ''}`,
};

function property(id: string, transaction: 'sale' | 'rent' = 'sale'): Property {
  return {
    core: {
      id,
      propertyType: 'villa',
      locationArea: { id: 'salmiya' },
      description: null,
    },
    activeOffer: transaction === 'rent'
      ? {
        transaction: 'rent',
        rentalPrice: { amount: 600, currencyCode: 'KWD' },
        rentalPeriodId: 'monthly',
      }
      : {
        transaction: 'sale',
        salePrice: { amount: 100_000, currencyCode: 'KWD' },
      },
  } as unknown as Property;
}

function requirement(purpose: 'buy' | 'rent' = 'buy'): SeekerRequirement {
  return {
    id: 'requirement-1',
    seekerId: 'person-1',
    purpose,
    propertyType: 'apartment',
    preferredAreaMode: 'selected',
    preferredAreaIds: ['salmiya'],
    budget: { currencyCode: 'KWD', minimum: 100, maximum: 500 },
    notes: '',
  } as unknown as SeekerRequirement;
}

function apartmentProperty(subtype: string): Property {
  return {
    core: {
      id: `apartment-${subtype}`,
      propertyType: 'apartment',
      locationArea: { id: 'salmiya' },
      description: null,
    },
    typeDetails: { apartmentSubtype: subtype },
    activeOffer: {
      transaction: 'sale',
      salePrice: { amount: 100_000, currencyCode: 'KWD' },
    },
  } as unknown as Property;
}

function apartmentRequirement(subtype: string): SeekerRequirement {
  return {
    ...requirement('buy'),
    catalogPreferences: [{ field: 'apartmentSubtype', kind: 'choice', value: subtype }],
  } as unknown as SeekerRequirement;
}

test('Property and Requirement card summaries use the canonical localized intent', () => {
  const offeredSale = getPropertyCardSummary(property('sale-1'), formatters);
  const offeredRent = getPropertyCardSummary(property('rent-1', 'rent'), formatters);
  const wantedBuy = getRequirementCardSummary(requirement('buy'), formatters);
  const wantedRent = getRequirementCardSummary(requirement('rent'), formatters);

  assert.equal(projectPropertyIntent(property('sale-2'), 'ar').label, 'معروض للبيع');
  assert.equal(projectPropertyIntent(property('rent-2', 'rent'), 'ar').label, 'معروض للإيجار');
  assert.equal(projectRequirementIntent(requirement('buy'), 'ar').label, 'طلب شراء');
  assert.equal(projectRequirementIntent(requirement('rent'), 'ar').label, 'طلب استئجار');
  assert.equal(offeredSale.areaLabel, 'Salmiya');
  assert.equal(offeredRent.valueLabel, 'KWD 600/monthly');
  assert.equal(wantedBuy.typeLabel, 'Apartment');
  assert.equal(wantedRent.valueLabel, 'KWD 100 – KWD 500');
  assert.deepEqual(
    [
      projectRecordIntent('offered', 'sale', 'en').label,
      projectRecordIntent('offered', 'rent', 'en').label,
      projectRecordIntent('wanted', 'buy', 'en').label,
      projectRecordIntent('wanted', 'rent', 'en').label,
    ],
    ['Offered for Sale', 'Offered for Rent', 'Purchase Request', 'Rental Request'],
  );
});

test('ordered card-badge projection yields one intent, then type, then distinct subtype', () => {
  const intent = projectRecordIntent('offered', 'sale', 'en');
  assert.deepEqual(projectRecordCardBadges(intent, 'Apartment', 'Studio'), [
    { key: 'intent', label: 'Offered for Sale' },
    { key: 'type', label: 'Apartment' },
    { key: 'subtype', label: 'Studio' },
  ]);
  assert.deepEqual(projectRecordCardBadges(intent, 'Apartment', ' apartment '), [
    { key: 'intent', label: 'Offered for Sale' },
    { key: 'type', label: 'Apartment' },
  ]);
});

test('standard subtype is concise only in card and Person-objective labels; Studio badge order remains intact', () => {
  const offeredStandard = apartmentProperty('standard');
  const wantedStandard = apartmentRequirement('standard_apartment');
  const offeredSummary = getPropertyCardSummary(offeredStandard, formatters);
  const wantedSummary = getRequirementCardSummary(wantedStandard, formatters);
  const arabicFormatters: CardSummaryFormatters = {
    ...formatters,
    language: 'ar',
    translate: key => ({
      'propertyType.apartment': 'شقة',
      'enrich.apartment_subtype.studio': 'استوديو',
    })[key] ?? key,
  };

  assert.deepEqual(
    projectRecordCardBadges(projectPropertyIntent(offeredStandard, 'en'), offeredSummary.typeLabel, offeredSummary.subtypeLabel),
    [
      { key: 'intent', label: 'Offered for Sale' },
      { key: 'type', label: 'Apartment' },
      { key: 'subtype', label: 'Standard' },
    ],
  );
  assert.deepEqual(
    projectRecordCardBadges(projectRequirementIntent(wantedStandard, 'en'), wantedSummary.typeLabel, wantedSummary.subtypeLabel),
    [
      { key: 'intent', label: 'Purchase Request' },
      { key: 'type', label: 'Apartment' },
      { key: 'subtype', label: 'Standard' },
    ],
  );
  assert.deepEqual(
    projectRecordCardBadges(
      projectPropertyIntent(offeredStandard, 'ar'),
      getPropertyCardSummary(offeredStandard, arabicFormatters).typeLabel,
      getPropertyCardSummary(offeredStandard, arabicFormatters).subtypeLabel,
    ),
    [
      { key: 'intent', label: 'معروض للبيع' },
      { key: 'type', label: 'شقة' },
      { key: 'subtype', label: 'عادية' },
    ],
  );
  assert.equal(getRequirementCardSummary(wantedStandard, arabicFormatters).subtypeLabel, 'عادية');
  assert.deepEqual(
    projectRecordCardBadges(
      projectRequirementIntent(wantedStandard, 'ar'),
      getRequirementCardSummary(wantedStandard, arabicFormatters).typeLabel,
      getRequirementCardSummary(wantedStandard, arabicFormatters).subtypeLabel,
    ),
    [
      { key: 'intent', label: 'طلب شراء' },
      { key: 'type', label: 'شقة' },
      { key: 'subtype', label: 'عادية' },
    ],
  );
  assert.equal(getWantedApartmentSubtypeLabel(wantedStandard, 'en'), 'Standard Apartment');
  assert.equal(getWantedApartmentSubtypeLabel(wantedStandard, 'ar'), 'شقة عادية');

  const standardActivity = getPersonDirectIntentActivityLines(
    'person-1',
    [offeredStandard],
    [wantedStandard],
    [{ personId: 'person-1', propertyCoreId: offeredStandard.core.id }],
    [],
    formatters,
  );
  assert.match(standardActivity.find(line => line.kind === 'request')?.label ?? '', /^Purchase Request · Apartment · Standard/);
  assert.match(standardActivity.find(line => line.kind === 'offer')?.label ?? '', /^Offered for Sale · Apartment · Standard/);

  const studioSummary = getPropertyCardSummary(apartmentProperty('studio'), formatters);
  assert.deepEqual(
    projectRecordCardBadges(projectPropertyIntent(apartmentProperty('studio'), 'en'), studioSummary.typeLabel, studioSummary.subtypeLabel),
    [
      { key: 'intent', label: 'Offered for Sale' },
      { key: 'type', label: 'Apartment' },
      { key: 'subtype', label: 'Studio' },
    ],
  );
});

test('Person activity and linked-objective cards use one combined intent phrase', () => {
  const lines = getPersonDirectIntentActivityLines(
    'person-1',
    [property('offer-1', 'rent')],
    [requirement('rent')],
    [],
    [{ personId: 'person-1', propertyCoreId: 'offer-1', role: 'owner' }],
    formatters,
  );
  assert.match(lines.find(line => line.kind === 'request')?.label ?? '', /^Rental Request · Apartment/);
  assert.match(lines.find(line => line.kind === 'offer')?.label ?? '', /^Offered for Rent · Villa/);
  assert.doesNotMatch(lines[0]?.label ?? '', /Requests? · Rent|Offers? · Rent/);
});

test('Property cards render semantic badge order in explicit LTR and RTL containers', async () => {
  const [properties, people, personDetails] = await Promise.all([
    readFile('app/(tabs)/properties.tsx', 'utf8'),
    readFile('app/(tabs)/people.tsx', 'utf8'),
    readFile('app/person/[personId].tsx', 'utf8'),
  ]);
  assert.match(properties, /projectRecordCardBadges\(intent, typeLabel, subtypeLabel\)/);
  assert.match(properties, /direction: isRTL \? 'rtl' : 'ltr'/);
  assert.match(properties, /badges\.map\(badge => \(\s*<View[\s\S]*?styles\.badge,[\s\S]*?testID=\{badge\.key === 'intent'[\s\S]*?badge\.key === 'type'/);
  assert.match(properties, /styles\.badgeText, \{ color: colors\.primary, fontFamily: fonts\.medium \}/);
  assert.doesNotMatch(properties, /styles\.propertyType/);
  assert.match(properties, /record-intent-badge-\$\{item\.kind\}-\$\{item\.id\}/);
  assert.match(properties, /record-type-badge-\$\{item\.kind\}-\$\{item\.id\}/);
  assert.doesNotMatch(properties, /getOfferedWantedTransactionLabelKey/);
  assert.doesNotMatch(properties, /properties\.badge\.(?:offered|wanted)/);
  assert.doesNotMatch(properties, /summary\.transactionLabel/);
  assert.match(people, /getPersonDirectIntentActivityLines/);
  assert.match(personDetails, /projectRequirementIntent\(requirement, language\)/);
  assert.match(personDetails, /projectPropertyIntent\(property, language\)\.label/);
  assert.doesNotMatch(personDetails, /requirements\.purpose\.\$\{requirement\.purpose\}/);
});

test('contradictory card intent presents the localized safe conflict, not a false transaction', () => {
  const conflict = projectRecordIntent('wanted', 'sale', 'ar');
  assert.deepEqual(conflict, {
    id: 'conflict',
    label: 'تعارض في نوع المعاملة',
    valid: false,
  });
  assert.deepEqual(projectRecordCardBadges(conflict, 'شقة'), [
    { key: 'intent', label: 'تعارض في نوع المعاملة' },
    { key: 'type', label: 'شقة' },
  ]);
});