import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { AssistantError } from './dailyAssistant';
import { createAssistantRepository, type AssistantExclusive } from './dailyAssistantRepository';
interface BrowserLocks { request<T>(name: string, options: { mode: 'exclusive' }, run: () => Promise<T>): Promise<T> }
/** No secret, cloud account, permission request or business-store write is involved. */
const exclusive: AssistantExclusive = async run => {
  if (Platform.OS !== 'web') return run();
  const locks = typeof navigator !== 'undefined' ? (navigator as unknown as { locks?: BrowserLocks }).locks : undefined;
  if (!locks) throw new AssistantError('unavailable');
  return locks.request('viewstate-daily-assistant-v1', { mode: 'exclusive' }, run);
};
export const assistantRepository = createAssistantRepository(AsyncStorage, exclusive);
