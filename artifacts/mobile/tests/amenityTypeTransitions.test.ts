import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResidentialAmenity } from '@workspace/property-domain';
import {
  applyFloorTransition,
  applyRequirementTransition,
  createFloorTransitionProposal,
  createRequirementTransitionProposal,
  isDetailFieldApplicable,
  supportsRequirementAmenities,
} from '@/services/amenityTypeTransitions';
import { AMENITY_TRANSITION_COPY } from '@/services/amenityTransitionCopy';
import './propertyTypeTransition.test.ts';

test('Arabic and English transition fallback copy is readable and actionable', () => {
  assert.match(AMENITY_TRANSITION_COPY.en.amenitiesNotAllowed, /Property Type/);
  assert.match(AMENITY_TRANSITION_COPY.en.amenitiesNotAllowed, /remove the preferences/);
  assert.match(AMENITY_TRANSITION_COPY.ar.amenitiesNotAllowed, /نوع العقار/);
  assert.match(AMENITY_TRANSITION_COPY.ar.amenitiesNotAllowed, /أزل التفضيلات/);
  assert.match(AMENITY_TRANSITION_COPY.en.draftOnly, /until you press Save/);
  assert.match(AMENITY_TRANSITION_COPY.ar.draftOnly, /حتى تضغط على حفظ/);
});

test('Floor transition uses canonical applicability and treats false and zero as populated', () => {
  const fields = {
    floorUse: 'residential',
    builtUpAreaSquareMeters: '0',
    bathroomCount: '0',
    parkingSpaceCount: '2',
    bedroomCount: '0',
    furnishing: 'unfurnished',
    hasMaidRoom: 'false',
    hasHeating: 'true',
  } as const;
  const proposal = createFloorTransitionProposal('property:A', fields, 'commercial');
  assert.ok(proposal);
  assert.deepEqual(
    proposal.affected.map(item => [item.field, item.value]),
    [
      ['bedroomCount', '0'],
      ['furnishing', 'unfurnished'],
      ['hasMaidRoom', 'false'],
      ['hasHeating', 'true'],
    ],
  );
  assert.equal(isDetailFieldApplicable('bathroomCount', 'floor', 'commercial'), true);
  assert.equal(isDetailFieldApplicable('bedroomCount', 'floor', 'commercial'), false);

  const next = applyFloorTransition('property:A', fields, proposal);
  assert.deepEqual(next, {
    floorUse: 'commercial',
    builtUpAreaSquareMeters: '0',
    bathroomCount: '0',
    parkingSpaceCount: '2',
  });
});

test('Floor transition without incompatible populated values needs no destructive confirmation', () => {
  const fields = {
    floorUse: 'residential',
    builtUpAreaSquareMeters: '300',
    bathroomCount: '2',
    bedroomCount: '',
  } as const;
  const proposal = createFloorTransitionProposal('property:A', fields, 'commercial');
  assert.ok(proposal);
  assert.deepEqual(proposal.affected, []);
  assert.deepEqual(applyFloorTransition('property:A', fields, proposal), {
    floorUse: 'commercial',
    builtUpAreaSquareMeters: '300',
    bathroomCount: '2',
    bedroomCount: '',
  });

  const commercialFields = {
    floorUse: 'commercial',
    builtUpAreaSquareMeters: '300',
    bathroomCount: '2',
    intendedUse: '',
  } as const;
  const residentialProposal = createFloorTransitionProposal(
    'property:A',
    commercialFields,
    'residential',
  );
  assert.ok(residentialProposal);
  assert.deepEqual(residentialProposal.affected, []);
  assert.deepEqual(applyFloorTransition('property:A', commercialFields, residentialProposal), {
    floorUse: 'residential',
    builtUpAreaSquareMeters: '300',
    bathroomCount: '2',
    intendedUse: '',
  });
});

test('Floor transition removes only populated Commercial fields when switching to Residential', () => {
  const fields = {
    floorUse: 'commercial',
    bathroomCount: '2',
    intendedUse: 'clinic',
    commercialActivity: 'medical',
    frontageWidthMeters: '0',
  } as const;
  const proposal = createFloorTransitionProposal('property:commercial', fields, 'residential');
  assert.ok(proposal);
  assert.deepEqual(
    proposal.affected.map(item => [item.field, item.value]),
    [
      ['intendedUse', 'clinic'],
      ['commercialActivity', 'medical'],
      ['frontageWidthMeters', '0'],
    ],
  );
  assert.deepEqual(applyFloorTransition('property:commercial', fields, proposal), {
    floorUse: 'residential',
    bathroomCount: '2',
  });
  assert.equal(applyFloorTransition('property:other', fields, proposal), null);
});

test('Floor proposals reject another record, newer draft, and duplicate application', () => {
  const fields = { floorUse: 'residential', bedroomCount: '3', hasBalcony: 'false' } as const;
  const proposal = createFloorTransitionProposal('property:A', fields, 'commercial');
  assert.ok(proposal);
  assert.equal(applyFloorTransition('property:B', fields, proposal), null);
  assert.equal(applyFloorTransition('property:A', { ...fields, bedroomCount: '4' }, proposal), null);
  const next = applyFloorTransition('property:A', fields, proposal);
  assert.ok(next);
  assert.equal(applyFloorTransition('property:A', next, proposal), null);
});

test('Requirement transitions omit missing or empty preferences without confirmation', () => {
  assert.equal(supportsRequirementAmenities('apartment'), true);
  assert.equal(supportsRequirementAmenities('office'), false);
  assert.equal(createRequirementTransitionProposal('requirement:A', 'apartment', undefined, 'office'), null);
  assert.equal(createRequirementTransitionProposal('requirement:A', 'apartment', [], 'office'), null);
});

test('Requirement confirmation removes only non-empty preferences and preserves a valid destination', () => {
  const preferences: readonly ResidentialAmenity[] = ['balcony', 'maid_room'];
  const proposal = createRequirementTransitionProposal(
    'requirement:A', 'apartment', preferences, 'office',
  );
  assert.ok(proposal);
  assert.deepEqual(proposal.affected, preferences);
  assert.deepEqual(
    applyRequirementTransition('requirement:A', 'apartment', preferences, proposal),
    { propertyType: 'office', preferredAmenities: undefined },
  );
});

test('Requirement proposals reject another record, changed preferences, and duplicate application', () => {
  const preferences: readonly ResidentialAmenity[] = ['garden'];
  const proposal = createRequirementTransitionProposal(
    'requirement:A', 'villa', preferences, 'warehouse',
  );
  assert.ok(proposal);
  assert.equal(applyRequirementTransition('requirement:B', 'villa', preferences, proposal), null);
  assert.equal(applyRequirementTransition('requirement:A', 'villa', ['garden', 'balcony'], proposal), null);
  const next = applyRequirementTransition('requirement:A', 'villa', preferences, proposal);
  assert.ok(next);
  assert.equal(
    applyRequirementTransition('requirement:A', next.propertyType, next.preferredAmenities, proposal),
    null,
  );
});