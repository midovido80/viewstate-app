import { verifyGuestMediaCopy } from '../services/guestMediaVerification.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import './platformModuleStubs.ts';
import { WebStore } from '../services/persistence.ts';
import { createAccountScope, createGuestScope, type AccountStorage } from '../services/accountScope.ts';
import { createAccountRepositories } from '../services/accountRepositories.ts';
import { createGuestRepository, guestLocalId, validateGuestContact, GUEST_TRANSFER_KEY } from '../services/guestAccount.ts';
import { transferGuest, snapshotGuest, type TransferSide } from '../services/guestTransfer.ts';
import { createPerson } from '../services/people.ts';
import { initialAccountFoundation, ACCOUNT_STORAGE_KEY } from '../services/accountFoundation.ts';
import { initialAssistant, ASSISTANT_STORAGE_KEY } from '../services/dailyAssistant.ts';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
const G = '179f829a-eb0d-44ad-8e64-e64a87900c41', A = '29f45c92-1f5e-472b-b59c-06f24ba60eba', B = '398f8a21-7595-4a6d-8801-bfbd3181f4cb';
function harness() {
  const values = new Map<string,string>(); let fail = '';
  const locks = new Map<string,Promise<unknown>>();
  const storage: AccountStorage = { getAllKeys: async () => [...values.keys()], getItem: async key => values.get(key) ?? null, setItem: async (key,value) => { if (fail && key.includes(fail)) { fail = ''; throw new Error('DISK_FULL'); } values.set(key,value); }, removeItem: async key => { values.delete(key); },
    async withExclusiveLock(key, work) { const prior = locks.get(key) ?? Promise.resolve(); const next = prior.catch(() => undefined).then(work); locks.set(key, next); return next; } };
  const webLocks = { request: async <T>(_key: string, _opts: unknown, work: () => Promise<T>) => work() };
  function side(guest: boolean, id: string) {
    const scope = guest ? createGuestScope(id) : createAccountScope(id);
    const resources = createAccountRepositories(scope, storage, scoped => new WebStore(scoped, webLocks), async work => work());
    return { ...resources, assertActive: scope.assertActive };
  }
  const guest = side(true,G), a = side(false,A), b = side(false,B);
  return { values, storage, guest, a, b, side, failOnce: (value: string) => { fail = value; } };
}
const p: Property = { core:{id:'11111111-1111-4111-8111-111111111111',propertyType:'apartment',locationArea:{id:'salmiya'}},activeOffer:{id:'22222222-2222-4222-8222-222222222222',propertyCoreId:'11111111-1111-4111-8111-111111111111',transaction:'rent',rentalPrice:{amount:500,currencyCode:'KWD'},rentalPeriodId:'monthly'} };
const person = createPerson({id:'33333333-3333-4333-8333-333333333333',classifications:['seeker','owner'],name:'Guest contact',displayPhone:'55550101',notes:'Private guest note'});
const req: SeekerRequirement = {id:'44444444-4444-4444-8444-444444444444',seekerId:person.id,purpose:'rent',propertyType:'apartment',preferredAreaIds:['salmiya'],budget:{minimum:450,maximum:600,currencyCode:'KWD'},notes:''};
async function seed(side: TransferSide) {
 await side.store.init(); await side.store.savePerson(person); await side.store.saveProperty(p); await side.store.saveRequirement(req);
 await side.store.linkPersonToProperty({personId:person.id,propertyCoreId:p.core.id});
 await side.store.setPropertySource({personId:person.id,propertyCoreId:p.core.id,role:'owner'});
 await side.storage.setItem('@viewstate_property_draft',JSON.stringify({propertyType:'villa',locationAreaId:'salmiya'}));
}
const move = (h: ReturnType<typeof harness>, target = h.a) => transferGuest({guest:h.guest,target,targetUserId:target.scope.userId,rewriteMedia:async snapshot => snapshot});
test('guest contact needs a name only, normalizes optional phone, and saves exclusively through local storage', async () => {
 const h=harness(), repo=createGuestRepository(h.storage,()=>G);
 assert.deepEqual(validateGuestContact(' Ahmed ','') ,{name:'Ahmed',phone:''});
 assert.throws(()=>validateGuestContact('',''),/GUEST_NAME_REQUIRED/); assert.throws(()=>validateGuestContact('A','abc'),/GUEST_PHONE_INVALID/);
 const saved=await repo.save('Ahmed','+٩٦٥ ٥٥٥٥٠١٠١',null); assert.equal(saved.phone,'+965 55550101'); assert.deepEqual(await repo.read(),saved);
 const updated=await repo.save('Ahmed M','',saved); assert.equal(updated.id,G); assert.equal(updated.phone,'');
});
test('guest and Google namespaces differ even for the same UUID, and survive independent reload', async () => {
 const h=harness(), same=h.side(false,G); await seed(h.guest); await same.store.init();
 assert.deepEqual(await same.store.getProperties(),[]); assert.notEqual(h.guest.scope.databaseName,same.scope.databaseName); assert.notEqual(h.guest.mediaDatabaseName,same.mediaDatabaseName); assert.notEqual(h.guest.mediaDirectory,same.mediaDirectory);
 h.guest.scope.revoke(); const reload=h.side(true,G); await reload.store.init(); assert.equal((await reload.store.getProperties()).length,1); assert.equal((await reload.store.getPeople()).length,1);
});
test('real WebStore activation copies records, links, source and draft once; source survives and B stays empty', async () => {
 const h=harness(); await seed(h.guest); const before=await snapshotGuest(h.guest); await move(h); await move(h);
 assert.equal((await h.a.store.getProperties()).length,1); assert.equal((await h.a.store.getPeople()).length,1); assert.equal((await h.a.store.getRequirements()).length,1);
 assert.equal((await h.a.store.getPersonPropertyLinks()).length,1); assert.equal((await h.a.store.getPropertySource(p.core.id))?.personId,person.id);
 assert.equal(await h.a.storage.getItem('@viewstate_property_draft'),await h.guest.storage.getItem('@viewstate_property_draft')); assert.deepEqual(await snapshotGuest(h.guest),before);
 await h.b.store.init(); assert.deepEqual(await h.b.store.getProperties(),[]); assert.deepEqual(await h.b.store.getPeople(),[]);
 await assert.rejects(()=>move(h,h.b),/BOUND_TO_OTHER_ACCOUNT/);
});
test('existing account properties are retained when importing non-conflicting guest data', async () => {
 const h=harness(); await seed(h.guest); await h.a.store.init(); const other={...p,core:{...p.core,id:'55555555-5555-4555-8555-555555555555'},activeOffer:{...p.activeOffer,id:'66666666-6666-4666-8666-666666666666',propertyCoreId:'55555555-5555-4555-8555-555555555555'}};
 await h.a.store.saveProperty(other); await move(h); assert.equal((await h.a.store.getProperties()).length,2); assert.deepEqual(await h.a.store.getProperty(other.core.id),other);
});
test('contact phone duplicates block import without overwriting an existing identity or deleting guest data', async () => {
 const h=harness(); await seed(h.guest); await h.a.store.init(); const existing={...person,id:B,name:'Existing account contact'}; await h.a.store.savePerson(existing);
 await assert.rejects(()=>move(h),/CONTACT_CONFLICT/); assert.deepEqual(await h.a.store.getPerson(B),existing); assert.equal((await h.a.store.getProperties()).length,0); assert.equal((await h.guest.store.getProperties()).length,1);
});
test('a conflicting saved draft blocks before business writes', async () => {
 const h=harness(); await seed(h.guest); await h.a.storage.setItem('@viewstate_property_draft','{"propertyType":"warehouse"}');
 await assert.rejects(()=>move(h),/CONFLICT/); assert.equal((await h.a.store.getProperties()).length,0); assert.equal(await h.a.storage.getItem('@viewstate_property_draft'),'{"propertyType":"warehouse"}');
});
test('a partial disk failure is resumable only for its bound owner and does not duplicate records', async () => {
 const h=harness(); await seed(h.guest); h.failOnce(A+':@viewstate_properties'); await assert.rejects(()=>move(h),/DISK_FULL/);
 assert.equal(JSON.parse((await h.guest.storage.getItem(GUEST_TRANSFER_KEY))!).status,'pending'); await assert.rejects(()=>move(h,h.b),/BOUND_TO_OTHER_ACCOUNT/);
 await move(h); assert.equal((await h.a.store.getProperties()).length,1); assert.equal((await h.a.store.getPeople()).length,1); assert.equal((await h.guest.store.getProperties()).length,1);
});
test('concurrent destination claims cannot copy one guest workspace into two Google accounts', async () => {
 const h=harness(); await seed(h.guest); const results=await Promise.allSettled([move(h),move(h,h.b)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1); assert.equal((await h.a.store.getProperties()).length,1); await h.b.store.init(); assert.equal((await h.b.store.getProperties()).length,0);
});
test('account profile is preserved while guest settings and follow-ups are retained', async () => {
 const h=harness(); await seed(h.guest);
 await h.guest.storage.setItem(ACCOUNT_STORAGE_KEY,JSON.stringify({...initialAccountFoundation(),profile:{name:'Guest',company:'',photo:''},reducedMotion:true}));
 await h.a.storage.setItem(ACCOUNT_STORAGE_KEY,JSON.stringify({...initialAccountFoundation(),profile:{name:'Verified name',company:'Office',photo:''}}));
 await h.guest.storage.setItem(ASSISTANT_STORAGE_KEY,JSON.stringify({...initialAssistant(),settings:{showSuggestions:false,showOverdue:true,checkAfterDays:14}}));
 await move(h); const settings=JSON.parse((await h.a.storage.getItem(ACCOUNT_STORAGE_KEY))!); assert.equal(settings.profile.name,'Verified name'); assert.equal(settings.reducedMotion,true); assert.equal(JSON.parse((await h.a.storage.getItem(ASSISTANT_STORAGE_KEY))!).settings.checkAfterDays,14);
});
test('revoked account leases cannot receive guest records', async () => {
 const h=harness(); await seed(h.guest); h.a.scope.revoke(); await assert.rejects(()=>move(h),/ACCOUNT_SCOPE_CLOSED/); assert.equal((await h.guest.store.getProperties()).length,1);
});
test('media-copy failure binds the consented owner before copying and leaves all original records available', async () => {
 const h=harness(); await seed(h.guest);
 await assert.rejects(()=>transferGuest({guest:h.guest,target:h.a,targetUserId:A,rewriteMedia:async () => {
   assert.equal(JSON.parse((await h.guest.storage.getItem(GUEST_TRANSFER_KEY))!).targetUserId,A);
   throw new Error('MEDIA_COPY_FAILED');
 }}),/MEDIA_COPY_FAILED/);
 assert.equal((await h.a.store.getProperties()).length,0); assert.equal((await h.guest.store.getProperties()).length,1);
 await assert.rejects(()=>move(h,h.b),/BOUND_TO_OTHER_ACCOUNT/); await move(h); assert.equal((await h.a.store.getProperties()).length,1);
});
test('changed guest source during import cannot be marked complete or silently archived', async () => {
 const h=harness(); await seed(h.guest);
 await assert.rejects(()=>transferGuest({guest:h.guest,target:h.a,targetUserId:A,rewriteMedia:async snapshot => { await h.guest.storage.setItem('@viewstate_property_draft','{"propertyType":"warehouse"}'); return snapshot; }}),/SOURCE_CHANGED/);
 assert.equal(JSON.parse((await h.guest.storage.getItem(GUEST_TRANSFER_KEY))!).status,'pending');
 assert.equal(await h.guest.storage.getItem('@viewstate_property_draft'),'{"propertyType":"warehouse"}');
});

test('guest local IDs use supplied crypto bytes with UUID v4/variant bits without changing the input', () => {
 const bytes = new Uint8Array(16).fill(255); const id = guestLocalId(bytes);
 assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.ok(bytes.every(value=>value===255)); assert.throws(()=>guestLocalId(new Uint8Array(2)),/RANDOM_BYTES_REQUIRED/);
});

test('native media verification bounds memory for video-sized files and closes both handles', async () => {
 let maxRead = 0, closes = 0;
 const file = (corrupt = false) => ({ size: 3 * 1024 * 1024 + 17, open() { let offset = 0; return { readBytes(length: number) { maxRead = Math.max(maxRead, length); const data = new Uint8Array(length).fill(7); if (corrupt && offset === 65536) data[0] = 1; offset += length; return data; }, close() { closes++; } }; } });
 assert.equal(await verifyGuestMediaCopy(file(), file(), () => {}), true); assert.ok(maxRead <= 65536); assert.equal(closes, 2);
 assert.equal(await verifyGuestMediaCopy(file(), file(true), () => {}), false); assert.equal(closes, 4);
});
test('native media verification stops a revoked transfer and closes handles', async () => {
 let calls = 0, closes = 0;
 const file = {size: 200000, open() { return { readBytes: (n: number) => new Uint8Array(n), close() { closes++; } }; } };
 await assert.rejects(() => verifyGuestMediaCopy(file,file,() => { if (++calls === 3) throw new Error('ACCOUNT_SCOPE_CLOSED'); }), /ACCOUNT_SCOPE_CLOSED/); assert.equal(closes,2);
});
