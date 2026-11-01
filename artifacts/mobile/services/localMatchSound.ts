/** Optional, bounded audio effect: no React state, polling, network, recording or matching writes. */
export type LocalCueResult = 'played' | 'skipped' | 'unavailable';
export interface LocalCueStatus { playing?: boolean; didJustFinish?: boolean; playbackState?: string }
export interface LocalCuePlayer {
  volume: number; loop: boolean; readonly currentStatus?: LocalCueStatus;
  play(): void; pause(): void; remove(): void;
  addListener(event: 'playbackStatusUpdate', callback: (status: LocalCueStatus) => void): { remove(): void };
}
export interface LocalCueBackend { configure(): Promise<void>; create(): LocalCuePlayer }
interface Session {
  finished: boolean; settled: boolean; resolve(result: LocalCueResult): void;
  player?: LocalCuePlayer; subscription?: { remove(): void }; cancelTimer?: () => void;
}
export function createLocalMatchSound(options: {
  load(): Promise<LocalCueBackend>; isForeground(): boolean;
  schedule?: (callback: () => void, milliseconds: number) => () => void;
}) {
  let active: Session | null = null;
  const schedule = options.schedule ?? ((callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); });
  const safely = (run: () => void) => { try { run(); } catch { /* Audio cleanup must never break the caller. */ } };
  const settle = (s: Session, result: LocalCueResult) => { if (!s.settled) { s.settled = true; s.resolve(result); } };
  function close(s: Session, result: LocalCueResult) {
    if (s.finished) return;
    s.finished = true;
    if (active === s) active = null;
    safely(() => s.cancelTimer?.());
    safely(() => s.subscription?.remove());
    safely(() => s.player?.pause());
    safely(() => s.player?.remove());
    settle(s, result);
  }
  const current = (s: Session) => active === s && !s.finished && options.isForeground();
  return {
    available: async (): Promise<boolean> => { try { await options.load(); return true; } catch { return false; } },
    stop: () => { if (active) close(active, 'skipped'); },
    play: (enabled = true): Promise<LocalCueResult> => {
      if (!enabled || !options.isForeground() || active) return Promise.resolve('skipped');
      let resolve!: (result: LocalCueResult) => void;
      const result = new Promise<LocalCueResult>(done => { resolve = done; });
      const s: Session = { finished: false, settled: false, resolve }; active = s;
      // Bounds initialization as well as playback; a hung backend cannot retain a player indefinitely.
      s.cancelTimer = schedule(() => close(s, 'unavailable'), 2500);
      void (async () => {
        const backend = await options.load();
        if (!current(s)) { close(s, 'skipped'); return; }
        await backend.configure();
        if (!current(s)) { close(s, 'skipped'); return; }
        const player = backend.create(); s.player = player;
        player.loop = false; player.volume = 0.6;
        const subscription = player.addListener('playbackStatusUpdate', status => {
          try {
            if (s.finished) return;
            if (!options.isForeground()) { close(s, 'skipped'); return; }
            if (status.playbackState?.toLowerCase() === 'error') { close(s, 'unavailable'); return; }
            if (status.didJustFinish) { close(s, 'played'); return; }
            if (status.playing) settle(s, 'played');
          } catch { close(s, 'unavailable'); }
        });
        // Some backends emit a synchronous status while the listener is being registered.
        if (s.finished) { safely(() => subscription.remove()); return; }
        s.subscription = subscription;
        player.play();
        if (!s.finished && player.currentStatus?.playing) settle(s, 'played');
      })().catch(() => close(s, 'unavailable'));
      return result;
    },
  };
}
