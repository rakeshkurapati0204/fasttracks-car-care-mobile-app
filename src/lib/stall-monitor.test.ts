import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStallMonitor } from './stall-monitor.ts';

function clock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('on-time ticks record nothing, a late tick records how late and where', () => {
  const c = clock();
  const m = createStallMonitor({ now: c.now, intervalMs: 250, thresholdMs: 600 });
  m.start();
  m.setWhere('/more/calls');
  c.advance(250); m.tick();
  c.advance(260); m.tick(); // a little late: fine
  assert.equal(m.list().length, 0);
  c.advance(250 + 1800); m.tick(); // blocked for 1.8 s
  assert.deepEqual(m.list().map((s) => [s.ms, s.where]), [[1800, '/more/calls']]);
  m.stop();
});

test('coming back from the background is not a stall', () => {
  const c = clock();
  const m = createStallMonitor({ now: c.now });
  m.start();
  c.advance(250); m.tick();
  c.advance(60_000); // the app was in the background, timers paused
  m.resume();
  c.advance(250); m.tick();
  assert.equal(m.list().length, 0);
  m.stop();
});

test('keeps only the newest entries and formats newest first', () => {
  const c = clock();
  const m = createStallMonitor({ now: c.now, max: 3 });
  m.start();
  for (const [ms, where] of [[700, 'a'], [900, 'b'], [1200, 'c'], [2500, 'd']] as const) { m.setWhere(where); c.advance(250 + ms); m.tick(); }
  assert.deepEqual(m.list().map((s) => s.where), ['b', 'c', 'd']);
  const text = m.format();
  assert.match(text, /^3 slow moments, worst 2\.5 s/);
  assert.ok(text.indexOf(' d') < text.indexOf(' b'), 'newest first');
  m.clear();
  assert.equal(m.format(), 'No slow moments since the app opened.');
  m.stop();
});
