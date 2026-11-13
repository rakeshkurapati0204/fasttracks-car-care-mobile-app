import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createLatest } from './latest.ts';

test('only the newest request counts, whatever order the answers arrive in', () => {
  const latest = createLatest();
  const first = latest.next(); // "ab" typed
  const second = latest.next(); // "abc" typed before the first answer came back
  assert.equal(latest.isCurrent(first), false); // the slow answer for "ab" is ignored
  assert.equal(latest.isCurrent(second), true);
});

test('each screen has its own tickets', () => {
  const a = createLatest();
  const b = createLatest();
  const t = a.next();
  b.next();
  b.next();
  assert.equal(a.isCurrent(t), true);
});

test('a next-page request is void only when a replacing request started after it', () => {
  const latest = createLatest();
  const list = latest.next(); // the list for "abc"
  const page2 = latest.current(); // page 2 of the same list
  const page3 = latest.current(); // page 3 asked while page 2 is still loading
  assert.equal(latest.isCurrent(page2), true);
  assert.equal(latest.isCurrent(page3), true); // pages do not cancel each other
  latest.next(); // the search changed: a new list replaces everything
  assert.equal(latest.isCurrent(list), false);
  assert.equal(latest.isCurrent(page2), false);
});
