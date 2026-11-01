import { useMemo } from 'react';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import type { Person } from '@/services/people';
import { matchingCatalogKey, useMatchNotifications } from '@/contexts/MatchNotificationsContext';
/** Home and foreground alerts consume one snapshot from the existing matching engine. */
export function useAssistantHomeMatches(ready: boolean, catalog: { people: Person[]; properties: Property[]; requirements: SeekerRequirement[] }) {
  const notifications = useMatchNotifications();
  const key = useMemo(() => matchingCatalogKey(catalog), [catalog]);
  const current = ready && key === notifications.sourceKey;
  return { status: notifications.status === 'error' ? 'error' as const : current ? notifications.status : 'loading' as const, items: current && notifications.status === 'ready' ? notifications.matches.slice(0, 5) : [], retry: () => { void notifications.refresh().catch(() => undefined); } };
}
