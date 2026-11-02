import { PROPERTY_TYPES, evaluateMatch, matchingPropertyFacts, type MatchingPropertyCandidate, type MatchResult, type PropertyType, type RequirementPurpose, type SeekerRequirement } from '@workspace/property-domain';
import { getBuiltPropertySector, type PropertySectorFilter } from './propertySectorSelection';
import { validMatchingRequirements } from './matchingUi';
import type { Person } from './people';

export type QuickHousing = 'family' | 'bachelor' | 'company_staff' | 'women';
export type QuickFeature = 'parking' | 'elevator' | 'airConditioning';
export interface QuickMatchingFilters {
  purpose: RequirementPurpose;
  sector: PropertySectorFilter;
  propertyType?: PropertyType;
  apartmentSubtype?: 'studio' | 'standard_apartment' | 'duplex';
  minimumBudget?: number;
  maximumBudget?: number;
  bedroomsMinimum?: number;
  bathroomsMinimum?: number;
  occupancy?: QuickHousing;
  features: QuickFeature[];
}
export const emptyQuickMatchingFilters = (): QuickMatchingFilters => ({ purpose: 'rent', sector: 'all', features: [] });
export interface QuickClientMatch { person: Person; requirement: SeekerRequirement; result: MatchResult }
export interface QuickPropertyMatch {
  candidate: MatchingPropertyCandidate;
  confirmations: string[];
  clients: QuickClientMatch[];
  pendingClients: QuickClientMatch[];
}
export function validQuickMatchingFilters(f: QuickMatchingFilters): boolean {
  return !!f && Array.isArray(f.features) && (f.propertyType===undefined || PROPERTY_TYPES.includes(f.propertyType))
    && (f.apartmentSubtype===undefined || f.propertyType==='apartment' && ['studio','standard_apartment','duplex'].includes(f.apartmentSubtype))
    && ['rent','buy'].includes(f.purpose) && ['all','residential','commercial'].includes(f.sector)
    && [f.minimumBudget,f.maximumBudget].every(v=>v===undefined || Number.isFinite(v) && v>0)
    && !(f.minimumBudget!==undefined && f.maximumBudget!==undefined && f.minimumBudget>f.maximumBudget)
    && [f.bedroomsMinimum,f.bathroomsMinimum].every(v=>v===undefined || Number.isInteger(v) && v>=1 && v<=10)
    && (f.occupancy===undefined || ['family','bachelor','company_staff','women'].includes(f.occupancy))
    && f.features.every(v=>['parking','elevator','airConditioning'].includes(v));
}
export function quickFeatureFact(facts: Readonly<Record<string,unknown>>, feature: QuickFeature): boolean | undefined {
  if(feature==='elevator') return typeof facts.hasElevator==='boolean' ? facts.hasElevator : undefined;
  if(feature==='parking') {
    if(typeof facts.hasParking==='boolean') return facts.hasParking;
    if(typeof facts.hasBuildingParking==='boolean') return facts.hasBuildingParking;
    if(Array.isArray(facts.parkingTypes) && facts.parkingTypes.length) return true;
    return typeof facts.parkingSpaceCount==='number' ? facts.parkingSpaceCount>0 : undefined;
  }
  if(facts.hasCentralAC===true || facts.hasSplitAC===true) return true;
  if(facts.hasCentralAC===false && facts.hasSplitAC===false) return false;
  // "Not central" does not establish whether unit air conditioning exists.
  return undefined;
}
export function quickHousingFact(facts: Readonly<Record<string,unknown>>, wanted: QuickHousing): boolean | undefined {
  if(Array.isArray(facts.housingTypes) && facts.housingTypes.length) {
    if(facts.housingTypes.includes(wanted)) return true;
    return facts.housingTypes.includes('mixed') ? undefined : false;
  }
  if(facts.occupancy==='any') return true;
  return typeof facts.occupancy==='string' ? facts.occupancy===wanted : undefined;
}
/** Filtering is a lookup, not a synthetic client's score. Actual client pairs use evaluateMatch only. */
export async function runQuickMatching(filters: QuickMatchingFilters, candidates: readonly MatchingPropertyCandidate[], requirements: readonly SeekerRequirement[], people: readonly Person[], isCurrent: () => boolean = () => true): Promise<QuickPropertyMatch[]> {
  if(!validQuickMatchingFilters(filters)) throw new Error('INVALID_QUICK_FILTERS');
  const peopleById=new Map(people.filter(p=>p.classifications.includes('seeker')).map(p=>[p.id,p]));
  const requests=validMatchingRequirements(requirements).filter(r=>r.seekerId && peopleById.has(r.seekerId));
  const seen=new Set<string>();
  const output: QuickPropertyMatch[]=[];
  let evaluatedCount=0;
  nextCandidate: for (const candidate of candidates) {
    if(!isCurrent()) throw new Error('QUICK_RUN_CANCELLED');
    const property=candidate.property, offer=property.activeOffer;
    if(seen.has(property.core.id)) continue nextCandidate; seen.add(property.core.id);
    if(offer.transaction!==(filters.purpose==='rent'?'rent':'sale')) continue nextCandidate;
    if(offer.transaction==='rent' && offer.rentalPeriodId!=='monthly') continue nextCandidate;
    const price=offer.transaction==='rent'?offer.rentalPrice:offer.salePrice;
    if(price.currencyCode!=='KWD' || !Number.isFinite(price.amount) || price.amount<=0) continue nextCandidate;
    const facts=matchingPropertyFacts(property);
    const sector=getBuiltPropertySector(property.core.propertyType,facts.floorUse ?? facts.propertyUse);
    if(filters.sector!=='all' && sector!==filters.sector) continue nextCandidate;
    if(filters.propertyType && property.core.propertyType!==filters.propertyType) continue nextCandidate;
    if(filters.apartmentSubtype && facts.apartmentSubtype!==filters.apartmentSubtype) continue nextCandidate;
    if(filters.minimumBudget!==undefined && price.amount<filters.minimumBudget || filters.maximumBudget!==undefined && price.amount>filters.maximumBudget) continue nextCandidate;
    for(const [wanted,field] of [[filters.bedroomsMinimum,'bedroomCount'],[filters.bathroomsMinimum,'bathroomCount']] as const) {
      if(wanted!==undefined && (typeof facts[field]!=='number' || Number(facts[field])<wanted)) continue nextCandidate;
    }
    if(filters.occupancy && quickHousingFact(facts,filters.occupancy)!==true) continue nextCandidate;
    const confirmations:string[]=[];
    for(const feature of filters.features) { const fact=quickFeatureFact(facts,feature); if(fact===false) continue nextCandidate; if(fact===undefined) confirmations.push(feature); }
    const evaluated: {requirement: SeekerRequirement; result: MatchResult}[]=[];
    for(const requirement of requests) {
      if(++evaluatedCount % 32 === 0) { await new Promise<void>(resolve=>setTimeout(resolve,0)); if(!isCurrent()) throw new Error('QUICK_RUN_CANCELLED'); }
      evaluated.push({requirement,result:evaluateMatch(requirement,candidate)});
    }
    const ranked=evaluated.sort((a,b)=>Number(b.result.qualifies)-Number(a.result.qualifies) || b.result.score-a.result.score || a.result.differenceCount-b.result.differenceCount || a.requirement.id.localeCompare(b.requirement.id));
    const clients:QuickClientMatch[]=[],pendingClients:QuickClientMatch[]=[];
    for(const {requirement,result} of ranked){
      if(!result.eligible || (!result.qualifies && result.category!=='needs_confirmation')) continue;
      const pair={person:peopleById.get(requirement.seekerId!)!,requirement,result};
      (result.qualifies?clients:pendingClients).push(pair);
    }
    output.push({candidate,confirmations,clients,pendingClients});
  }
  // Ready client pairs first; retain every property, including those without clients.
  return output.sort((a,b)=>Number(!!b.clients.length)-Number(!!a.clients.length)
    || (b.clients[0]?.result.score ?? b.pendingClients[0]?.result.score ?? -1) - (a.clients[0]?.result.score ?? a.pendingClients[0]?.result.score ?? -1));
}
