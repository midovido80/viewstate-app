import {URL} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CircleMatchingSource,type SharedCircleProperty} from '../services/circleMatchingSource.ts';
import {BrokerInitiatedMatching} from '../services/brokerInitiatedMatching.ts';
import type {SeekerRequirement} from '@workspace/property-domain';

test('existing engine evaluates the hosted RLS test snapshot without reading private account catalogs',async()=>{
 const evidence=JSON.parse(await readFile(new URL('../../../docs/trust-circle/hosted-stage01-evidence.json',import.meta.url),'utf8')) as {
  evidence:string;fixture_publishers:string[];catalog:SharedCircleProperty[];fixtures_removed:boolean;private_policies_unchanged:boolean;
 };
 assert.equal(evidence.evidence,'HOSTED_POSTGRES_ROLE_RLS_RPC_NOT_LOGIN_OR_DEVICE_E2E');
 assert.equal(evidence.fixtures_removed,true);assert.equal(evidence.private_policies_unchanged,true);
 assert.equal(evidence.catalog.length,30);assert.equal(evidence.fixture_publishers.length,8);
 const areas=['salmiya','jabriya','hawally','salwa','bayan','mishref','mangaf','mahboula'];
 let pairs=0;
 for(let b=0;b<8;b++){
  let reads=0;
  const source=new CircleMatchingSource(async()=>{reads++;return evidence.catalog;});
  const r:SeekerRequirement={id:`33333333-3333-4333-8333-${String(b).padStart(12,'0')}`,purpose:'rent',propertyType:'apartment',preferredAreaIds:[areas[(b+1)%8]],preferredAreaMode:'specific_areas',budget:{maximum:800,currencyCode:'KWD'},rentalPeriodId:'monthly',bedroomsMinimum:2,bathroomsMinimum:2,notes:''};
  const run=await new BrokerInitiatedMatching({getRequirement:async()=>r},source).runForRequirement(r.id,{strictFields:['location']});
  const expected=evidence.catalog.filter(row=>row.publisher_id===evidence.fixture_publishers[(b+1)%8]).map(row=>row.id).sort();
  assert.deepEqual(run.matches.map(m=>m.propertyId).sort(),expected);
  assert.ok(run.matches.every(m=>m.category==='direct'));assert.equal(run.evaluatedCandidateCount,30);
  await source.getCandidates();assert.equal(reads,1);pairs+=run.matches.length;
 }
 assert.equal(pairs,30);
 // A missing/failed shared source must not silently broaden the search scope.
 await assert.rejects(new CircleMatchingSource(async()=>{throw new Error('MEMBERSHIP_REVOKED');}).getCandidates(),/MEMBERSHIP_REVOKED/);
 const duplicate=[evidence.catalog[0],evidence.catalog[0]];
 await assert.rejects(new CircleMatchingSource(async()=>duplicate).getCandidates(),/CIRCLE_CATALOG_INVALID/);
});
