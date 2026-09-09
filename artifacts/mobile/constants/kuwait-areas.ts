import approvedDataset from './data/viewstate-kuwait-areas-v1.0.0-approved.json';

export interface Governorate {
  id: string;
  en: string;
  ar: string;
  displayOrder: number;
}

export interface Area {
  id: string;
  en: string;
  ar: string;
  governorateId: string;
  governorateEn: string;
  governorateAr: string;
  areaType: string;
  displayOrder: number;
}

export interface AreaAlias {
  aliasAr: string;
  aliasEn: string;
  canonicalAreaId: string;
}

export interface AreaSearchGroup {
  id: string;
  nameAr: string;
  nameEn: string;
  areaIds: readonly string[];
}

const governoratesById = new Map(
  approvedDataset.governorates.map(governorate => [
    governorate.id,
    governorate,
  ]),
);

export const KUWAIT_GOVERNORATES: readonly Governorate[] =
  approvedDataset.governorates
    .map(governorate => ({
      id: governorate.id,
      en: governorate.nameEn,
      ar: governorate.nameAr,
      displayOrder: governorate.displayOrder,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);

export const KUWAIT_AREA_ALIASES: readonly AreaAlias[] =
  approvedDataset.aliases.map(alias => ({
    aliasAr: alias.aliasAr,
    aliasEn: alias.aliasEn,
    canonicalAreaId: alias.canonicalAreaId,
  }));

export const KUWAIT_SEARCH_GROUPS: readonly AreaSearchGroup[] =
  approvedDataset.searchGroups.map(group => ({
    id: group.id,
    nameAr: group.nameAr,
    nameEn: group.nameEn,
    areaIds: group.areaIds,
  }));

export const KUWAIT_AREAS: readonly Area[] = approvedDataset.areas
  .filter(area => area.active)
  .map(area => {
    const governorate = governoratesById.get(area.governorateId);
    if (!governorate) {
      throw new Error(`Unknown governorate for approved area: ${area.id}`);
    }
    return {
      id: area.id,
      en: area.nameEn,
      ar: area.nameAr,
      governorateId: area.governorateId,
      governorateEn: governorate.nameEn,
      governorateAr: governorate.nameAr,
      areaType: area.areaType,
      displayOrder: area.displayOrder,
    };
  })
  .sort((a, b) => a.displayOrder - b.displayOrder);

const aliasesByAreaId = new Map<string, string[]>();
for (const alias of KUWAIT_AREA_ALIASES) {
  const values = aliasesByAreaId.get(alias.canonicalAreaId) ?? [];
  values.push(alias.aliasAr, alias.aliasEn);
  aliasesByAreaId.set(alias.canonicalAreaId, values);
}

export const normalizeAreaSearchText = (value: string): string => value
  .normalize('NFKD')
  .toLocaleLowerCase()
  .replace(/[\u0640\u064B-\u065F\u0670]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/[ى]/g, 'ي')
  .replace(/[\s\p{P}\p{S}]+/gu, '');

export const getAreaById = (
  id: string,
  areas: readonly Area[] = KUWAIT_AREAS,
): Area | undefined => {
  return areas.find(area => area.id === id);
};

/**
 * Builds the only taxonomy-derived Maps query used by the mobile app.
 * The area and governorate labels must come from the approved dataset; callers
 * should use saved links or coordinates before falling back to this query.
 */
export const buildKuwaitAreaQuery = (
  area: Area,
  language: 'ar' | 'en',
): string => {
  const areaName = language === 'ar' ? area.ar : area.en;
  const governorateName = language === 'ar' ? area.governorateAr : area.governorateEn;
  return `${areaName}, ${governorateName}, ${language === 'ar' ? 'الكويت' : 'Kuwait'}`;
};

export const searchAreas = (
  query: string,
  areas: readonly Area[] = KUWAIT_AREAS,
): Area[] => {
  const term = normalizeAreaSearchText(query);
  if (!term) return [...areas];

  const groupAreaIds = new Set(
    KUWAIT_SEARCH_GROUPS
      .filter(group => [group.nameAr, group.nameEn]
        .some(name => normalizeAreaSearchText(name).includes(term)))
      .flatMap(group => group.areaIds),
  );

  return areas.filter(area => {
    const searchableValues = [
      area.en,
      area.ar,
      area.governorateEn,
      area.governorateAr,
      ...(aliasesByAreaId.get(area.id) ?? []),
    ];
    return groupAreaIds.has(area.id) || searchableValues
      .some(value => normalizeAreaSearchText(value).includes(term));
  });
};

export const KUWAIT_AREA_DATASET_STATUS = {
  source: 'viewstate-kuwait-areas-v1.0.0-approved.json',
  version: approvedDataset.metadata.version,
  governorateCount: KUWAIT_GOVERNORATES.length,
  areaCount: KUWAIT_AREAS.length,
  aliasCount: KUWAIT_AREA_ALIASES.length,
  searchGroupCount: KUWAIT_SEARCH_GROUPS.length,
  isComplete: true,
} as const;