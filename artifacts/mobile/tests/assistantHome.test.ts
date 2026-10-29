import test from 'node:test';
import assert from 'node:assert/strict';
import { MATCH_ENGINE_VERSION, type MatchResult, type Property, type SeekerRequirement } from '@workspace/property-domain';
import { homeQuickRoute, homeGreetingPeriod, searchAssistantFollowups, selectHomeMatches } from '../services/assistantHome';
import { createFollowup, initialAssistant, type AssistantInventory } from '../services/dailyAssistant';
import { BrokerInitiatedMatching, type BrokerMatchingRunResult } from '../services/brokerInitiatedMatching';
import { MyPropertiesMatchingSource } from '../services/myPropertiesMatchingSource';
import type { Person } from '../services/people';
const request = (id = '11111111-1111-4111-8111-111111111111', seekerId = 'one'): SeekerRequirement => ({ id, seekerId, purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'], preferredAreaMode: 'specific_areas', budget: { minimum: 400, maximum: 500, currencyCode: 'KWD' }, rentalPeriodId: 'monthly', notes: '' });
const person = (id: string): Person => ({ id, name: id, classifications: ['seeker'], displayPhone: '', normalizedPhone: '', notes: '' });
const result = (propertyId: string, score: number, requirementId = request().id): MatchResult => ({ engineVersion: MATCH_ENGINE_VERSION, requirementId, propertyId, eligible: true, qualifies: true, score, priceAmount: 490, category: 'direct', differenceCount: 0, unknownCount: 0, includedWeight: 100, locationRank: 0, ineligibilityReasons: [], explanations: [] });
const run = (matches: MatchResult[], requirementId = request().id): BrokerMatchingRunResult => ({ engineVersion: MATCH_ENGINE_VERSION, requirementId, matches, needsConfirmation: [] });
test('Home quick actions use the existing canonical forms and leave sharing/import to explicit flows', () => {
  assert.equal(homeQuickRoute('property'), '/capture/transaction'); assert.equal(homeQuickRoute('person'), '/person/new'); assert.equal(homeQuickRoute('matching'), '/matching');
  assert.equal(homeQuickRoute('share'), null); assert.equal(homeQuickRoute('import'), null);
});
test('Home top five retain highest scores, deduplicate person/property across requirements, and exclude stale or unresolved matches', () => {
  const a = request(), b = request('22222222-2222-4222-8222-222222222222'), c = request('33333333-3333-4333-8333-333333333333', 'two');
  const outputs = [run([result('p1', 85), ...Array.from({ length: 7 }, (_, i) => result('x' + i, 80 + i))]),
    run([result('p1', 98, b.id), { ...result('bad', 100, b.id), category: 'needs_confirmation' }, { ...result('old', 100, b.id), engineVersion: 'old' as typeof MATCH_ENGINE_VERSION }, { ...result('wrong-request', 100, b.id), requirementId: 'wrong' }, { ...result('excluded', 100, b.id), eligible: false }], b.id),
    run([result('p1', 97, c.id)], c.id)];
  const shortlist = selectHomeMatches([a, b, c], [person('one'), person('two')], outputs);
  assert.equal(shortlist.length, 5); assert.deepEqual(shortlist.slice(0, 2).map(x => [x.person.id, x.result.propertyId, x.result.score]), [['one', 'p1', 98], ['two', 'p1', 97]]);
  assert.equal(new Set(shortlist.map(x => JSON.stringify([x.person.id, x.result.propertyId]))).size, 5);
  assert.equal(shortlist.some(x => ['bad', 'old', 'wrong-request', 'excluded'].includes(x.result.propertyId)), false);
  assert.deepEqual(selectHomeMatches([a], [], outputs), []);
  assert.deepEqual(selectHomeMatches([a], [person('one')], [{ ...outputs[0], engineVersion: 'old' as typeof MATCH_ENGINE_VERSION }]), []);
});
test('Home recommendations come from the existing engine, preserve its score and never invent padding', async () => {
  const req = request();
  const property: Property = { core: { id: 'property', propertyType: 'apartment', locationArea: { id: 'salmiya' } }, activeOffer: { id: 'offer', propertyCoreId: 'property', transaction: 'rent', rentalPrice: { amount: 490, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' }, typeDetails: { propertyType: 'apartment', bedroomCount: 3 } };
  const engine = new BrokerInitiatedMatching({ getRequirement: async () => req }, new MyPropertiesMatchingSource({ getProperties: async () => [property] }));
  const output = await engine.runForRequirement(req.id), before = JSON.stringify(output);
  const selected = selectHomeMatches([req], [person('one')], [output]);
  assert.equal(selected.length, 1); assert.equal(selected[0].result, output.matches[0]); assert.equal(selected[0].result.score, output.matches[0].score); assert.equal(JSON.stringify(output), before);
});
test('Global follow-up search finds linked people/areas, all statuses and Arabic/Persian ISO/slash dates without changing names', () => {
  const inventory: AssistantInventory = { people: [{ id: 'one', name: 'أحمد Original', client: true }], properties: [{ id: 'property', title: 'شقة · السالمية' }] };
  const state = createFollowup(initialAssistant(), { kind: 'call', title: 'تابع السعر', date: '2026-10-30', time: '09:00', duration: 45, personId: 'one', personName: '', propertyId: 'property', notes: 'اتصل بعد المعاينة' }, inventory, 'task', '2026-10-29T09:00:00Z');
  const tasks = [{ ...state.tasks[0], status: 'done' as const }];
  for (const query of ['أحمد', 'السالمية', '٢٠٢٦/١٠/٣٠', '۲۰۲۶-۱۰-۳۰', 'السعر المعاينة']) assert.equal(searchAssistantFollowups(tasks, inventory, query).length, 1, query);
  assert.deepEqual(searchAssistantFollowups(tasks, inventory, 'unknown'), []); assert.deepEqual(searchAssistantFollowups(tasks, inventory, ''), []); assert.equal(inventory.people[0].name, 'أحمد Original');
});
test('Home greeting uses Kuwait time rather than the device UTC date/hour', () => {
  assert.equal(homeGreetingPeriod(new Date('2026-10-29T05:00:00Z')), 'morning');
  assert.equal(homeGreetingPeriod(new Date('2026-10-29T10:00:00Z')), 'afternoon');
  assert.equal(homeGreetingPeriod(new Date('2026-10-29T16:00:00Z')), 'evening');
});
