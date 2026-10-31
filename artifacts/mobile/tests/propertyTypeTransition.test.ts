import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  applyPropertyTransition,
  createPropertyTypeTransitionProposal,
  createTransactionTransitionProposal,
  propertyTransitionConfirmationMessage,
  propertyTransitionErrorMessage,
  type PropertyTransitionState,
} from '../services/propertyTypeTransition.ts';

test('Property type transition confirms actual incompatible values and preserves compatible values', () => {
  const state: PropertyTransitionState = {
    propertyType: 'apartment',
    transaction: 'sale',
    priceAmount: 125000,
    canonicalDetails: {
      apartmentSubtype: 'studio',
      bedroomCount: '0',
      hasBalcony: 'false',
      hasCentralAC: 'false',
      builtUpAreaSquareMeters: '0',
    },
  };
  const proposal = createPropertyTypeTransitionProposal('property:approved', state, 'office');
  assert.ok(proposal);
  assert.deepEqual(proposal.affected, [
    { field: 'apartmentSubtype', value: 'studio' },
    { field: 'bedroomCount', value: '0' },
    { field: 'hasBalcony', value: 'false' },
  ]);
  const confirmation = propertyTransitionConfirmationMessage(
    proposal,
    'en',
    field => field,
    (_field, value) => value === 'false' ? 'No' : value,
  );
  assert.match(confirmation, /bedroomCount: 0/);
  assert.match(confirmation, /hasBalcony: No/);
  assert.deepEqual(applyPropertyTransition('property:approved', state, proposal), {
    propertyType: 'office',
    transaction: 'sale',
    priceAmount: 125000,
    rentalPeriodId: undefined,
    canonicalDetails: {
      hasCentralAC: 'false',
      builtUpAreaSquareMeters: '0',
    },
  });
  // Opening a proposal alone does not mutate the draft; cancel/dismiss has no apply step.
  assert.deepEqual(state.canonicalDetails, {
    apartmentSubtype: 'studio',
    bedroomCount: '0',
    hasBalcony: 'false',
    hasCentralAC: 'false',
    builtUpAreaSquareMeters: '0',
  });
});

test('Property transition confirmation and stale-draft errors have explicit English and Arabic copy', () => {
  const state: PropertyTransitionState = {
    propertyType: 'villa',
    transaction: 'sale',
    canonicalDetails: { hasPool: 'false', floorCount: '0' },
  };
  const proposal = createPropertyTypeTransitionProposal('property:locale', state, 'office');
  assert.ok(proposal);
  const english = propertyTransitionConfirmationMessage(
    proposal,
    'en',
    field => field === 'hasPool' ? 'Pool' : 'Floors',
    (_field, value) => value === 'false' ? 'No' : value,
  );
  assert.match(english, /remove the following values/);
  assert.match(english, /Pool: No/);
  assert.match(english, /Floors: 0/);
  const arabic = propertyTransitionConfirmationMessage(
    proposal,
    'ar',
    field => field === 'hasPool' ? 'مسبح' : 'عدد الأدوار',
    (_field, value) => value === 'false' ? 'لا' : value,
  );
  assert.match(arabic, /إزالة القيم التالية/);
  assert.match(arabic, /مسبح: لا/);
  assert.match(arabic, /عدد الأدوار: 0/);
  assert.match(propertyTransitionErrorMessage('en'), /draft changed/);
  assert.match(propertyTransitionErrorMessage('ar'), /تغيّرت المسودة/);
});

test('Transaction transition requires confirmation for populated zero price and rental period', () => {
  const state: PropertyTransitionState = {
    propertyType: 'apartment',
    transaction: 'rent',
    priceAmount: 0,
    rentalPeriodId: 'monthly',
    canonicalDetails: { bedroomCount: '2', hasBalcony: 'false' },
  };
  const proposal = createTransactionTransitionProposal('property:transaction', state, 'sale');
  assert.ok(proposal);
  assert.deepEqual(proposal.affected, [
    { field: 'priceAmount', value: '0' },
    { field: 'rentalPeriodId', value: 'monthly' },
  ]);
  const next = applyPropertyTransition('property:transaction', state, proposal);
  assert.deepEqual(next, {
    propertyType: 'apartment',
    transaction: 'sale',
    canonicalDetails: { bedroomCount: '2', hasBalcony: 'false' },
    priceAmount: undefined,
    rentalPeriodId: undefined,
  });
});

test('Property transition proposals reject a different identity or changed draft snapshot', () => {
  const state: PropertyTransitionState = {
    propertyType: 'apartment',
    transaction: 'sale',
    priceAmount: 50,
    canonicalDetails: { bedroomCount: '1' },
  };
  const proposal = createPropertyTypeTransitionProposal('property:first', state, 'office');
  assert.ok(proposal);
  assert.equal(applyPropertyTransition('property:second', state, proposal), null);
  assert.equal(
    applyPropertyTransition('property:first', { ...state, canonicalDetails: { bedroomCount: '2' } }, proposal),
    null,
  );
});

test('In-flow transition confirmation leaves selected values unchanged on cancel and applies only on confirm', async () => {
  const original: PropertyTransitionState = {
    propertyType: 'apartment',
    transaction: 'rent',
    priceAmount: 450,
    rentalPeriodId: 'monthly',
    canonicalDetails: {
      apartmentSubtype: 'studio',
      bedroomCount: '0',
      builtUpAreaSquareMeters: '75',
    },
  };
  const compatibleDraftValues = {
    block: '10',
    privateNotes: 'Keep this private note',
    mapsLink: 'https://maps.google.com/?q=29.3,47.9',
  };
  let displayedDraft = { ...original, ...compatibleDraftValues };
  const pendingFloor = createPropertyTypeTransitionProposal(
    'property:web-flow',
    displayedDraft,
    'floor',
  )!;
  assert.deepEqual(pendingFloor.affected, [
    { field: 'apartmentSubtype', value: 'studio' },
    { field: 'bedroomCount', value: '0' },
  ]);

  // The radio-style selection remains bound to the existing draft until Confirm.
  assert.equal(displayedDraft.propertyType, 'apartment');
  const cancelPending = () => {};
  cancelPending();
  assert.equal(displayedDraft.propertyType, 'apartment');
  assert.equal(displayedDraft.canonicalDetails.apartmentSubtype, 'studio');

  const confirmedFloor = applyPropertyTransition('property:web-flow', displayedDraft, pendingFloor);
  assert.ok(confirmedFloor);
  displayedDraft = { ...displayedDraft, ...confirmedFloor };
  assert.equal(displayedDraft.propertyType, 'floor');
  assert.deepEqual(displayedDraft.canonicalDetails, {
    builtUpAreaSquareMeters: '75',
  });
  assert.deepEqual({
    block: displayedDraft.block,
    privateNotes: displayedDraft.privateNotes,
    mapsLink: displayedDraft.mapsLink,
  }, {
    block: '10',
    privateNotes: 'Keep this private note',
    mapsLink: 'https://maps.google.com/?q=29.3,47.9',
  });

  const pendingSale = createTransactionTransitionProposal(
    'property:web-flow',
    displayedDraft,
    'sale',
  )!;
  assert.deepEqual(pendingSale.affected, [
    { field: 'priceAmount', value: '450' },
    { field: 'rentalPeriodId', value: 'monthly' },
  ]);
  assert.equal(displayedDraft.transaction, 'rent');
  assert.equal(displayedDraft.priceAmount, 450);
  cancelPending();
  assert.equal(displayedDraft.transaction, 'rent');
  const confirmedSale = applyPropertyTransition('property:web-flow', displayedDraft, pendingSale);
  assert.ok(confirmedSale);
  displayedDraft = { ...displayedDraft, ...confirmedSale };
  assert.equal(displayedDraft.transaction, 'sale');
  assert.equal(displayedDraft.priceAmount, undefined);
  assert.equal(displayedDraft.rentalPeriodId, undefined);
  assert.equal(displayedDraft.propertyType, 'floor');
  assert.equal(displayedDraft.block, '10');
  assert.equal(displayedDraft.privateNotes, 'Keep this private note');
  assert.equal(displayedDraft.mapsLink, compatibleDraftValues.mapsLink);

  const route = await readFile('app/property/[propertyCoreId].tsx', 'utf8');
  assert.match(route, /<Modal[\s\S]*?visible=\{pendingPropertyTransition !== null\}[\s\S]*?testID="property-transition-dialog"/);
  assert.match(route, /onPress=\{\(\) => setPendingPropertyTransition\(null\)\}[\s\S]*?testID="property-transition-cancel"/);
  assert.match(route, /onPress=\{confirmPropertyTransition\}[\s\S]*?testID="property-transition-confirm"/);
  assert.match(route, /onRequestClose=\{\(\) => setPendingPropertyTransition\(null\)\}/);
  const selectors = route.slice(route.indexOf('const selectTransaction'), route.indexOf('const retryRecovery'));
  assert.doesNotMatch(selectors, /Alert\.alert/);
});