import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PROPERTY_TYPES, type Property, type SeekerRequirement } from '../../lib/property-domain/src/index.ts';
import { circlePropertyFacts, circleRequestFacts } from '../../artifacts/mobile/services/circleMatchingApi.ts';
import { matchCircleSnapshot } from '../../supabase/functions/circle-match-worker/engine.ts';

const id = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const buyer = '33333333-3333-4333-8333-333333333333';

test('circle projections and the server support every current type and transaction without private fields', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema viewstate_circle;`);
    const migration = await readFile(new URL('../../supabase/migrations/20261111130000_circle_all_property_types.sql', import.meta.url), 'utf8');
    await db.exec(migration.split('create function public.vs_circle_request(')[0]);
    const valid = async (facts: unknown, request = false) => (
      await db.query<{ valid: boolean }>(request
        ? 'select viewstate_circle.valid_request_facts($1) valid'
        : 'select viewstate_circle.valid_facts($1,$2) valid',
      request ? [JSON.stringify(facts)] : [JSON.stringify(facts), id])
    ).rows[0].valid;
    for (const propertyType of PROPERTY_TYPES) {
      for (const transaction of ['rent', 'sale'] as const) {
        const area = { id: 'salmiya' };
        const property = {
          core: { id, propertyType, locationArea: area, privateNotes: { value: 'SECRET', privacy: { classification: 'private_notes', disclosurePolicy: 'never' } } },
          activeOffer: { id, propertyCoreId: id, transaction, ...(transaction === 'sale' ? { salePrice: { amount: 100000, currencyCode: 'KWD' } } : { rentalPrice: { amount: 500, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' }) },
          typeDetails: {
            propertyType,
            builtUpAreaSquareMeters: 100,
            ...(propertyType === 'floor' ? { floorUse: 'commercial' } : {}),
            ...(propertyType === 'other_built_property' ? { propertyUse: 'commercial', clarification: { value: 'SECRET', privacy: { classification: 'normal', disclosurePolicy: 'normal' } } } : {}),
            ...(propertyType === 'shop' ? { hasGlassFront: true, frontageWidthMeters: 6, commercialActivity: { value: 'retail', privacy: { classification: 'normal', disclosurePolicy: 'normal' } } } : {}),
          },
        } as Property;
        const requirement = {
          id, propertyType, notes: 'SECRET', seekerId: buyer,
          preferredAreaIds: ['salmiya'], preferredAreaMode: 'specific_areas',
          budget: { maximum: transaction === 'rent' ? 500 : 100000, currencyCode: 'KWD' },
          catalogPreferences: [{ kind: 'number', field: 'builtUpAreaSquareMeters', comparison: 'minimum', value: 90 }],
          ...(propertyType === 'floor' ? { floorUse: 'commercial' } : {}),
          ...(propertyType === 'other_built_property' ? { propertyUse: 'commercial' } : {}),
          ...(propertyType === 'shop' ? { commercialActivity: 'retail' } : {}),
          ...(transaction === 'rent' ? { purpose: 'rent', rentalPeriodId: 'monthly' } : { purpose: 'buy' }),
        } as SeekerRequirement;
        const facts = circlePropertyFacts(property);
        const projected = circleRequestFacts(requirement);
        const scenario = `${propertyType} ${transaction}`;
        if (propertyType === 'commercial_complex' && transaction === 'rent') {
          assert.equal(facts, null);
          assert.equal(projected, null);
          continue;
        }
        assert.ok(facts, scenario);
        assert.ok(projected, scenario);
        assert.doesNotMatch(JSON.stringify([facts, projected]), /SECRET|seekerId|privateNotes/);
        assert.equal(await valid(facts), true, scenario);
        assert.equal(await valid(projected.p_facts, true), true, scenario);
        assert.equal(matchCircleSnapshot({
          revision: 1,
          properties: [{ id, owner: actor, facts }],
          requests: [{ id: buyer, owner: buyer, facts: projected.p_facts }],
        }).length, 1, scenario);
        assert.equal(await valid({ ...facts, core: { ...facts.core, exactLocation: 'private' } }), false);
        assert.equal(await valid({ ...projected.p_facts, notes: 'private' }, true), false);
      }
    }
  } finally {
    await db.close();
  }
});
