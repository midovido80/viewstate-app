import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '@/contexts/I18nContext';
import { getSavedPropertyTypeLabel } from '@/services/savedPropertyClassification';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import type { QuickClientMatch, QuickPropertyMatch } from '@/services/quickMatching';
import type { MatchingResultsLayout } from '@/services/matchingGroups';
import { MatchingResultCard } from './MatchingResultCard';
import { Button } from './Button';

function uniqueClients(pairs:readonly QuickClientMatch[]){const map=new Map<string,QuickClientMatch>();for(const pair of pairs)if(!map.has(pair.person.id))map.set(pair.person.id,pair);return [...map.values()];}
export function QuickMatchingResults({results,layout,onLayoutChange,onOpenProperty,onOpenPerson,onOpenRequest}: {results:readonly QuickPropertyMatch[];layout:MatchingResultsLayout;onLayoutChange:(layout:MatchingResultsLayout)=>void;onOpenProperty:(id:string)=>void;onOpenPerson:(id:string)=>void;onOpenRequest:(id:string)=>void}) {
 const {language,isRTL,fonts,t}=useI18n();const ar=language==='ar';const [visible,setVisible]=useState(()=>Math.max(20,layout.quickVisible??20)),[showPending,setShowPending]=useState<string[]>([]),[clientLimits,setClientLimits]=useState<Record<string,number>>({});
 const text={color:'#173F78',fontFamily:fonts.medium,textAlign:isRTL?'right' as const:'left' as const};
 return <View style={{gap:12}} testID="quick-matching-results"><Text style={{...text,fontFamily:fonts.bold}}>{ar?`${results.length} عقارات ضمن نطاق البحث`:`${results.length} properties in this search`}</Text>{!results.length && <Text style={text}>{ar?'لا توجد عقارات ضمن نطاق البحث الحالي. جرّب تخفيف أحدها.':'No properties fit these filters. Try relaxing one.'}</Text>}
 {results.slice(0,visible).map((item,index)=>{
  const property=item.candidate.property,id=property.core.id,offer=property.activeOffer;
  const ready=uniqueClients(item.clients),readyIds=new Set(ready.map(p=>p.person.id));
  const pending=uniqueClients(item.pendingClients).filter(p=>!readyIds.has(p.person.id));
  const limit=clientLimits[id]??5;
  const pairCard=(pair:QuickClientMatch)=>{const key=JSON.stringify([pair.requirement.id,id]);return <MatchingResultCard key={key} result={pair.result} rank={1} property={property} requirement={pair.requirement} personName={pair.person.name} perspective="properties" expanded={layout.card===key} onToggle={()=>onLayoutChange({...layout,view:'properties',card:layout.card===key?null:key})} onPress={()=>onOpenProperty(id)} onViewPerson={()=>onOpenPerson(pair.person.id)} onViewRequirement={()=>onOpenRequest(pair.requirement.id)} />;};
  return <View key={id} testID={`quick-property-${id}`} style={{borderRadius:16,borderWidth:1,borderColor:'#C9D8EC',padding:12,gap:10,backgroundColor:index%2?'#EDF4FC':'#F7FAFF'}}>
   <Text style={{...text,fontFamily:fonts.bold,fontSize:16}}>{getSavedPropertyTypeLabel(property,language,t(`propertyType.${property.core.propertyType}`))} · {getAreaById(property.core.locationArea.id)?.[language]??(ar?'منطقة غير مسجلة':'Unrecorded area')}</Text>
   <Text style={{...text,color:'#245DF4',fontFamily:fonts.bold}}>{offer.transaction==='rent'?formatRentalPrice(offer.rentalPrice.amount,offer.rentalPrice.currencyCode,offer.rentalPeriodId,language,t):formatPrice(offer.salePrice.amount,offer.salePrice.currencyCode,language)}</Text>
   {!!item.confirmations.length && <Text style={{...text,color:'#946200'}}>{ar?'تحتاج تأكيدًا: ':'Confirm: '}{item.confirmations.map(f=>f==='parking'?ar?'المواقف':'Parking':f==='elevator'?ar?'المصعد':'Elevator':ar?'التكييف':'Air conditioning').join(' · ')}</Text>}
   <Button title={ar?'عرض العقار':'View property'} variant="outline" onPress={()=>onOpenProperty(id)} testID={`quick-open-property-${id}`} />
   {ready.length ? <Text style={{...text,color:'#B45309',fontFamily:fonts.bold}}>{ar?(ready.length===1?'عميل واحد لديه طلب مناسب':`${ready.length} عملاء لديهم طلبات مناسبة`):`${ready.length} clients have suitable requests`}</Text>:<Text testID={`quick-no-client-${id}`} style={{...text,color:'#64748B'}}>{ar?'لا يوجد عميل مناسب مسجل حاليًا':'No suitable client is currently registered'}</Text>}
   {ready.slice(0,limit).map(pairCard)}
   {ready.length>limit && <Button title={ar?'عرض باقي العملاء':'Show more clients'} variant="outline" onPress={()=>setClientLimits(v=>({...v,[id]:limit+5}))} />}
   {!!pending.length && <><Button title={ar?`${showPending.includes(id)?'إخفاء':'عرض'} ${pending.length===1?'مطابقة عميل تحتاج تأكيدًا':`${pending.length} عملاء تحتاج مطابقتهم تأكيدًا`}`:`${showPending.includes(id)?'Hide':'Show'} ${pending.length} clients needing confirmation`} variant="outline" onPress={()=>setShowPending(v=>v.includes(id)?v.filter(p=>p!==id):[...v,id])} />{showPending.includes(id) && <><Text style={{...text,color:'#946200'}}>{ar?'ليست ترشيحات جاهزة قبل تأكيد البيانات الناقصة.':'Not ready suggestions until missing facts are confirmed.'}</Text>{pending.slice(0,limit).map(pairCard)}{pending.length>limit && <Button title={ar?'عرض المزيد':'Show more'} variant="outline" onPress={()=>setClientLimits(v=>({...v,[id]:limit+5}))} />}</>}</>}
  </View>;
 })}
 {results.length>visible && <Button title={ar?`عرض المزيد (${results.length-visible})`:`Show more (${results.length-visible})`} variant="outline" onPress={()=>{setVisible(n=>n+20);onLayoutChange({...layout,quickVisible:visible+20});}} testID="quick-show-more" />}
 </View>;
}
