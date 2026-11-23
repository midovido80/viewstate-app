import { setCircleRequirementMatching } from '../../artifacts/mobile/services/circleMatchingApi.ts';
import {URL} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
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
  await db.exec('create table public.user_profiles(user_id uuid primary key,display_name text,company text,phone text);');
  await db.exec('alter table auth.users add column phone text, add column phone_confirmed_at timestamptz, add column is_anonymous boolean default false;');
  for (const migration of (await readdir(new URL('../../supabase/migrations/',import.meta.url)))
    .filter(file=>file.endsWith('.sql') && file>'20261104000000').sort()) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  await db.exec(await readFile(new URL('../../supabase/tests/circles/request_catalog_parity.sql', import.meta.url), 'utf8'));
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
  const memberSummaries = (b: number) => asUser(b, async tx => (await tx.query<{user_id: string; state: string; display_name: string; company: string}>('select * from public.vs_circle_members($1)', [circle])).rows);
  await db.query('insert into public.user_profiles(user_id,display_name,company,phone) values($1,$2,$3,$4)', [users[1], 'Broker fixture', 'Office fixture', 'PRIVATE_PHONE_SENTINEL']);
  assert.equal((await memberSummaries(0)).length, 3, 'owner sees active and invited members');
  assert.equal((await memberSummaries(1)).length, 2, 'ordinary members see active colleagues only');
  assert.equal((await memberSummaries(1)).find(item => item.user_id === users[1])?.display_name, 'Broker fixture');
  assert.doesNotMatch(JSON.stringify(await memberSummaries(0)), /PRIVATE_PHONE_SENTINEL|phone/);
  await assert.rejects(memberSummaries(8), /CIRCLE_MEMBERSHIP_REQUIRED/);
  const withoutPermission = await asUser(8, tx => tx.query<{ data: { unread: number } }>(
    'select public.vs_circle_notification_inbox() data',
  ));
  assert.equal(withoutPermission.rows[0].data.unread, 1, 'the bell counts a new invite without a registered device');

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
      [revision, JSON.stringify({ version: 1, records: { [`property/${sample.core.id}`]: value }, circlePropertyFacts: { [sample.core.id]: normalizeMyPropertyCandidate(value)?.property ?? null } })],
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

  const matchingWorkspace = (broker: number, circleId = circle) => asUser(broker, async tx =>
    (await tx.query<{ workspace: { processing: boolean; requests: Record<string, unknown>[]; matches: { request_id: string }[] } }>(
      'select public.vs_circle_matching_workspace($1) workspace', [circleId],
    )).rows[0].workspace);
  const publisherWorkspace = await matchingWorkspace(0);
  const requesterWorkspace = await matchingWorkspace(1);
  assert.equal(requesterWorkspace.processing, false);
  const matchedRequestId = publisherWorkspace.matches[0].request_id;
  assert.deepEqual(publisherWorkspace.requests.find(item => item.id === matchedRequestId),
    { id: matchedRequestId, local_id: null, type: 'apartment', purpose: 'rent' });
  assert.equal(requesterWorkspace.requests.find(item => item.id === matchedRequestId)?.local_id, sharedRequest);
  await assert.rejects(matchingWorkspace(8), /CIRCLE_MEMBERSHIP_REQUIRED/);
  const runCircle = (broker: number) => asUser(broker, tx =>
    tx.query('select public.vs_circle_run_matching($1)', [circle]));
  await assert.rejects(runCircle(8), /CIRCLE_MEMBERSHIP_REQUIRED/);
  await runCircle(0);
  assert.equal((await matchingWorkspace(1)).processing, true);
  const manualRun = await snapshot();
  assert.equal(await commitMatches(manualRun), true);
  await runCircle(1);
  assert.equal((await snapshot()).revision, manualRun.revision, 'repeated runs are throttled');
  assert.deepEqual((await matchingWorkspace(0)).matches, publisherWorkspace.matches);
  assert.equal((await matchingWorkspace(0)).processing, false);

  for (let b=0; b<2; b++) {
    await asUser(b, tx => tx.query('select public.vs_circle_register_push($1,$2)',
      [`ExpoPushToken[fixture_token_${b}]`, true]));
  }
  const noticeInbox = (broker: number) => asUser(broker, async tx =>
    (await tx.query<{ data: { unread: number; entries: { id: string; kind: string }[] } }>(
      'select public.vs_circle_notification_inbox() data',
    )).rows[0].data);
  const claimNotices = () => asWorker(async tx => (await tx.query<{ id: string; token: string; kind: string; attempt: number; ticket: string | null }>(
    'select * from public.vs_circle_notification_claim()',
  )).rows);
  const secondDevice = 'ExpoPushToken[fixture_second_8]';
  const firstDevice = 'ExpoPushToken[fixture_first_8]';
  await asUser(8, async tx => {
    await tx.query('select public.vs_circle_register_push($1,true)', [firstDevice]);
    await tx.query('select public.vs_circle_register_push($1,true)', [secondDevice]);
  });
  const beforeInvite = await noticeInbox(8);
  await invite(8);
  const afterInvite = await noticeInbox(8);
  assert.equal(afterInvite.unread, beforeInvite.unread + 1);
  const inviteNotice = afterInvite.entries.find(item => item.kind === 'invite' && !beforeInvite.entries.some(prior => prior.id === item.id));
  assert.ok(inviteNotice);
  assert.ok(!(await noticeInbox(1)).entries.some(item => item.id === inviteNotice.id));
  const forInvite = (await claimNotices()).filter(item => item.kind === 'invite');
  assert.deepEqual(forInvite.map(item => item.token).sort(), [firstDevice, secondDevice].sort());
  assert.equal((await claimNotices()).length, 0, 'concurrent wake-ups cannot re-claim in-flight pushes');
  await asUser(1, tx => tx.query('select public.vs_circle_notification_read($1)', [inviteNotice.id]));
  assert.equal((await noticeInbox(8)).unread, afterInvite.unread, 'another account cannot mark the invitation read');
  const openNotice = (broker: number, notice: string) => asUser(broker, async tx =>
    (await tx.query<{ target: unknown }>(
      'select public.vs_circle_notification_open($1) target', [notice],
    )).rows[0].target);
  assert.equal(await openNotice(1, inviteNotice.id), null);
  assert.deepEqual(await openNotice(8, inviteNotice.id), { kind: 'invite', circleId: circle });
  const matchNotice = (await noticeInbox(0)).entries.find(item => item.kind === 'match');
  assert.ok(matchNotice);
  assert.equal(await openNotice(8, matchNotice.id), null);
  assert.deepEqual(await openNotice(0, matchNotice.id), {
    kind: 'requirement', circleId: circle, targetId: publisherWorkspace.matches[0].id,
    matchId: publisherWorkspace.matches[0].id,
  });
  const requesterNotice = (await noticeInbox(1)).entries.find(item => item.kind === 'match');
  assert.ok(requesterNotice);
  assert.deepEqual(await openNotice(1, requesterNotice.id), {
    kind: 'listing', circleId: circle, targetId: (await catalog(1))[0].id,
    matchId: publisherWorkspace.matches[0].id,
  });
  assert.equal((await noticeInbox(8)).unread, beforeInvite.unread);
  await asUser(8, tx => tx.query('select public.vs_circle_test_notification($1)', [firstDevice]));
  await assert.rejects(asUser(1, tx => tx.query('select public.vs_circle_test_notification($1)', [firstDevice])), /CIRCLE_PUSH_NOT_REGISTERED/);
  const testDelivery = (await claimNotices()).filter(item => item.kind === 'test');
  assert.deepEqual(testDelivery.map(item => item.token), [firstDevice]);
  await asWorker(tx => tx.query('select public.vs_circle_notification_result($1,$2,$3,$4)',
    [testDelivery[0].id, testDelivery[0].attempt, 'ticket', 'expo-ticket']));
  await db.query("update viewstate_circle.notification_delivery set due_at=now() where id=$1", [testDelivery[0].id]);
  const receipt = (await claimNotices()).find(item => item.id === testDelivery[0].id);
  assert.equal(receipt?.ticket, 'expo-ticket');
  await asWorker(tx => tx.query('select public.vs_circle_notification_result($1,$2,$3,$4)',
    [receipt!.id, receipt!.attempt, 'delivered_to_provider', null]));
  const runtime = 'viewstate-next-android-1';
  const updateChannel = 'viewstate-next-pilot';
  const updateGroup = id(990);
  await asUser(8, async tx => {
    await tx.query('select public.vs_circle_update_device($1,$2,$3)', [firstDevice, updateChannel, runtime]);
    await tx.query('select public.vs_circle_update_device($1,$2,$3)', [secondDevice, updateChannel, 'viewstate-next-android-2']);
  });
  await asUser(1, tx => tx.query('select public.vs_circle_update_device($1,$2,$3)',
    [secondDevice, updateChannel, runtime]));
  await assert.rejects(asUser(8, tx => tx.query('select public.vs_circle_announce_update($1,$2,$3)',
    [updateGroup, updateChannel, runtime])), /permission denied/);
  const announce = () => asWorker(async tx => (await tx.query<{ queued: number }>(
    'select public.vs_circle_announce_update($1,$2,$3) queued',
    [updateGroup, updateChannel, runtime],
  )).rows[0].queued);
  const beforeUpdate = await noticeInbox(8);
  assert.equal(await announce(), 1, 'only the device with the matching runtime receives a push');
  assert.equal(await announce(), 0, 'retrying an announcement does not duplicate it');
  assert.deepEqual(await noticeInbox(8), beforeUpdate, 'OTA availability badge is device-specific');
  assert.deepEqual((await claimNotices()).filter(item => item.kind === 'app_update').map(item => item.token), [firstDevice]);

  // Keep the existing delivery checks on their original membership generation.
  await asUser(8, tx => tx.query('select public.vs_circle_decline($1)', [circle]));
  await asUser(8, async tx => {
    await tx.query('select public.vs_circle_register_push($1,false)', [firstDevice]);
    await tx.query('select public.vs_circle_register_push($1,false)', [secondDevice]);
  });

  const claimActivity = () => asWorker(async tx =>
    (await tx.query<{ id: string; token: string; attempt: number; kind: string }>(
      'select * from public.vs_circle_activity_push_claim()',
    )).rows);
  await assert.rejects(asUser(1, tx => tx.query('select public.vs_circle_activity_push_claim()')), /permission denied/);
  const listingAlerts = await claimActivity();
  assert.deepEqual(listingAlerts.map(alert => [alert.kind, alert.token]), [['listing', 'ExpoPushToken[fixture_token_1]']]);
  await asWorker(tx => tx.query('select public.vs_circle_activity_push_result($1,$2,$3,$4)',
    [listingAlerts[0].id, listingAlerts[0].attempt, 'accepted', listingAlerts[0].token]));
  await asUser(8, tx => tx.query('select public.vs_circle_register_push($1,true)', ['ExpoPushToken[fixture_token_8]']));
  await invite(8);
  await invite(8);
  const invitationAlerts = await claimActivity();
  assert.deepEqual(invitationAlerts.map(alert => [alert.kind, alert.token]), [['invite', 'ExpoPushToken[fixture_token_8]']]);
  assert.equal((await claimActivity()).length, 0);
  await asUser(8, tx => tx.query('select public.vs_circle_decline($1)', [circle]));
  const participantMatch = (await inbox(0))[0] as { id: string };
  const sharedDetails = await asUser(0, async tx => (await tx.query<{ facts: Record<string, unknown> }>(
    'select public.vs_circle_match_requirement($1,$2) facts', [circle, participantMatch.id])).rows[0].facts);
  assert.equal(sharedDetails.bedroomsMinimum, 2);
  assert.ok(!('notes' in sharedDetails) && !('seekerId' in sharedDetails));
  await assert.rejects(asUser(8, tx => tx.query('select public.vs_circle_match_requirement($1,$2)', [circle, participantMatch.id])), /CIRCLE_MEMBERSHIP_REQUIRED/);
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

  const opportunity = (await inbox(1))[0] as { id: string };
  const cooperate = (broker: number, purpose = 'viewing') => asUser(broker, async tx =>
    (await tx.query<{ id: string }>('select public.vs_circle_cooperation_request($1,$2,$3,$4) id',
      [circle, opportunity.id, purpose, 'split_evenly'])).rows[0].id,
  );
  const act = (broker: number, cooperationId: string, action: string) => asUser(broker, async tx =>
    (await tx.query<{ state: string }>('select public.vs_circle_cooperation_action($1,$2,$3) state',
      [circle, cooperationId, action])).rows[0].state,
  );
  const history = (broker: number) => asUser(broker, async tx =>
    (await tx.query<{ id: string; status: string; source_key: string | null }>(
      'select * from public.vs_circle_cooperation_list($1)', [circle],
    )).rows,
  );
  await assert.rejects(cooperate(8), /CIRCLE_MEMBERSHIP_REQUIRED/);
  await assert.rejects(cooperate(1, '55512345'), /CIRCLE_COOPERATION_INVALID/);
  await assert.rejects(asUser(1, tx => tx.query('select * from viewstate_circle.cooperations')), /permission denied/);
  await assert.rejects(asUser(1, tx => tx.query('select * from public.vs_circle_cooperation_push_claim()')), /permission denied/);

  const firstCooperation = await cooperate(1);
  assert.equal(await cooperate(0), firstCooperation, 'reverse request returns the existing cooperation');
  assert.equal((await history(1))[0].source_key, null, 'private source key is not returned to requester');
  assert.equal((await history(0))[0].source_key, sample.core.id);
  await assert.rejects(act(1, firstCooperation, 'accept'), /CIRCLE_COOPERATION_RECIPIENT_REQUIRED/);
  assert.equal(await act(0, firstCooperation, 'decline'), 'declined');
  await assert.rejects(cooperate(1), /CIRCLE_COOPERATION_COOLDOWN/);
  await db.query("update viewstate_circle.cooperations set updated_at=now()-interval '25 hours' where id=$1", [firstCooperation]);

  const closedCooperation = await cooperate(1);
  assert.equal(await act(1, closedCooperation, 'close'), 'closed');
  await assert.rejects(act(0, closedCooperation, 'confirm'), /CIRCLE_COOPERATION_UNAVAILABLE/);

  const secondCooperation = await cooperate(1);
  assert.notEqual(firstCooperation, secondCooperation);
  assert.equal(await act(0, secondCooperation, 'accept'), 'accepted');
  assert.equal(await act(0, secondCooperation, 'confirm'), 'accepted');
  assert.equal(await act(0, secondCooperation, 'confirm'), 'accepted', 'retry does not count twice');
  assert.equal(await act(1, secondCooperation, 'confirm'), 'completed');
  assert.equal(await act(1, secondCooperation, 'confirm'), 'completed', 'completion retry is idempotent');
  assert.equal(await cooperate(0), secondCooperation);
  const cooperationDeliveries = await asWorker(async tx =>
    (await tx.query<{ token: string; cooperation_id: string }>(
      'select * from public.vs_circle_cooperation_push_claim()',
    )).rows,
  );
  assert.equal(cooperationDeliveries.length, 4, 'stale pending and first-confirmation pushes are suppressed');
  assert.deepEqual(new Set(cooperationDeliveries.map(row => row.token)),
    new Set(['ExpoPushToken[fixture_token_0]', 'ExpoPushToken[fixture_token_1]']));

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
  assert.equal((await history(1)).find(row => row.id === secondCooperation)?.status, 'completed');
  assert.equal(await commitMatches(await snapshot()), true);
  assert.equal((await db.query('select * from viewstate_circle.push_outbox')).rows.length, 0);
  assert.equal((await catalog(1)).length, 0, 'an unavailable listing is hidden from other brokers');
  assert.equal((await catalog(0))[0].revision, 2, 'publisher can still manage the inactive publication');
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
  assert.deepEqual(await history(2), [], 'membership alone does not grant cooperation history');
  await assert.rejects(act(2, secondCooperation, 'close'), /CIRCLE_COOPERATION_UNAVAILABLE/);
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
  const privateRequest = { ...req(1), id: id(995), seekerId: id(999), notes: 'Private person and phone' };
  const requestStatus = (broker: number, anonymous = false) => asUser(broker, async tx =>
    (await tx.query<{ id: string; enabled: boolean }>(
      'select id, enabled from public.vs_circle_requirement_status($1)', [privateRequest.id],
    )).rows, anonymous);
  const shareRequest = (enabled: boolean) => asUser(1, tx => setCircleRequirementMatching(async (path, options) => {
    assert.equal(path, '/rest/v1/rpc/vs_circle_request');
    const { p_circle, p_source, p_facts, p_withdraw } = JSON.parse(String(options?.body));
    assert.equal(p_facts?.seekerId, undefined);
    assert.equal(p_facts?.notes?.includes('Private'), !enabled ? undefined : false);
    await tx.query('select public.vs_circle_request($1,$2,$3::jsonb,$4)',
      [p_circle, p_source, JSON.stringify(p_facts), p_withdraw]);
    return new Response(null, { status: 204 });
  }, circle, privateRequest, enabled));
  assert.deepEqual(await requestStatus(1), [{ id: circle, enabled: false }]);
  await shareRequest(true);
  assert.deepEqual(await requestStatus(1), [{ id: circle, enabled: true }]);
  assert.ok((await requestStatus(0)).every(row => !row.enabled));
  assert.deepEqual(await requestStatus(8), []);
  assert.deepEqual(await requestStatus(1, true), []);
  const afterFirstShare = await snapshot();
  await shareRequest(true);
  assert.equal((await snapshot()).revision, afterFirstShare.revision);
  await shareRequest(false);
  assert.deepEqual(await requestStatus(1), [{ id: circle, enabled: false }]);
  const queue=await db.query<{count:string}>('select count(*) count from viewstate_circle.change_queue');
  assert.ok(Number(queue.rows[0].count)>30);
  console.log(JSON.stringify({evidence:'LOCAL_POSTGRES_RLS_RPC_AND_MATCHER_NOT_HOSTED_E2E',brokerIdentities:8,outsiderIdentities:1,initialPublishedProperties:30,initialCrossBrokerPairs:total,sharedReadChecks:8,queueIntents:Number(queue.rows[0].count),publishBatchMs,matchBatchMs}));
  const inviteCircle = id(978);
  const token = 'ab'.repeat(32), expiredToken = 'cd'.repeat(32), revokedToken = 'ef'.repeat(32);
  await asUser(0, tx => tx.query('select public.vs_circle_create($1,$2)', [inviteCircle, 'Invitation test']));
  const makeLink = (broker: number, value: string) => asUser(broker, tx => tx.query('select public.vs_circle_invite_link($1,$2)', [inviteCircle, value]));
  const previewLink = (broker: number, value: string) => asUser(broker, async tx => (await tx.query<{ data: { circleName: string } | null }>('select public.vs_circle_invite_preview($1) data', [value])).rows[0].data);
  const acceptLink = (broker: number, value: string) => asUser(broker, tx => tx.query('select public.vs_circle_invite_accept($1)', [value]));
  await assert.rejects(makeLink(8, token), /CIRCLE_MEMBERSHIP_REQUIRED/);
  await makeLink(0, token); await makeLink(0, token);
  assert.equal((await previewLink(1, token))?.circleName, 'Invitation test');
  assert.equal(await previewLink(1, '00'.repeat(32)), null);
  assert.doesNotMatch(JSON.stringify((await db.query('select * from viewstate_circle.invite_links')).rows), new RegExp(token));
  await acceptLink(1, token); await acceptLink(1, token);
  await assert.rejects(acceptLink(2, token), /CIRCLE_INVITE_UNAVAILABLE/);
  await assert.rejects(makeLink(1, '12'.repeat(32)), /CIRCLE_OWNER_REQUIRED/);
  await makeLink(0, expiredToken);
  await db.query("update viewstate_circle.invite_links set expires_at=now()-interval '1 second' where used_at is null");
  assert.equal(await previewLink(2, expiredToken), null);
  await assert.rejects(acceptLink(2, expiredToken), /CIRCLE_INVITE_UNAVAILABLE/);
  await makeLink(0, revokedToken);
  await asUser(0, tx => tx.query("select public.vs_circle_member($1,$2,'invite')", [inviteCircle, users[2]]));
  await asUser(2, tx => tx.query('select public.vs_circle_accept($1)', [inviteCircle]));
  await asUser(0, tx => tx.query("select public.vs_circle_member($1,$2,'revoke')", [inviteCircle, users[2]]));
  await assert.rejects(acceptLink(2, revokedToken), /CIRCLE_INVITE_UNAVAILABLE/);
  const sendPhone = (phone: string) => asUser(0, async tx => (await tx.query<{ data: { status: string } }>('select public.vs_circle_invite_phone($1,$2) data', [inviteCircle, phone])).rows[0].data.status);
  await db.query('update auth.users set phone=$1 where id=$2', ['96550001234', users[4]]);
  assert.equal(await sendPhone('+96550001234'), 'accepted', 'unconfirmed numbers return the same private acknowledgement');
  await db.query('update auth.users set phone_confirmed_at=now() where id=$1', [users[4]]);
  assert.equal(await sendPhone('+96550001234'), 'accepted');
  assert.equal(await sendPhone('+96550001234'), 'accepted');
  await asUser(4, tx=>tx.query('select public.vs_circle_accept($1)',[inviteCircle]));
  assert.equal(await sendPhone('+96550001234'), 'accepted');
  for(let i=0;i<6;i++)assert.equal(await sendPhone('+96550009999'),'accepted');
  assert.equal(await sendPhone('+96550009999'),'rate_limited');
  const named = await asUser(4, async tx => (await tx.query<{ data: {circle_name: string}[] }>('select public.vs_circle_invitations_named() data')).rows[0].data);
  assert.ok(!named.some(invite => invite.circle_name === 'Invitation test'), 'accepted invitation leaves pending inbox');
  await asUser(0, tx => tx.query('select public.vs_circle_request($1,$2,$3,$4,$5,$6,$7)', [circle,id(981),['salmiya'],600,'monthly',2,2]));
  await asUser(1, tx => tx.query('select public.vs_circle_request($1,$2,$3,$4,$5,$6,$7)', [circle,id(982),['salmiya'],600,'monthly',2,2]));
  const peerRequests=(await db.query('select * from viewstate_circle.requests where circle_id=$1 and owner_id=$2',[circle,users[1]])).rows.length;
  await asUser(0, tx => tx.query('select public.vs_circle_matching_pause($1)', [circle]));
  assert.equal((await db.query('select * from viewstate_circle.requests where circle_id=$1 and owner_id=$2', [circle, users[0]])).rows.length, 0);
  assert.equal((await db.query('select * from viewstate_circle.requests where circle_id=$1 and owner_id=$2',[circle,users[1]])).rows.length,peerRequests);
  console.log('INVITATION_CAPABILITIES: hashed, owner-only, single-use, idempotent, expiry/revocation, confirmed phone and named invitation passed');
 }finally{await db.close();}
});
