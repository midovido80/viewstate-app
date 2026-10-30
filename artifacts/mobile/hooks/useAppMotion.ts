import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
export function useAppMotion(): boolean {
  const { state } = useAccountFoundation();
  const [systemReduced, setSystemReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setSystemReduced(value); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    return () => { active = false; sub.remove(); };
  }, []);
  return !state.reducedMotion && !systemReduced;
}
