import {URL} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import { matchCircleSnapshot, type CircleSnapshot } from '../../supabase/functions/circle-match-worker/engine.ts';
import {CircleMatchingSource,type SharedCircleProperty} from '../../artifacts/mobile/services/circleMatchingSource.ts';
import {BrokerInitiatedMatching} from '../../artifacts/mobile/services/brokerInitiatedMatching.ts';
import {normalizeMyPropertyCandidate} from '../../artifacts/mobile/services/myPropertiesMatchingSource.ts';
import type {Property,SeekerRequirement} from '../../lib/property-domain/src/index.ts';
const id=(n:number)=>`22222222-2222-4222-8222-${String(n).padStart(12,'0')}`;
const users=Array.from({length:9},(_,i)=>id(i+1)),circle=id(100);
const areas=['salmiya','jabriya','hawally','salwa','bayan','mishref','mangaf','mahboula'];
const rawProperty=(i:number):Property=>({
 core:{id:id(210+i),propertyType:'apartment',locationArea:{id:areas[i%8]},privateNotes:{value:'PRIVATE_OWNER_ONLY',privacy:{classification:'private_notes',disclosurePolicy:'never'}}},
 activeOffer:{id:id(300+i),propertyCoreId:id(210+i),transaction:'rent',rentalPrice:{amount:300+i*5,currencyCode:'KWD'},rentalPeriodId:'monthly'},
 typeDetails:{propertyType:'apartment',apartmentSubtype:'standard_apartment',bedroomCount:2+i%3,bathroomCount:2+i%2},marketingStatus:'active',rentalAvailability:'available',
});
const req=(b:number):SeekerRequirement=>({id:id(400+b),purpose:'rent',propertyType:'apartment',preferredAreaIds:[areas[(b+1)%8]],preferredAreaMode:'specific_areas',budget:{maximum:800,currencyCode:'KWD'},rentalPeriodId:'monthly',bedroomsMinimum:2,bathroomsMinimum:2,notes:''});

test('PostgreSQL RLS/RPC: eight identities, thirty shared properties, cross-broker engine, outsider and revocation',async()=>{
 const db=new PGlite();
 try{
  // Auth harness only. Real PostgreSQL roles/RLS; no signed JWT or Google login claim.
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);grant usage on schema auth to authenticated;
   create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;`);
  await db.exec(`create schema storage;
   create table storage.buckets(id text, name text, public boolean, file_size_limit bigint);
   create table storage.objects(bucket_id text, name text);
   create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;`);
  for (const migration of [
    '20261104070955_offline_workspace_sync.sql',
    '20261104071244_fix_sync_record_key_validation.sql',
    '20261111083559_circle_membership_inventory.sql',
    '20261111110000_circle_validation_lifecycle.sql',
    '20261111120000_circle_matching_delivery.sql',
  ]) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  for(const u of users)await db.query('insert into auth.users(id) values($1)',[u]);
  type Tx=Pick<PGlite,'query'>;
  async function asUser<T>(b:number,work:(tx:Tx)=>Promise<T>,anonymous=false):Promise<T>{
   return db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:users[b],role:'authenticated',is_anonymous:anonymous})]);await tx.exec('set local role authenticated');return work(tx);});
  }
  const publish=async(b:number,source:string,revision:number,operation:string,facts:unknown,withdraw=false)=>asUser(b,async tx=>(await tx.query<{result:{id:string;revision:number;state:string}}>('select public.vs_circle_publish($1,$2,$3,$4,$5::jsonb,$6) result',[circle,source,revision,operation,JSON.stringify(facts),withdraw])).rows[0].result);
  const catalog=(b:number,c=circle)=>asUser(b,async tx=>(await tx.query<SharedCircleProperty>('select * from public.vs_circle_catalog($1)',[c])).rows);
  await asUser(0,tx=>tx.query('select public.vs_circle_create($1,$2)',[circle,'دائرة اختبار فقط']));
  await assert.rejects(catalog(8),/CIRCLE_MEMBERSHIP_REQUIRED/);
  await assert.rejects(asUser(8,tx=>tx.query('select public.vs_circle_accept($1)',[circle])),/CIRCLE_INVITATION_REQUIRED/);
  await assert.rejects(asUser(8,tx=>tx.query('select public.vs_circle_member($1,$2,$3)',[circle,users[8],'invite'])),/CIRCLE_OWNER_REQUIRED/);
  await assert.rejects(asUser(0,tx=>tx.query('select public.vs_circle_create($1,$2)',[id(999),'anon']),true),/CIRCLE_AUTH_REQUIRED/);
  // Start with a three-identity acceptance journey, then extend the catalog.
  const invite = (b: number) => asUser(0, tx => tx.query(
    'select public.vs_circle_member($1,$2,$3)', [circle, users[b], 'invite'],
  ));
  await invite(1);
  await assert.rejects(catalog(1), /CIRCLE_MEMBERSHIP_REQUIRED/);
  await asUser(1, tx => tx.query('select public.vs_circle_accept($1)', [circle]));
  await invite(8);
  await asUser(8, tx => tx.query('select public.vs_circle_decline($1)', [circle]));
  await assert.rejects(asUser(8, tx => tx.query('select public.vs_circle_accept($1)', [circle])), /CIRCLE_INVITATION_REQUIRED/);
  await assert.rejects(catalog(8), /CIRCLE_MEMBERSHIP_REQUIRED/);
  await assert.rejects(asUser(1, tx => tx.query('select public.vs_circle_decline($1)', [circle])), /CIRCLE_INVITATION_REQUIRED/);

  const firstFixture = rawProperty(0);
  const sample: Property = {
    ...firstFixture,
    core: { ...firstFixture.core, id: id(200) },
    activeOffer: { ...firstFixture.activeOffer, propertyCoreId: id(200) },
  };
  const sampleFacts = normalizeMyPropertyCandidate(sample)!.property;
  const sync = (revision: number, value: unknown) => asUser(0, async tx => (
    await tx.query<{ result: { accepted: boolean; revision: number } }>(
      'select public.commit_account_workspace($1,$2::jsonb) result',
      [revision, JSON.stringify({ version: 1, records: { [`property/${sample.core.id}`]: value } })],
    )
  ).rows[0].result);
  const matchSample = async () => {
    const requirement = req(7);
    return new BrokerInitiatedMatching(
      { getRequirement: async () => requirement }, new CircleMatchingSource(() => catalog(1)),
    ).runForRequirement(requirement.id, { strictFields: ['location'] });
  };
  await assert.rejects(publish(0, sample.core.id, 0, id(480), {
    ...sampleFacts, typeDetails: { ...sampleFacts.typeDetails, studioRoomCount: 2 },
  }), /CIRCLE_FACTS_INVALID/);
  await assert.rejects(publish(0, sample.core.id, 0, id(481), {
    ...sampleFacts, typeDetails: { ...sampleFacts.typeDetails, masterBedroomCount: 9 },
  }), /CIRCLE_FACTS_INVALID/);

  assert.equal((await sync(0, sample)).accepted, true);
  const publishStarted = performance.now();
  const shared = await publish(0, sample.core.id, 0, id(482), sampleFacts);
  const publishMs = performance.now() - publishStarted;
  const matchStarted = performance.now();
  assert.deepEqual((await matchSample()).matches.map(match => match.propertyId), [shared.id]);
  const matchMs = performance.now() - matchStarted;

  const asWorker = <T,>(work: (tx: Tx) => Promise<T>) => db.transaction(async tx => {
    await tx.exec('set local role service_role');
    return work(tx);
  });
  const inbox = (broker: number) => asUser(broker, async tx =>
    (await tx.query('select * from public.vs_circle_matches($1)', [circle])).rows,
  );
  const snapshot = async () => asWorker(async tx =>
    (await tx.query<{ data: CircleSnapshot }>(
      'select public.vs_circle_worker_snapshot($1) data', [circle],
    )).rows[0].data,
  );
  const commitMatches = (data: CircleSnapshot) => asWorker(async tx =>
    (await tx.query<{ accepted: boolean }>(
      'select public.vs_circle_worker_commit($1,$2,$3::jsonb) accepted',
      [circle, data.revision, JSON.stringify(matchCircleSnapshot(data))],
    )).rows[0].accepted,
  );

  await assert.rejects(inbox(8), /CIRCLE_MEMBERSHIP_REQUIRED/);
  await assert.rejects(asUser(1, tx => tx.query('select public.vs_circle_worker_snapshot($1)', [circle])), /permission denied/);
  await assert.rejects(asUser(1, tx => tx.query('select * from public.vs_circle_push_claim()')), /permission denied/);
  const beforeRequest = await snapshot();
  const sharedRequest = id(490);
  await asUser(1, tx => tx.query('select public.vs_circle_request($1,$2,$3,$4,$5,$6,$7)',
    [circle, sharedRequest, [sample.core.locationArea.id], 800, 'monthly', 2, 2]));
  // The publisher may also publish their own request, but never matches their own listing.
  await asUser(0, tx => tx.query('select public.vs_circle_request($1,$2,$3,$4,$5,$6,$7)',
    [circle, id(491), [sample.core.locationArea.id], 800, 'monthly', 2, 2]));
  assert.equal(await commitMatches(beforeRequest), false, 'stale calculation cannot commit');
  const ready = await snapshot();
  assert.equal(matchCircleSnapshot(ready).length, 1);
  assert.equal(await commitMatches(ready), true);
  assert.equal(await commitMatches(ready), false, 'processed revisions are not replayed');
  assert.equal((await inbox(0)).length, 1);
  assert.equal((await inbox(1)).length, 1);

  for (let b=0; b<2; b++) {
    await asUser(b, tx => tx.query('select public.vs_circle_register_push($1,$2)',
      [`ExpoPushToken[fixture_token_${b}]`, true]));
  }
  const deliveries = await asWorker(async tx =>
    (await tx.query<{ id: string; token: string; attempt: number }>('select * from public.vs_circle_push_claim()')).rows,
  );
  assert.equal(deliveries.length, 2);
  assert.equal((await asWorker(tx => tx.query('select * from public.vs_circle_push_claim()'))).rows.length, 0);
  await asWorker(tx => tx.query('select public.vs_circle_push_result($1,$2,$3,$4)',
    [deliveries[0].id, deliveries[0].attempt, 'accepted', deliveries[0].token]));
  await asWorker(tx => tx.query('select public.vs_circle_push_result($1,$2,$3,$4)',
    [deliveries[1].id, deliveries[1].attempt, 'retry', deliveries[1].token]));
  assert.equal((await asWorker(tx => tx.query('select * from public.vs_circle_push_claim()'))).rows.length, 0,
    'retry is deferred');

  const dirtyRows = await catalog(1);
  const invalidOldRow = {
    ...dirtyRows[0], id: id(483),
    facts: { ...sampleFacts, typeDetails: { ...sampleFacts.typeDetails, studioRoomCount: 2 } },
  };
  assert.equal((await new CircleMatchingSource(async () => [invalidOldRow, ...dirtyRows]).getCandidates()).length, 1);
  await db.query('update viewstate_circle.properties set facts=$1::jsonb where id=$2',
    [JSON.stringify(invalidOldRow.facts), shared.id]);
  assert.equal((await catalog(1)).length, 0, 'an invalid legacy row is excluded by the server');
  await db.query('update viewstate_circle.properties set facts=$1::jsonb where id=$2',
    [JSON.stringify(sampleFacts), shared.id]);

  // While the device is offline, other members see the last synchronized state.
  const offlineRented = { ...sample, rentalAvailability: 'rented' };
  assert.equal((await matchSample()).matches.length, 1);
  assert.equal((await sync(1, offlineRented)).accepted, true);
  assert.equal((await matchSample()).matches.length, 0);
  assert.equal((await inbox(1)).length, 0, 'stale notification hidden immediately on rental');
  assert.equal(await commitMatches(await snapshot()), true);
  assert.equal((await db.query('select * from viewstate_circle.push_outbox')).rows.length, 0);
  assert.equal((await catalog(1))[0].revision, 2);
  await assert.rejects(publish(0, sample.core.id, 1, id(484), sampleFacts), /CIRCLE_SOURCE_STATUS_CONFLICT/);

  assert.equal((await sync(2, sample)).accepted, true);
  assert.equal((await matchSample()).matches.length, 1);
  assert.equal((await sync(3, { version: 1, deleted: true })).accepted, true);
  assert.equal((await catalog(1)).length, 0);
  assert.equal((await sync(3, sample)).accepted, false, 'offline workspace replay loses the revision check');
  await assert.rejects(publish(0, sample.core.id, 3, id(485), sampleFacts), /CIRCLE_SOURCE_DELETED/);
  await assert.rejects(publish(0, sample.core.id, 4, id(486), sampleFacts), /CIRCLE_SOURCE_DELETED/);
  assert.equal((await sync(4, sample)).accepted, true, 'simulate an older client replacing the workspace tombstone');
  await assert.rejects(publish(0, sample.core.id, 4, id(487), sampleFacts), /CIRCLE_SOURCE_DELETED/);
  console.log(JSON.stringify({ evidence: 'LOCAL_THREE_IDENTITIES', publishMs, matchMs }));

  for(let b=2;b<8;b++){
   await asUser(0,tx=>tx.query('select public.vs_circle_member($1,$2,$3)',[circle,users[b],'invite']));
   await assert.rejects(catalog(b),/CIRCLE_MEMBERSHIP_REQUIRED/);
   await asUser(b,tx=>tx.query('select public.vs_circle_accept($1)',[circle]));
  }
  await assert.rejects(asUser(1,tx=>tx.query("insert into viewstate_circle.members(circle_id,user_id,state) values($1,$2,'active')",[circle,users[8]])),/permission denied/);
  await assert.rejects(asUser(1,tx=>tx.query('select * from viewstate_circle.change_queue')),/permission denied/);
  const published=[];
  const publishBatchStarted = performance.now();
  for(let i=0;i<30;i++){
   const raw=rawProperty(i),facts=normalizeMyPropertyCandidate(raw)!.property;
   assert.equal(JSON.stringify(facts).includes('PRIVATE_OWNER_ONLY'),false);
   const result=await publish(i%8,raw.core.id,0,id(500+i),facts);
   published.push({...result,index:i,publisher:users[i%8],source:raw.core.id,facts});
  }
  const publishBatchMs = performance.now() - publishBatchStarted;
  for(let b=0;b<8;b++)assert.equal((await catalog(b)).length,30);
  await assert.rejects(catalog(8),/CIRCLE_MEMBERSHIP_REQUIRED/);
  assert.equal(await asUser(8,async tx=>(await tx.query('select * from viewstate_circle.properties')).rows.length),0);
  await assert.rejects(publish(8,id(900),0,id(901),published[0].facts),/CIRCLE_MEMBERSHIP_REQUIRED/);
  await assert.rejects(publish(0,published[0].source,1,id(800),{...published[0].facts,notes:'PRIVATE'}),/CIRCLE_FACTS_INVALID/);
  await assert.rejects(publish(0,published[0].source,1,id(800),{...published[0].facts,core:{...published[0].facts.core,privateNotes:'PRIVATE'}}),/CIRCLE_FACTS_INVALID/);
  await assert.rejects(publish(0,published[0].source,1,id(802),{...published[0].facts,typeDetails:{...published[0].facts.typeDetails,notes:'PRIVATE'}}),/CIRCLE_FACTS_INVALID/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select public.vs_circle_list()');}),/permission denied/);
  let total=0;
  const matchBatchStarted = performance.now();
  for(let b=0;b<8;b++){
   const requirement=req(b),source=new CircleMatchingSource(()=>catalog(b));
   const run=await new BrokerInitiatedMatching({getRequirement:async()=>requirement},source).runForRequirement(requirement.id,{strictFields:['location']});
   const expected=published.filter(p=>p.index%8===(b+1)%8).map(p=>p.id).sort();
   assert.deepEqual(run.matches.map(m=>m.propertyId).sort(),expected);assert.equal(run.evaluatedCandidateCount,30);total+=run.matches.length;
  }
  assert.equal(total,30);
  const matchBatchMs = performance.now() - matchBatchStarted;
  const duplicate=await publish(1,published[0].source,0,id(850),published[0].facts);
  assert.notEqual(duplicate.id,published[0].id,'same local ID from different accounts stays distinct');
  const first=published[0];
  const altered={...first.facts,activeOffer:{...first.facts.activeOffer,rentalPrice:{amount:777,currencyCode:'KWD'}}};
  await assert.rejects(publish(0,first.source,0,id(500),altered),/CIRCLE_OPERATION_REUSED/);
  assert.deepEqual(await publish(0,first.source,0,id(500),first.facts),{id:first.id,revision:1,state:'published'});
  await assert.rejects(publish(0,first.source,0,id(900),first.facts),/CIRCLE_REVISION_CONFLICT/);
  const rentedFacts={...first.facts,rentalAvailability:'rented'};
  assert.equal((await publish(0,first.source,1,id(900),rentedFacts)).revision,2);
  const r=req(7),run=await new BrokerInitiatedMatching({getRequirement:async()=>r},new CircleMatchingSource(()=>catalog(7))).runForRequirement(r.id,{strictFields:['location']});
  assert.equal(run.matches.some(m=>m.propertyId===first.id),false);
  assert.equal((await publish(0,first.source,2,id(901),null,true)).revision,3);
  await assert.rejects(publish(0,first.source,1,id(900),rentedFacts),/CIRCLE_REVISION_CONFLICT/);
  assert.equal((await catalog(0)).some(p=>p.id===first.id),false);
  await asUser(0,tx=>tx.query('select public.vs_circle_create($1,$2)',[id(110),'second circle']));
  await assert.rejects(catalog(1,id(110)),/CIRCLE_MEMBERSHIP_REQUIRED/);
  await asUser(0,tx=>tx.query('select public.vs_circle_member($1,$2,$3)',[circle,users[1],'revoke']));
  await assert.rejects(catalog(1),/CIRCLE_MEMBERSHIP_REQUIRED/);
  await assert.rejects(publish(1,published[1].source,1,id(910),published[1].facts),/CIRCLE_MEMBERSHIP_REQUIRED/);
  assert.equal((await catalog(0)).some(p=>p.publisher_id===users[1]),false);
  await asUser(0,tx=>tx.query('select public.vs_circle_member($1,$2,$3)',[circle,users[1],'invite']));
  await asUser(1,tx=>tx.query('select public.vs_circle_accept($1)',[circle]));
  assert.equal((await catalog(1)).some(p=>p.publisher_id===users[1]),false,'reaccepting cannot resurrect old shares');
  const queue=await db.query<{count:string}>('select count(*) count from viewstate_circle.change_queue');
  assert.ok(Number(queue.rows[0].count)>30);
  console.log(JSON.stringify({evidence:'LOCAL_POSTGRES_RLS_RPC_AND_MATCHER_NOT_HOSTED_E2E',brokerIdentities:8,outsiderIdentities:1,initialPublishedProperties:30,initialCrossBrokerPairs:total,sharedReadChecks:8,queueIntents:Number(queue.rows[0].count),publishBatchMs,matchBatchMs}));
 }finally{await db.close();}
});
