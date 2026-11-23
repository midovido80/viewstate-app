import type { ImportFacts } from './messageImport';

type ReviewState = {
  facts: ImportFacts;
  sourceRole?: string;
  sourceExists?: boolean;
  seekerEligible?: boolean;
  hasDuplicates?: boolean;
  duplicateDecision?: 'existing' | 'different';
  selectedDuplicate?: boolean;
};
export type ImportStepIssue =
  | 'intent'
  | 'transaction'
  | 'propertyType'
  | 'period'
  | 'studio'
  | 'sourceRole'
  | 'sourcePerson'
  | 'client'
  | 'duplicate';

export function importStepIssues(
  step: number,
  state: ReviewState,
): ImportStepIssue[] {
  const { facts } = state;
  if (step === 0)
    return [
      ...(!facts.intent ? ['intent' as const] : []),
      ...(!facts.transaction ? ['transaction' as const] : []),
      ...(!facts.choice ? ['propertyType' as const] : []),
      ...(facts.transaction === 'rent' && !facts.period
        ? ['period' as const]
        : []),
      ...(facts.choice === 'studio' &&
      facts.details.bathroomCount !== undefined &&
      facts.details.bathroomCount !== '1'
        ? ['studio' as const]
        : []),
    ];
  if (step === 1) {
    if (facts.intent === 'wanted')
      return state.seekerEligible ? [] : ['client'];
    if (!state.sourceRole) return ['sourceRole'];
    return state.sourceRole === 'unknown' || state.sourceExists
      ? []
      : ['sourcePerson'];
  }
  return state.hasDuplicates &&
    (!state.duplicateDecision ||
      (state.duplicateDecision === 'existing' && !state.selectedDuplicate))
    ? ['duplicate']
    : [];
}

export function importDuplicateCaption(
  entry: { text: string; createdAt: string; id?: string },
  language: string,
): string {
  const summary =
    entry.text.trim().replace(/\s+/g, ' ').slice(0, 95) ||
    (language === 'ar' ? 'رسالة بمرفقات' : 'Message with attachments');
  const date = new Date(entry.createdAt);
  const timestamp = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(language === 'ar' ? 'ar-KW' : 'en-GB', {
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  return [summary, timestamp, entry.id ? '#' + entry.id.slice(-6) : '']
    .filter(Boolean)
    .join(' · ');
}
