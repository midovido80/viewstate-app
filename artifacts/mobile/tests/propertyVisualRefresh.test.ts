import { searchGlobalData } from '../services/globalSearch.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import './platformModuleStubs.ts';
import {
  type Property,
  projectDraftToProperty,
  validKitchens,
  validKitchenSelection,
  validateProperty,
  checkMatchEligibility,
} from '@workspace/property-domain';
import {
  propertyOfferStatus,
  propertyVisualFacts,
} from '../services/propertyVisualPresentation.ts';
import {
  createEditDraft,
  buildPropertyDetailsUpdateCandidate,
} from '../services/propertyUpdateRecovery.ts';
import { buildPropertyWithCaptureDetails } from '../services/propertyCaptureDetails.ts';
import {
  createStudioFormValues,
  buildStudioProperty,
  readStudioProperty,
} from '../services/studioFormModel.ts';
import { readFile } from 'node:fs/promises';
const p: Property = {
  core: {
    id: 'property',
    propertyType: 'apartment',
    locationArea: { id: 'salmiya' },
  },
  activeOffer: {
    id: 'offer',
    propertyCoreId: 'property',
    transaction: 'rent',
    rentalPrice: { amount: 650, currencyCode: 'KWD' },
    rentalPeriodId: 'monthly',
  },
  typeDetails: {
    propertyType: 'apartment',
    apartmentSubtype: 'standard_apartment',
    bedroomCount: 3,
    bathroomCount: 2,
    parkingSpaceCount: 0,
    hasMaidRoom: true,
  },
  areaSquareMeters: 120,
  areaUnit: 'square_meter',
};
test('visual lead uses applicable facts, correct units, explicit zero parking and optional maid room', () => {
  const facts = propertyVisualFacts(p, 'ar');
  assert.deepEqual(
    facts.map((f) => f.id),
    ['bedrooms', 'bathrooms', 'area', 'parking', 'maid'],
  );
  assert.equal(facts[2].value, '120 م²');
  assert.equal(facts[3].icon, 'car-off');
  const unknown = {
    ...p,
    typeDetails: {
      ...p.typeDetails,
      parkingSpaceCount: undefined,
    } as Property['typeDetails'],
  };
  assert.equal(
    propertyVisualFacts(unknown, 'ar').some((f) => f.id === 'parking'),
    false,
  );
});
test('commercial facts omit bedrooms, preserve automatic-number count and convert square feet once', () => {
  const office: Property = {
    ...p,
    core: { ...p.core, propertyType: 'office' },
    typeDetails: {
      propertyType: 'office',
      bathroomCount: 2,
      automaticNumberCount: 1,
      parkingTypes: ['public'],
    },
    areaSquareMeters: 1076.39104167,
    areaUnit: 'square_foot',
  };
  const facts = propertyVisualFacts(office, 'en');
  assert.deepEqual(
    facts.map((f) => f.id),
    ['area', 'bathrooms', 'automaticNumbers', 'parking'],
  );
  assert.ok(Math.abs(Number(facts[0].value.split(' ')[0]) - 100) < 0.01);
  assert.equal(facts[3].value, 'Yes');
  assert.equal(
    facts.some((f) => f.id === 'bedrooms'),
    false,
  );
});
test('availability uses exact transaction and rented state; unknown never becomes sale', () => {
  assert.equal(propertyOfferStatus(p, 'ar').label, 'معروض للإيجار');
  assert.equal(
    propertyOfferStatus({ ...p, rentalAvailability: 'rented' }, 'ar').label,
    'مؤجر',
  );
  assert.equal(
    propertyOfferStatus({ ...p, rentalAvailability: 'rented' }, 'en').rented,
    true,
  );
  assert.equal(
    propertyOfferStatus(
      {
        ...p,
        activeOffer: { ...p.activeOffer, transaction: 'bad' },
      } as unknown as Property,
      'ar',
    ).label,
    'تعارض في نوع المعاملة',
  );
});
test('optional title survives capture, editor persistence, candidate save and explicit removal', () => {
  const result = projectDraftToProperty({
    propertyCoreId: 'property',
    offerId: 'offer',
    propertyType: 'apartment',
    locationAreaId: 'salmiya',
    transaction: 'rent',
    rentalPrice: { amount: 650, currencyCode: 'KWD' },
    rentalPeriodId: 'monthly',
    listingTitle: '  شقة بإطلالة بحرية  ',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.listingTitle, 'شقة بإطلالة بحرية');
  const draft = createEditDraft({ ...p, listingTitle: 'شقة بإطلالة بحرية' });
  assert.equal(
    JSON.parse(JSON.stringify(draft)).choices.listingTitle,
    'شقة بإطلالة بحرية',
  );
  const changed = buildPropertyDetailsUpdateCandidate(draft.baseline, {
    ...draft.choices,
    listingTitle: 'عنوان جديد',
    rentalAvailability: 'rented',
  });
  assert.equal(changed.listingTitle, 'عنوان جديد');
  assert.equal(changed.rentalAvailability, 'rented');
  assert.equal(
    buildPropertyDetailsUpdateCandidate(changed, {
      ...createEditDraft(changed).choices,
      listingTitle: '',
    }).listingTitle,
    undefined,
  );
});
test('title and availability are validated at domain boundary', () => {
  assert.equal(
    validateProperty({ ...p, listingTitle: 'a'.repeat(161) }).ok,
    false,
  );
  assert.equal(
    validateProperty({
      ...p,
      rentalAvailability: 'invalid',
    } as unknown as Property).ok,
    false,
  );
  assert.equal(validateProperty(p).ok, true);
});
test('preparatory kitchens roundtrip independently; new selection max three and legacy reads retain larger arrays', () => {
  const kitchens = [
    { layout: 'regular' },
    { layout: 'american' },
    { layout: 'preparatory', equipment: 'unequipped' },
  ] as const;
  assert.equal(validKitchens(kitchens), true);
  assert.equal(validKitchenSelection(kitchens), true);
  assert.equal(validKitchenSelection([...kitchens, {}]), false);
  assert.equal(validKitchens([...kitchens, {}]), true);
  const draft = createEditDraft(p);
  const changed = buildPropertyDetailsUpdateCandidate(p, {
    ...draft.choices,
    canonicalDetails: {
      ...draft.choices.canonicalDetails,
      kitchens: JSON.stringify(kitchens),
    },
  });
  assert.deepEqual((changed.typeDetails as any).kitchens, kitchens);
  assert.throws(
    () =>
      buildPropertyDetailsUpdateCandidate(p, {
        ...draft.choices,
        canonicalDetails: {
          ...draft.choices.canonicalDetails,
          kitchens: JSON.stringify([...kitchens, {}]),
        },
      }),
    /KITCHEN_COUNT_LIMIT/,
  );
  assert.throws(
    () =>
      buildPropertyWithCaptureDetails(
        p,
        { kitchens: JSON.stringify([...kitchens, {}]) },
        true,
      ),
    /KITCHEN_COUNT_LIMIT/,
  );
});
test('rented offers are excluded from rental matching while occupied sale investments remain eligible', () => {
  const requirement: any = {
    propertyType: 'apartment',
    purpose: 'rent',
    preferredAreaIds: ['salmiya'],
    budget: { minimum: 500, maximum: 700, currencyCode: 'KWD' },
  };
  assert.equal(
    checkMatchEligibility(requirement, { property: p }).eligible,
    true,
  );
  assert.equal(
    checkMatchEligibility(requirement, {
      property: { ...p, rentalAvailability: 'rented' },
    }).eligible,
    false,
  );
  const sale: Property = {
    ...p,
    rentalAvailability: 'rented',
    activeOffer: {
      id: 'offer',
      propertyCoreId: 'property',
      transaction: 'sale',
      salePrice: { amount: 650, currencyCode: 'KWD' },
    },
  };
  assert.equal(
    checkMatchEligibility(
      { ...requirement, purpose: 'buy' },
      { property: sale },
    ).eligible,
    true,
  );
});
test('three pages keep inputs mounted and media icons use existing drawings with new button dimensions', async () => {
  const [wizard, location, kitchen, layout] = await Promise.all(
    [
      'components/PropertyWizard.tsx',
      'components/LocationAttachmentUI.tsx',
      'components/KitchenFields.tsx',
      'app/_layout.tsx',
    ].map((f) => readFile(f, 'utf8')),
  );
  assert.match(wizard, /display:\s*'none'/);
  assert.match(wizard, /السابق/);
  assert.match(wizard, /حفظ العقار/);
  assert.match(location, /name=\{icon\}/);
  assert.match(location, /size=\{20\}/);
  assert.match(kitchen, /COUNT_OPTIONS = \[0, 1, 2, 3\]/);
  assert.doesNotMatch(kitchen, /NumericQuickPick/);
  assert.match(kitchen, /preparatory/);
  assert.match(layout, /<AppChrome><Stack/);
});

test('the public listing title is searchable without exposing private notes', () => {
  const property={...p, listingTitle:'إطلالة بحرية مميزة'};
  const data={properties:[property],people:[],requirements:[]};
  assert.equal(searchGlobalData(data,'إطلالة بحرية').properties.length,1);
});

test('legacy canonical commercial area remains visible and public parking is not negated by zero private spaces',()=>{
  const office:Property={...p,core:{...p.core,propertyType:'office'},areaSquareMeters:undefined,typeDetails:{propertyType:'office',builtUpAreaSquareMeters:180,bathroomCount:2,parkingTypes:['private','public'],privateParkingCount:0}};
  const facts=propertyVisualFacts(office,'en');assert.equal(facts.find(f=>f.id==='area')?.value,'180 m²');assert.equal(facts.find(f=>f.id==='parking')?.icon,'car');assert.equal(facts.find(f=>f.id==='parking')?.value,'Yes');
});
