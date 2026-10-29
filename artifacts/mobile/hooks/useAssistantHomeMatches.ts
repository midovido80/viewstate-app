import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Property, SeekerRequirement } from '@workspace/property-domain';
import type { Person } from '@/services/people';
import { MyPropertiesMatchingSource } from '@/services/myPropertiesMatchingSource';
import { BrokerInitiatedMatching, type BrokerMatchingRunResult } from '@/services/brokerInitiatedMatching';
import { validMatchingRequirements } from '@/services/matchingUi';
import { selectHomeMatches, type HomeMatch } from '@/services/assistantHome';
export function useAssistantHomeMatches(ready: boolean, catalog: { people: Person[]; properties: Property[]; requirements: SeekerRequirement[] }) {
  const [state, setState] = useState<{ source: typeof catalog | null; status: 'loading' | 'ready' | 'error'; items: HomeMatch[] }>({ source: null, status: 'loading', items: [] });
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!ready) return;
    setState({ source: catalog, status: 'loading', items: [] });
    const run = async () => {
      const requirements = validMatchingRequirements(catalog.requirements).filter(r => catalog.people.some(p => p.id === r.seekerId));
      const byId = new Map(requirements.map(r => [r.id, r]));
      const source = new MyPropertiesMatchingSource({ getProperties: async () => catalog.properties });
      const engine = new BrokerInitiatedMatching({ getRequirement: async id => byId.get(id) ?? null }, source);
      const runs: BrokerMatchingRunResult[] = [];
      for (let i = 0; i < requirements.length; i++) {
        if (!active) return;
        runs.push(await engine.runForRequirement(requirements[i].id));
        // Yield in long local inventories so Home navigation and gestures stay responsive.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (active) setState({ source: catalog, status: 'ready', items: selectHomeMatches(requirements, catalog.people, runs) });
    };
    void run().catch(() => { if (active) setState({ source: catalog, status: 'error', items: [] }); });
    return () => { active = false; };
  }, [ready, catalog, retry]));
  return { status: ready && state.source === catalog ? state.status : 'loading' as const,
    items: ready && state.source === catalog && state.status === 'ready' ? state.items : [], retry: () => setRetry(n => n + 1) };
}
