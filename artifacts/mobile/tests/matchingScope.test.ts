import test from 'node:test';
import assert from 'node:assert/strict';
import './platformModuleStubs.ts';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import { createPerson } from '../services/people.ts';
import { MyPropertiesMatchingSource } from '../services/myPropertiesMatchingSource.ts';
import { matchingTarget, resolveMatchingScope, runSavedMatchingScope, matchingRestoreFits } from '../services/matchingScope.ts';
import { rememberMatchingReturn, matchingBackRoute } from '../services/matchingReturnSession.ts';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
function prop(id:string, amount=500, propertyType: 'apartment' | 'villa' = 'apartment'):Property{return {core:{id,propertyType,locationArea:{id:'salmiya'}},activeOffer:{id:id+'-offer',propertyCoreId:id,transaction:'rent',rentalPrice:{amount,currencyCode:'KWD'},rentalPeriodId:'monthly'},typeDetails:{propertyType,bedroomCount:2,bathroomCount:2}}}
function req(id:string,seekerId:string|undefined,min=400,max=600):SeekerRequirement{return {id,seekerId,purpose:'rent',propertyType:'apartment',preferredAreaIds:['salmiya'],preferredAreaMode:'specific_areas',budget:{minimum:min,maximum:max,currencyCode:'KWD'},rentalPeriodId:'monthly',notes:'',bedroomsMinimum:2,bathroomsMinimum:1}}
const people=['first','second','third'].map((id,i)=>createPerson({id,name:id,displayPhone:`5012345${i}`,classifications:['seeker']}));
const properties=[prop('selected'),prop('other',900,'villa')];
const requirements=[req(ids[0],people[0].id),{...req(ids[1],people[1].id,800,1000),propertyType:'villa' as const},{...req(ids[2],people[2].id,2000,2500),purpose:'buy' as const,rentalPeriodId:undefined}];
function run(scope:Parameters<typeof runSavedMatchingScope>[0]['scope'],rs=requirements,ps=properties){return runSavedMatchingScope({scope,requirements:rs,people,policies:{},excluded:{},source:new MyPropertiesMatchingSource({getProperties:async()=>ps}),store:{getRequirement:async id=>rs.find(r=>r.id===id)??null}})}
test('Property Match now ranks only that property and removes unrelated client/request groups',async()=>{
 const result=await run({kind:'property',id:'selected'});
 assert.ok(result.runs.every(r=>r.evaluatedCandidateCount===1));
 assert.deepEqual(result.groups.map(g=>g.person.id),[people[0].id]);
 assert.deepEqual(result.groups.flatMap(g=>g.requirementGroups.flatMap(r=>r.matches.map(m=>m.propertyId))),['selected']);
 const sharedOwner = await run({kind:'property',id:'selected'},[requirements[0],{...requirements[2],seekerId:people[0].id}]);
 assert.deepEqual(sharedOwner.groups[0].requirementGroups.map(r=>r.requirement.id),[ids[0]],'unrelated requests of the same client are removed too');
 const all=await run({kind:'all'});
 assert.ok(all.runs.every(r=>r.evaluatedCandidateCount===2));
 assert.ok(all.groups.some(g=>g.requirementGroups.some(r=>r.matches.some(m=>m.propertyId==='other'))));
});
test('Request Match now runs exactly the requested saved requirement, including a request without a Person',async()=>{
 const result=await run({kind:'requirement',id:ids[1]});
 assert.deepEqual(result.runs.map(r=>r.requirementId),[ids[1]]);
 assert.deepEqual(result.groups.map(g=>g.person.id),[people[1].id]);
 const unlinked=req(ids[0],undefined);const single=await run({kind:'requirement',id:ids[0]},[unlinked]);
 assert.equal(single.unlinked?.requirement.id,ids[0]);assert.equal(single.groups.length,0);
});
test('No suitable matches stays scoped; missing, invalid or ambiguous target never falls back to all',async()=>{
 const empty=await run({kind:'property',id:'selected'},[requirements[2]]);assert.deepEqual(empty.groups,[]);
 await assert.rejects(run({kind:'property',id:'deleted'}),/MATCHING_PROPERTY_NOT_FOUND/);
 await assert.rejects(run({kind:'requirement',id:'deleted'}),/MATCHING_REQUIREMENT_NOT_FOUND/);
 await assert.rejects(run({kind:'invalid'}),/MATCHING_SCOPE_INVALID/);
 assert.deepEqual(resolveMatchingScope({propertyId:'selected',requirementId:ids[0]}),{kind:'invalid'});
 assert.deepEqual(resolveMatchingScope({scope:'property'}),{kind:'invalid'});
});
test('Every explicit entry overwrites stale tab params and a fresh repeated target has a new entry identity',()=>{
 const old=matchingTarget({kind:'requirement',id:ids[0]}).params;
 const next=matchingTarget({kind:'property',id:'selected'}).params;
 assert.deepEqual(resolveMatchingScope({...old,...next}),{kind:'property',id:'selected'});
 assert.equal(next.requirementId,'');assert.equal(next.best,'');assert.equal(next.returnSession,'');
 assert.notEqual(matchingTarget({kind:'property',id:'selected'}).params.entry,next.entry);
 assert.deepEqual(resolveMatchingScope({...next,...matchingTarget({kind:'all'}).params}),{kind:'all'});
 assert.deepEqual(resolveMatchingScope({...next,...matchingTarget({kind:'best'}).params}),{kind:'best'});
});
test('Return from details retains the original scope; an unrelated previous return cannot override a new entry',()=>{
 const token=rememberMatchingReturn({scopePropertyId:'selected',mode:'saved',policies:{},excluded:{},scrollOffset:120});
 const url=new URL(matchingBackRoute(token),'https://example.test');
 const params=Object.fromEntries(url.searchParams);
 assert.equal(params.returnSession,token);assert.deepEqual(resolveMatchingScope(params),{kind:'property',id:'selected'});
 assert.equal(matchingRestoreFits({kind:'requirement',id:ids[0]},{scopePropertyId:'selected'}),false);
 assert.equal(matchingRestoreFits({kind:'property',id:'selected'},{scopePropertyId:'selected'}),true);
});
