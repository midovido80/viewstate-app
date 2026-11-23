/** LOCAL INTEGRATION ONLY. The test-only aggregate is not a circle service or RLS. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './platformModuleStubs.ts';
import { type Property, type SeekerRequirement, MATCH_ENGINE_VERSION } from '@workspace/property-domain';
import { WebStore } from '../services/persistence.ts';
import { createPerson } from '../services/people.ts';
import { KUWAIT_AREAS } from '../constants/kuwait-areas.ts';
import { MyPropertiesMatchingSource } from '../services/myPropertiesMatchingSource.ts';
import { BrokerInitiatedMatching } from '../services/brokerInitiatedMatching.ts';
import { selectHomeMatches, type HomeMatch } from '../services/assistantHome.ts';
import { createMatchNoticeRepository, reconcileMatchNotices, currentNoticeMatch } from '../services/matchNotifications.ts';
const ids = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const areas = KUWAIT_AREAS.slice(0, 8).map(a => a.id);
const brokerFor = (index: number) => index % 8;
const properties: Property[] = Array.from({ length: 30 }, (_, i) => ({
  core: { id: ids(100+i), propertyType: 'apartment', locationArea: { id: areas[brokerFor(i)] }, privateNotes: { value: `PRIVATE_OWNER_SENTINEL_${i}`, privacy: { classification: 'private_notes', disclosurePolicy: 'never' } } },
  activeOffer: { id: ids(200+i), propertyCoreId: ids(100+i), transaction: 'rent', rentalPrice: { amount: 300+i*5, currencyCode: 'KWD' }, rentalPeriodId: 'monthly' },
  marketingStatus: 'active', rentalAvailability: 'available',
  typeDetails: { propertyType: 'apartment', apartmentSubtype: 'standard_apartment', bedroomCount: 2+i%3, bathroomCount: 2+i%2 },
}));
const requests: SeekerRequirement[] = Array.from({ length: 8 }, (_, i) => ({
  id: ids(300+i), seekerId: ids(400+i), purpose: 'rent', propertyType: 'apartment', preferredAreaIds: [areas[(i+1)%8]], preferredAreaMode: 'specific_areas',
  budget: { minimum: 250, maximum: 800, currencyCode: 'KWD' }, rentalPeriodId: 'monthly', bedroomsMinimum: 2, bathroomsMinimum: 2, notes: `PRIVATE_CLIENT_SENTINEL_${i}`,
}));
// Serial fixture operations only: this is not a browser-lock/concurrency test.
const locks = { request: async <T>(_n: string, _o: unknown, work: () => Promise<T>) => work() };
async function diskStorage(directory: string) {
  await mkdir(directory, { recursive: true });
  const file = (key: string) => join(directory, Buffer.from(key).toString('hex')+'.json');
  return {
    async getItem(key: string) { try { return await readFile(file(key), 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code==='ENOENT') return null; throw e; } },
    async setItem(key: string, value: string) { await writeFile(file(key), value, 'utf8'); },
  };
}
test('eight persisted private catalogs isolate thirty properties; explicit test-only aggregation evaluates cross-broker pairs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'viewstate-circle-readiness-'));
  try {
    const storage = await Promise.all(Array.from({length:8}, (_,b)=>diskStorage(join(root, `broker-${b+1}`))));
    let stores = storage.map(s=>new WebStore(s,locks));
    for(let b=0;b<8;b++) {
      await stores[b].init();
      await stores[b].savePerson(createPerson({id: requests[b].seekerId!, name:`اختبار فقط ${b+1}`, displayPhone:`+1202555010${b}`, classifications:['seeker']}));
      await stores[b].saveRequirement(requests[b]);
      for(let i=0;i<30;i++) if(brokerFor(i)===b) await stores[b].saveProperty(properties[i]);
    }
    stores=storage.map(s=>new WebStore(s,locks));
    await Promise.all(stores.map(s=>s.init()));
    const counts=await Promise.all(stores.map(async s=>(await s.getProperties()).length));
    assert.deepEqual(counts,[4,4,4,4,4,4,3,3]);
    for(let b=0;b<8;b++) {
      const run=await new BrokerInitiatedMatching(stores[b],new MyPropertiesMatchingSource(stores[b])).runForRequirement(requests[b].id,{strictFields:['location']});
      assert.equal(run.evaluatedCandidateCount,counts[b]);
      assert.deepEqual(run.matches,[], 'Current source cannot read another broker catalog');
    }
    // TEST-ONLY input. No permission check, cloud transport or circle publication exists here.
    const aggregateSource=()=>new MyPropertiesMatchingSource({getProperties:async()=>(await Promise.all(stores.map(s=>s.getProperties()))).flat()});
    const candidates=await aggregateSource().getCandidates();
    assert.equal(candidates.length,30);
    assert.equal(JSON.stringify(candidates).includes('PRIVATE_OWNER_SENTINEL'),false);
    const allMatches:HomeMatch[]=[];
    const rows=[];
    for(let b=0;b<8;b++) {
      const run=await new BrokerInitiatedMatching(stores[b],aggregateSource()).runForRequirement(requests[b].id,{strictFields:['location']});
      // Independent fixture oracle: target owner/area, not a second call to the matcher.
      const expected=properties.filter((_p,i)=>brokerFor(i)===(b+1)%8).map(p=>p.core.id).sort();
      assert.equal(run.engineVersion,MATCH_ENGINE_VERSION);
      assert.equal(run.evaluatedCandidateCount,30);
      assert.deepEqual(run.matches.map(m=>m.propertyId).sort(),expected);
      assert.ok(run.matches.every(m=>m.category==='direct'));
      assert.deepEqual(run.needsConfirmation,[]);
      const home=selectHomeMatches(await stores[b].getRequirements(),await stores[b].getPeople(),[run],30);
      assert.equal(home.length,expected.length);allMatches.push(...home);
      rows.push({requestBroker:b+1,propertyBroker:(b+1)%8+1,localCandidates:counts[b],localMatches:0,aggregateCandidates:30,aggregateMatches:expected.length,propertyIds:expected});
      const notices=createMatchNoticeRepository(storage[b]);
      await notices.update(s=>reconcileMatchNotices(s,[],'2026-11-11T09:00:00Z',true));
      const first=await notices.update(s=>reconcileMatchNotices(s,home,'2026-11-11T09:01:00Z',true));
      assert.equal(first.entries.length,expected.length);
      const repeat=await notices.update(s=>reconcileMatchNotices(s,home,'2026-11-11T09:02:00Z',true));
      assert.equal(repeat.entries.length,first.entries.length);
      assert.equal((await createMatchNoticeRepository(storage[b]).load()).entries.length,first.entries.length);
      assert.equal(JSON.stringify(repeat).includes('PRIVATE_CLIENT_SENTINEL'),false);
    }
    assert.equal(allMatches.length,30);
    const target=(await stores[1].getProperties())[0];
    assert.ok(await stores[1].compareAndUpdate(target,{...target,rentalAvailability:'rented'}));
    const after=await new BrokerInitiatedMatching(stores[0],aggregateSource()).runForRequirement(requests[0].id,{strictFields:['location']});
    assert.equal(after.matches.some(m=>m.propertyId===target.core.id),false);
    const home=selectHomeMatches(await stores[0].getRequirements(),await stores[0].getPeople(),[after],30);
    const historical=(await createMatchNoticeRepository(storage[0]).load()).entries.find(n=>n.propertyId===target.core.id)!;
    assert.ok(historical);assert.equal(currentNoticeMatch(historical,home),undefined);
    console.log(JSON.stringify({evidence:'LOCAL_REPOSITORY_INTEGRATION_NOT_APP_E2E',brokers:8,properties:30,localCrossBrokerMatches:0,testOnlyAggregatePairs:30,localNoticeEntries:30,rows}));
  } finally {await rm(root,{recursive:true,force:true});}
});
