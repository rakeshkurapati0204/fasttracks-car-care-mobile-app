import assert from 'node:assert/strict';
import { test } from 'node:test';

import { REASK_AFTER_MS, shouldAskForRole } from './setup.ts';

const base = { autoOn: true, isPhoneApp: false, lastAskedAt: null as number | null, now: 1_000_000_000 };

test('a new phone (never asked, not the phone app) is asked straight away', () => {
  assert.equal(shouldAskForRole(base), true);
});

test('nothing to ask when auto-answer is off or Fasttracks is already the phone app', () => {
  assert.equal(shouldAskForRole({ ...base, autoOn: false }), false);
  assert.equal(shouldAskForRole({ ...base, isPhoneApp: true }), false);
});

test('a "no" is not asked again for a day, then it is', () => {
  assert.equal(shouldAskForRole({ ...base, lastAskedAt: base.now - 60_000 }), false);
  assert.equal(shouldAskForRole({ ...base, lastAskedAt: base.now - REASK_AFTER_MS }), true);
});

test('a clock that went backwards does not silence the question', () => {
  assert.equal(shouldAskForRole({ ...base, lastAskedAt: base.now + 5_000 }), true);
});
