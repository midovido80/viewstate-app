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

const isDisallowedSelectorLocation = (area: Area): boolean =>
  /doha|qatar/i.test(`${area.id} ${area.en} ${area.ar}`);

export const getSelectableKuwaitAreas = (): Area[] =>
  KUWAIT_AREAS.filter(area => !isDisallowedSelectorLocation(area));

export interface AreaPresentationValidation {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export function validateKuwaitAreaPresentation(
  areas: readonly Area[] = getSelectableKuwaitAreas(),
): AreaPresentationValidation {
  const issues: string[] = [];
  if (KUWAIT_GOVERNORATES.length !== 6) issues.push('governorate_count');
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const area of areas) {
    if (ids.has(area.id)) issues.push(`duplicate_id:${area.id}`);
    ids.add(area.id);
    for (const name of [area.en, area.ar]) {
      const normalized = normalizeAreaSearchText(name);
      if (names.has(normalized)) issues.push(`duplicate_name:${name}`);
      names.add(normalized);
    }
    if (isDisallowedSelectorLocation(area)) issues.push(`disallowed_location:${area.id}`);
    if (!KUWAIT_GOVERNATES_IDS.has(area.governorateId)) issues.push(`unknown_governorate:${area.id}`);
  }
  if (ids.size !== areas.length) issues.push('area_not_unique');
  return { ok: issues.length === 0, issues };
}

const KUWAIT_GOVERNATES_IDS = new Set(KUWAIT_GOVERNORATES.map(governorate => governorate.id));

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

export const getGovernorateById = (
  id: string,
  governorates: readonly Governorate[] = KUWAIT_GOVERNORATES,
): Governorate | undefined => governorates.find(governorate => governorate.id === id);

export const sortAreasForLanguage = (
  areas: readonly Area[],
  language: 'ar' | 'en',
): Area[] => [...areas].sort((a, b) =>
  (language === 'ar' ? a.ar : a.en).localeCompare(language === 'ar' ? b.ar : b.en, language === 'ar' ? 'ar' : 'en'),
);

export const getAreasByGovernorate = (
  governorateId: string,
  language: 'ar' | 'en',
  areas: readonly Area[] = getSelectableKuwaitAreas(),
): Area[] => sortAreasForLanguage(areas.filter(area => area.governorateId === governorateId), language);

export const searchAreas = (
  query: string,
  areas: readonly Area[] = getSelectableKuwaitAreas(),
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

export const searchAreasSorted = (
  query: string,
  language: 'ar' | 'en',
  areas: readonly Area[] = getSelectableKuwaitAreas(),
): Area[] => sortAreasForLanguage(searchAreas(query, areas), language);

export const KUWAIT_AREA_DATASET_STATUS = {
  source: 'viewstate-kuwait-areas-v1.0.0-approved.json',
  version: approvedDataset.metadata.version,
  governorateCount: KUWAIT_GOVERNORATES.length,
  areaCount: KUWAIT_AREAS.length,
  aliasCount: KUWAIT_AREA_ALIASES.length,
  searchGroupCount: KUWAIT_SEARCH_GROUPS.length,
  isComplete: true,
} as const;