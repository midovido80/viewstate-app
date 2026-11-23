import test from 'node:test';
import assert from 'node:assert/strict';
import './platformModuleStubs.ts';
import { accountEntryStage, accountShareSignature, ONBOARDING_SEEN_KEY } from '../services/accountOnboarding.ts';
import { validateUserContactProfile, AccountProfileValidationError } from '../services/googleAccountContract.ts';
import { createAccountScope } from '../services/accountScope.ts';
import { createDraftRepository } from '../services/draft.ts';
import { assertOwnedMediaUri } from '../services/accountMedia.ts';
import { createEditDraft, savePropertyEditDraft, discardPropertyEditDraft, loadPropertyEditDraft } from '../services/propertyUpdateRecovery.ts';
import type { Property } from '@workspace/property-domain';
const A = '179f829a-eb0d-44ad-8e64-e64a87900c41', B = '29f45c92-1f5e-472b-b59c-06f24ba60eba';
const profile = { user_id: A, display_name: 'Ahmed', phone: '+965 55550101', company: 'Personal office', classification: 'broker' as const, other_classification: '' };
function harness() {
  const values = new Map<string, string>(), locks: string[] = [];
  const source = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); }, withExclusiveLock: async <T>(key: string, work: () => Promise<T>) => { locks.push(key); return work(); } };
  const a = createAccountScope(A), b = createAccountScope(B);
  return { a, b, sa: a.storage(source), sb: b.storage(source), values, locks };
}
test('first user must complete profile and welcome; completion belongs to each owner', async () => {
  assert.equal(accountEntryStage(null, true), 'profile'); assert.equal(accountEntryStage(profile, false), 'welcome');
  const h = harness(); await h.sa.setItem(ONBOARDING_SEEN_KEY, '1');
  assert.equal(accountEntryStage(profile, await h.sa.getItem(ONBOARDING_SEEN_KEY) === '1'), 'ready');
  assert.equal(accountEntryStage({ ...profile, user_id: B }, await h.sb.getItem(ONBOARDING_SEEN_KEY) === '1'), 'welcome');
});
test('profile validates missing fields, other role and Arabic phone digits', () => {
  assert.throws(() => validateUserContactProfile(A, { ...profile, display_name: '', phone: '', classification: '' as never }), e => e instanceof AccountProfileValidationError && e.fields.join(',') === 'display_name,phone,classification');
  assert.throws(() => validateUserContactProfile(A, { ...profile, classification: 'other' }), /PROFILE_INCOMPLETE/);
  assert.equal(validateUserContactProfile(A, { ...profile, phone: '+٩٦٥ ۵۵۵۵۰١۰١' }).phone, '+965 55550101');
  assert.equal(validateUserContactProfile(A, { ...profile, other_classification: 'stale' }).other_classification, '');
});
test('signature defaults off and shares selected contact fields without owner ID', () => {
  assert.equal(accountShareSignature(profile, false, 'ar'), ''); assert.equal(accountShareSignature(null, true, 'en'), '');
  const text = accountShareSignature(profile, true, 'ar'); assert.match(text, /Ahmed/); assert.match(text, /\+965/); assert.match(text, /وسيط/); assert.doesNotMatch(text, new RegExp(A));
  assert.match(accountShareSignature({ ...profile, classification: 'other', other_classification: 'Property manager' }, true, 'en'), /Property manager/);
});
test('capture draft repository revocation cannot read the next owner', async () => {
  const h = harness(), a = createDraftRepository(h.sa), b = createDraftRepository(h.sb);
  await a.saveDraft({ propertyType: 'apartment', locationAreaId: 'salmiya' });
  await b.saveDraft({ propertyType: 'warehouse', locationAreaId: 'hawalli' });
  assert.equal((await a.loadDraft())?.propertyType, 'apartment');
  assert.equal((await b.loadDraft())?.propertyType, 'warehouse');
  await a.clearDraft();
  assert.equal((await b.loadDraft())?.propertyType, 'warehouse');
  h.a.revoke();
  await assert.rejects(() => a.loadDraft(), /ACCOUNT_SCOPE_CLOSED|could not be read/i);
  assert.equal((await b.loadDraft())?.propertyType, 'warehouse');
});
test('recovery generations and locks stay independent for the same property ID', async () => {
  const h = harness();
  const property: Property = { core: { id: '11111111-1111-4111-8111-111111111111', propertyType: 'apartment', locationArea: { id: 'salmiya' } }, activeOffer: { id: '22222222-2222-4222-8222-222222222222', propertyCoreId: '11111111-1111-4111-8111-111111111111', transaction: 'sale', salePrice: { amount: 50000, currencyCode: 'KWD' } } };
  const a1 = createEditDraft(property, h.sa), b1 = createEditDraft(property, h.sb);
  assert.equal(await savePropertyEditDraft(a1, null, h.sa), true); assert.equal(await discardPropertyEditDraft(property.core.id, a1, h.sa), true);
  const a2 = createEditDraft(property, h.sa); assert.ok(a2.writeGeneration > a1.writeGeneration);
  assert.equal(await savePropertyEditDraft(a2, null, h.sa), true); assert.equal(await savePropertyEditDraft(b1, null, h.sb), true);
  assert.equal((await loadPropertyEditDraft(property.core.id, h.sb))?.writeGeneration, b1.writeGeneration);
  assert.ok(h.locks.some(key => key.includes(A))); assert.ok(h.locks.some(key => key.includes(B)));
});
test('media rejects foreign owners, prefix siblings, traversal and encoded separators', () => {
  const root = `file:///data/app/viewstate-users/${A}`;
  assert.doesNotThrow(() => assertOwnedMediaUri(`${root}/properties/1/photo.jpg`, root));
  for (const uri of [`file:///data/app/viewstate-users/${B}/photo.jpg`, `${root}-other/photo.jpg`, `${root}/../${B}/photo.jpg`, `${root}/%2e%2e/${B}/photo.jpg`, `${root}/folder%2fphoto.jpg`, 'https://example.com/photo.jpg']) assert.throws(() => assertOwnedMediaUri(uri, root), /MEDIA_OWNER_MISMATCH/);
});
