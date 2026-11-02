import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMatch, type Property, type SeekerRequirement } from '@workspace/property-domain';
import { runQuickMatching, emptyQuickMatchingFilters, quickFeatureFact, quickHousingFact, validQuickMatchingFilters, type QuickMatchingFilters } from '../services/quickMatching.ts';
import { matchingComparisonRows, matchingReviewRows } from '../services/matchingPresentation.ts';
import { clearMatchingReturn, readMatchingReturn, rememberMatchingReturn, matchingBackRoute } from '../services/matchingReturnSession.ts';
import type { Person } from '../services/people.ts';
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const person=(n=1):Person=>({id:`client-${n}`,name:`Client ${n}`,classifications:['seeker'],displayPhone:'12345678',normalizedPhone:'12345678',notes:''});
const request=(n=1,patch:Partial<SeekerRequirement>={}):SeekerRequirement=>({id:id(n),seekerId:`client-${n}`,purpose:'rent',propertyType:'apartment',preferredAreaIds:['salmiya'],budget:{minimum:400,maximum:700,currencyCode:'KWD'},rentalPeriodId:'monthly',notes:'',...patch}) as SeekerRequirement;
const property=(n=1,details:Record<string,unknown>={},amount=650):Property=>({core:{id:`p-${n}`,propertyType:'apartment',locationArea:{id:'salmiya'}},activeOffer:{id:`o-${n}`,propertyCoreId:`p-${n}`,transaction:'rent',rentalPrice:{amount,currencyCode:'KWD'},rentalPeriodId:'monthly'},typeDetails:{propertyType:'apartment',apartmentSubtype:'standard_apartment',bedroomCount:3,bathroomCount:2,...details}}) as Property;
const candidates=(...properties:Property[])=>properties.map(property=>({property}));

test('Quick filters need no seeker or synthetic requirement; real clients retain exact saved request IDs',async()=>{
 const people=[person(),person(2)],requests=[request(),request(2,{propertyType:'villa'})],p=property();
 const before=JSON.stringify([people,requests,p]);
 const results=await runQuickMatching(emptyQuickMatchingFilters(),candidates(p),requests,people);
 assert.equal(results.length,1);assert.equal(results[0].clients.length,1);
 assert.equal(results[0].clients[0].person.id,people[0].id);assert.equal(results[0].clients[0].requirement.id,requests[0].id);
 assert.deepEqual(results[0].clients[0].result,evaluateMatch(requests[0],{property:p}));
 assert.equal(JSON.stringify([people,requests,p]),before);
});
test('Keep all filtered properties without clients, deduplicate properties, exclude orphan/invalid requests',async()=>{
 const p=property();const orphan=request(2);const invalid={...request(),id:'invalid'};
 const result=await runQuickMatching(emptyQuickMatchingFilters(),candidates(p,p,property(2)),[orphan,invalid],[person()]);
 assert.deepEqual(result.map(r=>r.candidate.property.core.id),['p-1','p-2']);assert.ok(result.every(r=>r.clients.length===0&&r.pendingClients.length===0));
 const none=await runQuickMatching(emptyQuickMatchingFilters(),candidates(p),[],[]);assert.equal(none.length,1);
});
test('Quick lookup uses numeric ranges/minima, currency, purpose, cadence, sector and subtype',async()=>{
 const sale={...property(9),activeOffer:{id:'sale',propertyCoreId:'p-9',transaction:'sale',salePrice:{amount:650,currencyCode:'KWD'}}} as Property;
 const daily={...property(8),activeOffer:{...property(8).activeOffer,rentalPeriodId:'daily'}} as Property;
 const usd={...property(7),activeOffer:{...property(7).activeOffer,rentalPrice:{amount:650,currencyCode:'USD'}}} as Property;
 const result=await runQuickMatching({...emptyQuickMatchingFilters(),sector:'residential',propertyType:'apartment',apartmentSubtype:'standard_apartment',minimumBudget:600,maximumBudget:650,bedroomsMinimum:3,bathroomsMinimum:2},candidates(property(1),property(2,{},651),property(3,{},599),property(4,{bedroomCount:2}),property(5,{bathroomCount:undefined}),property(6,{apartmentSubtype:'duplex'}),usd,daily,sale),[],[]);
 assert.deepEqual(result.map(r=>r.candidate.property.core.id),['p-1']);
 assert.equal((await runQuickMatching({...emptyQuickMatchingFilters(),sector:'commercial'},candidates(property()),[],[])).length,0);
 assert.equal((await runQuickMatching({...emptyQuickMatchingFilters(),purpose:'buy'},candidates(property(),sale),[],[]))[0]?.candidate.property.core.id,'p-9');
});
test('Only requested features filter; missing evidence needs confirmation, false is excluded, split AC is accepted',async()=>{
 const result=await runQuickMatching({...emptyQuickMatchingFilters(),features:['parking','elevator','airConditioning']},candidates(property(1,{apartmentSubtype:'studio',hasParking:true,hasElevator:true,hasSplitAC:true}),property(2,{apartmentSubtype:'studio',hasParking:false}),property(3,{parkingSpaceCount:1,hasElevator:true}),property(4,{apartmentSubtype:'studio',hasCentralAC:false,hasSplitAC:false})),[],[]);
 assert.deepEqual(result.map(r=>r.candidate.property.core.id),['p-1','p-3']);assert.deepEqual(result[0].confirmations,[]);assert.deepEqual(result[1].confirmations,['airConditioning']);
 assert.equal(quickFeatureFact({hasCentralAC:false},'airConditioning'),undefined);
 assert.equal(quickFeatureFact({hasBuildingParking:true},'parking'),true);
 assert.equal(quickFeatureFact({parkingSpaceCount:0},'parking'),false);
});
test('Companies and women rely on recorded housing types; mixed does not invent permission',async()=>{
 for(const housing of ['company_staff','women'] as const){const results=await runQuickMatching({...emptyQuickMatchingFilters(),occupancy:housing},candidates(...[[housing],['family'],['mixed'],[]].map((housingTypes,i)=>({...property(i+1),core:{...property(i+1).core,propertyType:'whole_building'},typeDetails:{propertyType:'whole_building',housingTypes}} as Property))),[],[]);assert.deepEqual(results.map(r=>r.candidate.property.core.id),['p-1']);}
 assert.equal(quickHousingFact({occupancy:'any'},'family'),true);assert.equal(quickHousingFact({housingTypes:['mixed']},'women'),undefined);
});
test('Evaluate all real requests against each property, without a five-property shortlist losing client #6',async()=>{
 const results=await runQuickMatching(emptyQuickMatchingFilters(),candidates(...Array.from({length:25},(_,i)=>property(i+1))),[request()],[person()]);
 assert.equal(results.length,25);assert.ok(results.every(r=>r.clients[0]?.requirement.id===id(1)));
 const missing=request(2,{bedroomsMinimum:3});const p=property(30,{bedroomCount:undefined});
 const pending=await runQuickMatching(emptyQuickMatchingFilters(),candidates(p),[missing],[person(2)]);
 assert.equal(pending[0].clients.length,0);assert.equal(pending[0].pendingClients.length,1);
});
test('Cancelled quick searches cannot publish a stale result and input bounds are validated',async()=>{
 await assert.rejects(runQuickMatching(emptyQuickMatchingFilters(),candidates(property()),[],[],()=>false),/CANCELLED/);
 let current=true;setTimeout(()=>{current=false},0);
 await assert.rejects(runQuickMatching(emptyQuickMatchingFilters(),candidates(property()),Array.from({length:40},(_,i)=>request(i+1)),Array.from({length:40},(_,i)=>person(i+1)),()=>current),/CANCELLED/);
 for(const patch of [{minimumBudget:0},{maximumBudget:-1},{minimumBudget:700,maximumBudget:600},{bedroomsMinimum:11},{bathroomsMinimum:1.5},{minimumBudget:Infinity}])assert.equal(validQuickMatchingFilters({...emptyQuickMatchingFilters(),...patch}),false);
 assert.equal(validQuickMatchingFilters(emptyQuickMatchingFilters()),true);
});
test('Review lists only approved discussion criteria and essential confirmation features, with original status intact',()=>{
 const r=request(1,{bedroomsMinimum:4,centralAC:true,swimmingPool:true,gym:true,seaView:true});
 const p=property();const result=evaluateMatch(r,{property:p});
 const rows=matchingComparisonRows(result,r,p,'ar'),review=matchingReviewRows(rows);
 assert.deepEqual(review.discussions.map(r=>r.field),['bedrooms']);assert.deepEqual(review.confirmations.map(r=>r.field),['hasCentralAC']);
 assert.ok(review.visible.every(r=>!['hasPool','hasSharedGym','hasSeaView'].includes(r.field)));
 assert.equal(review.confirmations[0].status,'unknown');assert.ok(rows.some(r=>r.field==='hasPool'));
});
test('Quick filters survive request/property return without persisting or mutating a client request',()=>{
 clearMatchingReturn();const quickFilters:QuickMatchingFilters={...emptyQuickMatchingFilters(),minimumBudget:400,occupancy:'women' as const,features:['parking' as const]};
 const token=rememberMatchingReturn({mode:'quick',quickFilters,policies:{},excluded:{},scrollOffset:400,layout:{view:'properties',card:JSON.stringify([id(1),'p-1'])}});
 const restored=readMatchingReturn(token)!;assert.deepEqual(restored.quickFilters,quickFilters);assert.equal(restored.quickRequirement,undefined);
 restored.quickFilters!.features.push('elevator');assert.deepEqual(readMatchingReturn(token)!.quickFilters!.features,['parking']);assert.match(matchingBackRoute(token),/matching\?returnSession/);
 clearMatchingReturn();assert.equal(readMatchingReturn(token),undefined);
});

test('Whole-building housing differences use translated labels, never stored option keys',()=>{
 const r=request(1,{propertyType:'whole_building',occupancy:'family'});
 const p={...property(),core:{...property().core,propertyType:'whole_building'},typeDetails:{propertyType:'whole_building',housingTypes:['bachelor','company_staff']}} as Property;
 const row=matchingComparisonRows(evaluateMatch(r,{property:p}),r,p,'ar').find(r=>r.field==='occupancy')!;
 assert.ok(row.offered.includes('شركات'));assert.ok(row.offered.includes('عزاب'));assert.doesNotMatch(row.offered,/company_staff|bachelor/);assert.equal(row.status,'not_met');
});

test('matching budgets display missing bounds, open budget and explicit zero without changing saved data', async () => {
 const {formatMatchingBudget}=await import('../services/matchingPresentation.ts');
 for(const language of ['ar','en'] as const){
  const text=(minimum:number|undefined,maximum:number|undefined,open=false)=>formatMatchingBudget({budget:{minimum,maximum,currencyCode:'KWD'},...(open?{unspecifiedFields:['budget']}:{})},language);
  assert.equal(text(undefined,450),language==='ar'?'حتى 450 د.ك':'Up to 450 KWD');
  assert.equal(text(350,undefined),language==='ar'?'من 350 د.ك':'From 350 KWD');
  assert.equal(text(350,450),'350–450 KWD');
  assert.equal(text(0,450),'0–450 KWD');
  assert.equal(text(undefined,undefined,true),language==='ar'?'ميزانية مفتوحة':'Open budget');
  assert.equal(text(undefined,undefined),language==='ar'?'غير محدد':'Not specified');
 }
 const r=request(1,{budget:{maximum:450,currencyCode:'KWD'}}),before=JSON.stringify(r);formatMatchingBudget(r,'ar');assert.equal(JSON.stringify(r),before);
});

test('commercial facts stay visible in compact review with true matched, missing and different states',async()=>{
 const {compactMatchingComparisonRows}=await import('../services/matchingPresentation.ts');
 const r=request(1,{propertyType:'office',commercialServices:{automaticNumberCount:2,cleaning:true,kitchen:'shared'}});
 const offered={...property(),core:{...property().core,propertyType:'office'},typeDetails:{propertyType:'office',automaticNumberCount:3,hasFacilityCleaning:true,hasKitchen:true,kitchenAccess:'shared'}} as Property;
 for(const language of ['ar','en'] as const){
  const before=JSON.stringify([r,offered]);const result=evaluateMatch(r,{property:offered});const rows=matchingComparisonRows(result,r,offered,language),review=matchingReviewRows(rows);
  const compact=compactMatchingComparisonRows(review.visible);
  for(const field of ['automaticNumberCount','facilityCleaning','kitchenAccess']){assert.equal(compact.filter(row=>row.field===field).length,1);assert.equal(compact.find(row=>row.field===field)?.status,'matched');}
  assert.equal(compact.find(row=>row.field==='kitchenAccess')?.requested,language==='ar'?'مشترك':'Shared');
  assert.equal(JSON.stringify([r,offered]),before);
 }
 const missing={...offered,typeDetails:{propertyType:'office',hasKitchen:true}} as Property;
 const review=matchingReviewRows(matchingComparisonRows(evaluateMatch(r,{property:missing}),r,missing,'ar'));
 assert.deepEqual(review.confirmations.filter(row=>['automaticNumberCount','facilityCleaning','kitchenAccess'].includes(row.field)).map(row=>row.status),['unknown','unknown','unknown']);
 const bad={...offered,typeDetails:{propertyType:'office',automaticNumberCount:1,hasFacilityCleaning:false,hasKitchen:true,kitchenAccess:'private'}} as Property;
 const badRows=matchingReviewRows(matchingComparisonRows(evaluateMatch(r,{property:bad}),r,bad,'ar')).visible;
 for(const field of ['automaticNumberCount','facilityCleaning','kitchenAccess'])assert.notEqual(badRows.find(row=>row.field===field)?.status,'matched');
 assert.equal(badRows.find(row=>row.field==='kitchenAccess')?.offered,'خاص');
});
