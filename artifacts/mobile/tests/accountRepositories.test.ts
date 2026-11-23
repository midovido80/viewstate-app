import test from 'node:test';
import assert from 'node:assert/strict';
import './platformModuleStubs.ts';
import { WebStore } from '../services/persistence.ts';
import { createAccountScope } from '../services/accountScope.ts';
import { createAccountRepositories } from '../services/accountRepositories.ts';
import { createPerson } from '../services/people.ts';
import type { Property, RentSeekerRequirement } from '@workspace/property-domain';

const A = '179f829a-eb0d-44ad-8e64-e64a87900c41', B = '29f45c92-1f5e-472b-b59c-06f24ba60eba';
function harness() {
  const values = new Map<string, string>();
  const source = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
  const locks = { request: async <T>(_key: string, _options: { mode: 'exclusive' }, work: () => Promise<T>) => work() };
  const resources = (id: string) => createAccountRepositories(createAccountScope(id), source,
    storage => new WebStore(storage, locks), async work => work());
  return { values, resources };
}
const property: Property = { core: { id: '11111111-1111-4111-8111-111111111111', propertyType: 'apartment', locationArea: { id: 'salmiya' } }, activeOffer: { id: '22222222-2222-4222-8222-222222222222', propertyCoreId: '11111111-1111-4111-8111-111111111111', transaction: 'sale', salePrice: { amount: 50000, currencyCode: 'KWD' } } };

test('the real WebStore isolates properties, people and canonical requirements across accounts and reloads', async () => {
  const h = harness(), a = h.resources(A), b = h.resources(B);
  await a.store.init(); await b.store.init();
  await a.store.saveProperty(property);
  const person = createPerson({ id: '33333333-3333-4333-8333-333333333333', classifications: ['seeker'], name: 'Private A', displayPhone: '55550101', notes: '' });
  await a.store.savePerson(person);
  const requirement: RentSeekerRequirement = { id: '44444444-4444-4444-8444-444444444444', seekerId: person.id, purpose: 'rent', propertyType: 'apartment', preferredAreaIds: ['salmiya'], budget: { minimum: 450, maximum: 800, currencyCode: 'KWD' }, notes: 'Private A requirement' };
  await a.store.saveRequirement(requirement);
  assert.equal((await a.store.getProperties()).length, 1);
  assert.equal((await a.store.getRequirements()).length, 1);
  assert.deepEqual(await b.store.getProperties(), []);
  assert.deepEqual(await b.store.getPeople(), []);
  assert.deepEqual(await b.store.getRequirements(), []);
  assert.equal(await b.store.getProperty(property.core.id), null);
  assert.equal(await b.store.getPerson(person.id), null);
  assert.equal(await b.store.getRequirement(requirement.id), null);
  a.scope.revoke();
  await assert.rejects(async () => a.store.getProperties(), /ACCOUNT_SCOPE_CLOSED/);
  const reloaded = h.resources(A); await reloaded.store.init();
  assert.equal((await reloaded.store.getProperty(property.core.id))?.core.id, property.core.id);
  assert.equal((await reloaded.store.getPerson(person.id))?.name, 'Private A');
  assert.equal((await reloaded.store.getRequirement(requirement.id))?.notes, 'Private A requirement');
});

test('actual profile settings, assistant state and notice settings have independent persisted namespaces', async () => {
  const h = harness(), a = h.resources(A), b = h.resources(B);
  await a.settings.load(); await b.settings.load();
  await a.settings.update(value => ({ ...value, profile: { name: 'User A', company: 'A office', photo: '' } }));
  assert.equal((await b.settings.load()).profile.name, '');
  await b.settings.update(value => ({ ...value, profile: { name: 'User B', company: '', photo: '' } }));
  assert.equal((await a.settings.load()).profile.name, 'User A');
  await a.assistant.load();
  await a.assistant.update(value => ({ ...value, settings: { ...value.settings, checkAfterDays: 14 } }));
  assert.equal((await b.assistant.load()).settings.checkAfterDays, 7);
  await a.notices.update(value => ({ ...value, settings: { ...value.settings, quiet: true } }));
  assert.equal((await b.notices.load()).settings.quiet, false);
  a.scope.revoke();
  await assert.rejects(async () => a.settings.load(), /ACCOUNT_SCOPE_CLOSED/);
  await assert.rejects(async () => a.assistant.load(), /ACCOUNT_SCOPE_CLOSED/);
  await assert.rejects(async () => a.notices.load(), /ACCOUNT_SCOPE_CLOSED/);
});
