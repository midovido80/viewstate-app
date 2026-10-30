import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createMatchNoticeRepository } from './matchNotifications';
import { createLocalMatchSound, type LocalCueResult } from './localMatchSound';

const nativeSound = createLocalMatchSound({
  isForeground: () => AppState.currentState === 'active',
  load: async () => {
    // Lazy and guarded: an older installed binary may not contain this optional native module.
    const audio: typeof import('expo-audio') = require('expo-audio');
    if (typeof audio.createAudioPlayer !== 'function' || typeof audio.setAudioModeAsync !== 'function') throw new Error('AUDIO_UNAVAILABLE');
    return {
      configure: () => audio.setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false, allowsBackgroundRecording: false, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false, interruptionMode: 'mixWithOthers' }),
      create: () => audio.createAudioPlayer(require('../assets/sounds/match-cue.wav'), { updateInterval: 500, downloadFirst: false, keepAudioSessionActive: false }),
    };
  },
});
export function stopMatchCue(): void { nativeSound.stop(); }

interface Locks { request<T>(key: string, options: { mode: 'exclusive' }, run: () => Promise<T>): Promise<T> }
export const matchNoticeRepository = createMatchNoticeRepository(AsyncStorage, async run => {
  if (Platform.OS !== 'web') return run();
  const locks = (typeof navigator !== 'undefined' ? navigator : {}) as unknown as { locks?: Locks };
  if (!locks.locks) throw new Error('NOTICE_SECURE_BROWSER_REQUIRED');
  return locks.locks.request('viewstate-match-notices-v1', { mode: 'exclusive' }, run);
});
let context: AudioContext | null = null;
/** Browser audio is enabled only by an explicit user gesture. No autoplay bypass. */
export async function enableMatchSound(): Promise<boolean> {
  if (Platform.OS !== 'web') return nativeSound.available();
  try { context ??= new AudioContext(); await context.resume(); return context.state === 'running'; } catch { return false; }
}
export async function playMatchCue(sound: boolean): Promise<LocalCueResult> {
  if (!sound) return 'skipped';
  if (Platform.OS !== 'web') {
    if (AppState.currentState !== 'active') return 'skipped';
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    return nativeSound.play(true);
  }
  if (context?.state !== 'running') return 'unavailable';
  const at = context.currentTime;
  for (const [offset, frequency] of [[0, 784], [.14, 1046.5]]) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at + offset); gain.gain.linearRampToValueAtTime(.12, at + offset + .015); gain.gain.exponentialRampToValueAtTime(.001, at + offset + .28);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at + offset); oscillator.stop(at + offset + .3);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  return 'played';
}
