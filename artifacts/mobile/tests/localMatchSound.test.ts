import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalMatchSound, type LocalCueStatus } from '../services/localMatchSound';
function fixture(failure = '') {
  let foreground = true, callback: (s: LocalCueStatus) => void = () => {}, timer = () => {};
  const counts = { created: 0, released: 0, unsubscribed: 0, cancelled: 0, played: 0 };
  const controller = createLocalMatchSound({ isForeground: () => foreground,
    schedule: cb => { timer = cb; return () => { counts.cancelled++; }; },
    load: async () => { if (failure === 'load') throw Error(); return {
      configure: async () => { if (failure === 'configure') throw Error(); },
      create: () => { if (failure === 'create') throw Error(); counts.created++; return {
        volume: 0, loop: false,
        addListener: (_event: string, cb: (s: LocalCueStatus) => void) => { callback = cb; if (failure === 'listener') throw Error(); if (failure === 'sync') cb({ didJustFinish: true }); return { remove: () => { counts.unsubscribed++; if (failure === 'cleanup') throw Error(); } }; },
        play: () => { counts.played++; if (failure === 'play') throw Error(); callback({ playing: true }); },
        pause: () => { if (failure === 'cleanup') throw Error(); },
        remove: () => { counts.released++; if (failure === 'cleanup') throw Error(); },
      }; },
    }; },
  });
  return { controller, counts, emit: (s: LocalCueStatus) => callback(s), timeout: () => timer(), background: () => { foreground = false; controller.stop(); } };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
test('audio stays lazy; disabled and background calls allocate nothing', async () => {
  const f = fixture(); assert.equal(f.counts.created, 0); assert.equal(await f.controller.play(false), 'skipped');
  f.background(); assert.equal(await f.controller.play(), 'skipped'); assert.equal(f.counts.created, 0);
});
test('concurrent cues collapse and completed playback releases all owned resources', async () => {
  const f = fixture(), first = f.controller.play(); assert.equal(await f.controller.play(), 'skipped');
  assert.equal(await first, 'played'); f.emit({ didJustFinish: true });
  assert.deepEqual(f.counts, { created: 1, released: 1, unsubscribed: 1, cancelled: 1, played: 1 });
});
for (const failure of ['load', 'configure', 'create', 'listener', 'play']) test(`audio ${failure} failure does not reject or retain a player`, async () => {
  const f = fixture(failure); assert.equal(await f.controller.play(), 'unavailable'); assert.equal(f.counts.created, f.counts.released);
});
test('cleanup exceptions do not prevent remaining cleanup', async () => {
  const f = fixture('cleanup'); await f.controller.play(); assert.doesNotThrow(() => f.controller.stop()); assert.equal(f.counts.released, 1); assert.equal(f.counts.cancelled, 1);
});
test('backgrounding stops playback and late events are ignored', async () => {
  const f = fixture(); await f.controller.play(); f.background(); f.emit({ playing: true }); assert.equal(f.counts.released, 1);
});
test('watchdog releases a stalled player', async () => {
  const f = fixture(); await f.controller.play(); f.timeout(); assert.equal(f.counts.released, 1); assert.equal(f.counts.unsubscribed, 1);
});
test('synchronous completion while attaching listener releases both resources', async () => {
  const f = fixture('sync'); assert.equal(await f.controller.play(), 'played'); assert.equal(f.counts.released, 1); assert.equal(f.counts.unsubscribed, 1); assert.equal(f.counts.played, 0);
});
test('stopping or timing out during a hung module load prevents late creation', async () => {
  for (const stop of [true, false]) {
    let release!: (backend: any) => void, timeout = () => {}, created = 0;
    const c = createLocalMatchSound({ isForeground: () => true, schedule: cb => { timeout = cb; return () => {}; }, load: () => new Promise(resolve => { release = resolve; }) });
    const p = c.play(); if (stop) c.stop(); else timeout(); assert.equal(await p, stop ? 'skipped' : 'unavailable');
    release({ configure: async () => {}, create: () => { created++; } }); await flush(); assert.equal(created, 0);
  }
});
test('malformed native event is contained', async () => {
  const f = fixture(); await f.controller.play(); assert.doesNotThrow(() => f.emit({ playbackState: 3 } as any)); assert.equal(f.counts.released, 1);
});
test('1000 sequential cues release every player and listener', async () => {
  const f = fixture(); for (let i = 0; i < 1000; i++) { assert.equal(await f.controller.play(), 'played'); f.emit({ didJustFinish: true }); }
  assert.equal(f.counts.released, 1000); assert.equal(f.counts.unsubscribed, 1000); assert.equal(f.counts.cancelled, 1000);
});
test('cancellation during native configuration prevents player creation', async () => {
  let ready!: () => void, created = 0;
  const c = createLocalMatchSound({ isForeground: () => true, load: async () => ({ configure: () => new Promise<void>(resolve => { ready = resolve; }), create: () => { created++; throw Error(); } }) });
  const p = c.play(); await flush(); c.stop(); ready(); await flush(); assert.equal(await p, 'skipped'); assert.equal(created, 0);
});
