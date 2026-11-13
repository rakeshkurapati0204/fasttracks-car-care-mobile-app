import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCachedValue } from './cached-value.ts';

test('the slow read happens once, however many callers ask, and later calls are answered from memory', async () => {
  let reads = 0;
  const token = createCachedValue(async () => { reads += 1; await new Promise((r) => setTimeout(r, 5)); return 'abc'; });
  const [a, b, c] = await Promise.all([token.get(), token.get(), token.get()]); // a burst of requests at screen load
  assert.deepEqual([a, b, c], ['abc', 'abc', 'abc']);
  assert.equal(await token.get(), 'abc');
  assert.equal(reads, 1);
});

test('a new value is visible at once, before the slow write finishes', async () => {
  const token = createCachedValue(async () => 'old');
  let written = '';
  const write = token.set('new', async (v) => { await new Promise((r) => setTimeout(r, 20)); written = v; });
  assert.equal(await token.get(), 'new'); // already
  assert.equal(written, ''); // the write is still going
  await write;
  assert.equal(written, 'new');
});

test('clearing is visible at once and a stale read never brings the old value back', async () => {
  let reads = 0;
  const token = createCachedValue<string | null>(async () => { reads += 1; return 'abc'; });
  assert.equal(await token.get(), 'abc');
  await token.clear(async () => {}, null);
  assert.equal(await token.get(), null);
  assert.equal(reads, 1);
});
