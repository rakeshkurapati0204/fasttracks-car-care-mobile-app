import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPoller, nextDelay } from './polling.ts';

// A manual clock: timers fire only when the test says so.
function fakeTimers() {
  const queue: { fn: () => void; ms: number; id: number }[] = [];
  let next = 1;
  return {
    timers: { set: (fn: () => void, ms: number) => { const id = next++; queue.push({ fn, ms, id }); return id; }, clear: (h: unknown) => { const i = queue.findIndex((q) => q.id === h); if (i >= 0) queue.splice(i, 1); } },
    pending: () => queue.length,
    delays: () => queue.map((q) => q.ms),
    fire: async () => { const q = queue.shift(); q?.fn(); await new Promise((r) => setImmediate(r)); },
  };
}

test('the next run is scheduled only after the previous one has finished (no overlap)', async () => {
  const clock = fakeTimers();
  let release!: () => void;
  let started = 0;
  const poller = createPoller(() => { started += 1; return new Promise<void>((r) => { release = r; }); }, 5000, { timers: clock.timers });
  poller.start();
  await clock.fire(); // run 1 starts and hangs on a slow network
  assert.equal(started, 1);
  assert.equal(clock.pending(), 0); // nothing else is queued while run 1 is still going
  release();
  await new Promise((r) => setImmediate(r));
  assert.equal(clock.pending(), 1); // only now is run 2 scheduled
});

test('after failures the wait doubles up to a ceiling and a success brings it back', async () => {
  const clock = fakeTimers();
  let fail = true;
  const poller = createPoller(() => { if (fail) throw new Error('down'); }, 1000, { maxMs: 4000, timers: clock.timers });
  poller.start();
  const seen: number[] = [];
  for (let i = 0; i < 4; i++) { await clock.fire(); seen.push(clock.delays()[0]); }
  assert.deepEqual(seen, [2000, 4000, 4000, 4000]);
  fail = false;
  await clock.fire();
  assert.deepEqual(clock.delays(), [1000]);
});

test('stop cancels the pending run; start(immediate) runs at once; start is idempotent', async () => {
  const clock = fakeTimers();
  let runs = 0;
  const poller = createPoller(() => { runs += 1; }, 1000, { timers: clock.timers });
  poller.start(true);
  await new Promise((r) => setImmediate(r));
  assert.equal(runs, 1);
  poller.start(); // already running: ignored
  assert.equal(clock.pending(), 1);
  poller.stop();
  assert.equal(clock.pending(), 0);
  assert.equal(poller.running, false);
});

test('nextDelay is bounded', () => {
  assert.equal(nextDelay(5000, 0, 60_000), 5000);
  assert.equal(nextDelay(5000, 2, 60_000), 20_000);
  assert.equal(nextDelay(5000, 50, 60_000), 60_000);
});
