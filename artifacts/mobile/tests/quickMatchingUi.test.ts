import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { evaluateMatch, type Property, type SeekerRequirement } from '@workspace/property-domain';
import { emptyQuickMatchingFilters, type QuickMatchingFilters } from '../services/quickMatching.ts';
const state={ar:true,values:[] as any[],cursor:0};(globalThis as any).__quickUI=state;
(globalThis as any).React={createElement:(type:any,props:any,...children:any[])=>({type,props:{...props,children:children.length?children:props?.children}})};
const stubs=new Map([
 ['react',`export const useState=initial=>{const s=globalThis.__quickUI,i=s.cursor++;if(!(i in s.values))s.values[i]=typeof initial==='function'?initial():initial;return [s.values[i],v=>s.values[i]=typeof v==='function'?v(s.values[i]):v];};`],
 ['react-native',`export const Text='Text',View='View',TouchableOpacity='TouchableOpacity',Modal='Modal',ScrollView='ScrollView';`],
 ['@expo/vector-icons',`export const Feather='Feather';`],
 ['./FormField',`export const FieldSelect='FieldSelect',TextInput='TextInput';`],
 ['./ChoiceTile',`export const ChoiceGrid='ChoiceGrid',ChoiceTile='ChoiceTile';`],
 ['./MatchingResultCard',`export const MatchingResultCard='MatchingResultCard';`],
 ['./Button',`export const Button='Button';`],
 ['@/contexts/I18nContext',`export const useI18n=()=>({language:globalThis.__quickUI.ar?'ar':'en',isRTL:globalThis.__quickUI.ar,fonts:{medium:'m',semiBold:'s',regular:'r',bold:'b'},t:key=>key});`],
]);
registerHooks({resolve(name,ctx,next){return stubs.has(name)?{url:'quick-ui:'+encodeURIComponent(name),shortCircuit:true}:next(name,ctx);},load(url,ctx,next){return url.startsWith('quick-ui:')?{format:'module',source:stubs.get(decodeURIComponent(url.slice(9)))!,shortCircuit:true}:next(url,ctx);}});
const elements=(v:any):any[]=>Array.isArray(v)?v.flatMap(elements):v?.props?[v,...elements(v.props.children)]:[];
function render(component:any,props:any){state.cursor=0;return elements(component(props));}
function reset(){state.values=[];state.cursor=0;}

test('Quick form exposes only approved filters, range dropdowns stop at ten, and feature buttons toggle twice',async()=>{
 const {QuickMatchingForm,QuickFilterSelect}=await import('../components/QuickMatchingForm.tsx');
 for(const ar of [true,false]){state.ar=ar;reset();let filters=emptyQuickMatchingFilters();let budgetText={minimum:'',maximum:''};
 const props=()=>({filters,onChange:(f:QuickMatchingFilters)=>{filters=f;},budgetText,onBudgetChange:(key:string,v:string)=>{budgetText={...budgetText,[key]:v};}});
 let tree=render(QuickMatchingForm,props());
 assert.equal(tree.filter(e=>e.type==='TextInput').length,2);assert.ok(!JSON.stringify(tree).includes('seeker-'));
 assert.equal(tree.filter(e=>e.props.testID?.startsWith('quick-feature-')).length,3);
 for(const field of ['bedrooms','bathrooms']){const dropdown=tree.find(e=>e.type===QuickFilterSelect&&e.props.testID===`matching-input-${field}`)!;assert.deepEqual(dropdown.props.options.map((o:any)=>o.id),['',...Array.from({length:10},(_,i)=>String(i+1))]);}
 const parking=()=>render(QuickMatchingForm,props()).find(e=>e.props.testID==='quick-feature-parking')!;
 parking().props.onPress();assert.deepEqual(filters.features,['parking']);parking().props.onPress();assert.deepEqual(filters.features,[]);
 tree.find(e=>e.props.testID==='matching-input-min')!.props.onChangeText('٤٠٠');assert.equal(budgetText.minimum,'٤٠٠');
 tree.find(e=>e.type===QuickFilterSelect&&e.props.testID==='quick-occupancy')!.props.onChange('women');assert.equal(filters.occupancy,'women');
 render(QuickMatchingForm,props()).find(e=>e.props.testID==='quick-sector-commercial')!.props.onPress();
 assert.equal(filters.occupancy,undefined);assert.equal(render(QuickMatchingForm,props()).some(e=>e.props.testID==='quick-occupancy'),false);
 }
});
test('Dropdown cancellation changes no value, selection commits once and displays its active surface',async()=>{
 const {QuickFilterSelect}=await import('../components/QuickMatchingForm.tsx');reset();let chosen='';
 const props={testID:'count',label:'الغرف',value:'',options:[{id:'',label:'غير محدد'},{id:'10',label:'10'}],onChange:(id:string)=>chosen=id};
 let tree=render(QuickFilterSelect,props);assert.equal(tree.find(e=>e.type==='Modal')!.props.visible,false);
 tree.find(e=>e.type==='FieldSelect')!.props.onPress();tree=render(QuickFilterSelect,props);assert.equal(tree.find(e=>e.type==='Modal')!.props.visible,true);assert.equal(tree.find(e=>e.type==='FieldSelect')!.props.active,true);
 tree.find(e=>e.props.testID==='count-cancel')!.props.onPress();assert.equal(chosen,'');assert.equal(render(QuickFilterSelect,props).find(e=>e.type==='Modal')!.props.visible,false);
 render(QuickFilterSelect,props).find(e=>e.type==='FieldSelect')!.props.onPress();render(QuickFilterSelect,props).find(e=>e.props.testID==='count-option-10')!.props.onPress();assert.equal(chosen,'10');assert.equal(render(QuickFilterSelect,props).find(e=>e.type==='Modal')!.props.visible,false);
});
test('Property results keep the exact no-client phrase, paginate without losing properties, and route actual client/request IDs',async()=>{
 const {QuickMatchingResults}=await import('../components/QuickMatchingResults.tsx');reset();state.ar=true;
 const r={id:'11111111-1111-4111-8111-111111111111',seekerId:'real-client',purpose:'rent',propertyType:'apartment',preferredAreaIds:['salmiya'],budget:{maximum:700,currencyCode:'KWD'},rentalPeriodId:'monthly',notes:''} as SeekerRequirement;
 const p={core:{id:'p-0',propertyType:'apartment',locationArea:{id:'salmiya'}},activeOffer:{id:'offer',propertyCoreId:'p-0',transaction:'rent',rentalPrice:{amount:650,currencyCode:'KWD'},rentalPeriodId:'monthly'},typeDetails:{propertyType:'apartment',apartmentSubtype:'standard_apartment'}} as Property;
 const pair={requirement:r,result:evaluateMatch(r,{property:p}),person:{id:'real-client',name:'عميل حقيقي'}};
 const results=Array.from({length:25},(_,i)=>({candidate:{property:{...p,core:{...p.core,id:`p-${i}`}}},clients:i===0?[pair,{...pair,requirement:{...r,id:'other-request'}}]:[],pendingClients:i===1?[pair]:[],confirmations:[]}));
 const opened:string[]=[];let layout:any={view:'properties'};
 const props=()=>({results,layout,onLayoutChange:(next:any)=>layout=next,onOpenProperty:(id:string)=>opened.push(id),onOpenPerson:(id:string)=>opened.push(id),onOpenRequest:(id:string)=>opened.push(id)});
 let tree=render(QuickMatchingResults,props());assert.equal(tree.filter(e=>e.props.testID?.startsWith('quick-property-')).length,20);
 assert.ok(JSON.stringify(tree.find(e=>e.props.testID==='quick-no-client-p-1')).includes('لا يوجد عميل مناسب مسجل حاليًا'));
 assert.equal(tree.filter(e=>e.type==='MatchingResultCard').length,1); // same person counts once; pending not shown as ready
 const card=tree.find(e=>e.type==='MatchingResultCard')!;assert.equal(card.props.requirement.id,r.id);card.props.onViewPerson();card.props.onViewRequirement();card.props.onPress();assert.deepEqual(opened,['real-client',r.id,'p-0']);
 card.props.onToggle();assert.equal(render(QuickMatchingResults,props()).find(e=>e.type==='MatchingResultCard')!.props.expanded,true);
 tree.find(e=>e.props.testID==='quick-show-more')!.props.onPress();tree=render(QuickMatchingResults,props());assert.equal(tree.filter(e=>e.props.testID?.startsWith('quick-property-')).length,25);assert.equal(tree.some(e=>e.props.testID==='quick-show-more'),false);
});
