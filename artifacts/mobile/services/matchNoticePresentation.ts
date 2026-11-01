import type { Property } from '@workspace/property-domain';
import type { HomeMatch } from './assistantHome';
import { matchingComparisonRows } from './matchingPresentation';
/** Short evidence uses the same comparison rows as Matching, not another score. */
export function matchNoticeEvidence(match: HomeMatch, property: Property | undefined, language: 'en' | 'ar') {
  const rows = matchingComparisonRows(match.result, match.requirement, property, language);
  const important = ['location', 'budget', 'bedrooms', 'bathrooms', 'builtUpAreaSquareMeters'];
  const ordered = [...rows].sort((a, b) => {
    const index = (id: string) => important.includes(id) ? important.indexOf(id) : important.length;
    return index(a.field) - index(b.field);
  });
  return {
    agrees: ordered.filter(r => r.status === 'matched').slice(0, 2).map(r => `${r.label}: ${r.offered}`),
    differs: ordered.filter(r => r.status === 'not_met' || r.status === 'ineligible').slice(0, 2).map(r => `${r.label}: ${r.offered} ${language === 'ar' ? 'بدل' : 'instead of'} ${r.requested}`),
    unknown: ordered.filter(r => r.status === 'unknown').map(r => r.label),
  };
}
export function viewStateTextCard(text: string, language: 'en' | 'ar'): string {
  return `${language === 'ar' ? 'بطاقة عقار · ViewState' : 'Property card · ViewState'}\n\n${text}`;
}
