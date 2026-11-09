import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dialBlockedReason, dialErrorText, newDialKey, toE164India } from './dial.ts';

test('only a complete Indian mobile becomes E.164', () => {
  assert.equal(toE164India('9459451086'), '+919459451086');
  for (const bad of ['', '945945108', '5459451086', '94594510860', '94594x1086']) assert.equal(toE164India(bad), null);
});

test('idempotency key matches the backend pattern and differs per attempt', () => {
  const a = newDialKey(1_700_000_000_000, () => 0.1);
  assert.match(a, /^[A-Za-z0-9_-]{8,64}$/);
  assert.notEqual(newDialKey(1, () => 0.1), newDialKey(2, () => 0.1));
  assert.match(newDialKey(), /^[A-Za-z0-9_-]{8,64}$/);
});

test('capabilities decide whether the pad may call, with a specific reason', () => {
  assert.equal(dialBlockedReason({ callingEnabled: true, dialPadEnabled: true, canDial: true }), null);
  assert.match(dialBlockedReason(null) ?? '', /Can't reach the server/);
  assert.match(dialBlockedReason({ callingEnabled: false, dialPadEnabled: false, canDial: false }) ?? '', /isn't available/);
  assert.match(dialBlockedReason({ callingEnabled: true, dialPadEnabled: false, canDial: false }) ?? '', /switched off/);
  assert.match(dialBlockedReason({ callingEnabled: true }) ?? '', /switched off/); // an older backend without the flag
  assert.match(dialBlockedReason({ callingEnabled: true, dialPadEnabled: true, canDial: false }) ?? '', /not allowed/);
});

test('server message is shown as is; a network failure keeps the key for the retry', () => {
  assert.deepEqual(dialErrorText({ response: { status: 422, data: { error: 'SELF_NUMBER', message: 'That is your own phone number.' } } }), { text: 'That is your own phone number.', keepKey: false });
  assert.deepEqual(dialErrorText({ response: { status: 500, data: {} } }), { text: 'The call could not be placed.', keepKey: false });
  const net = dialErrorText({});
  assert.equal(net.keepKey, true);
  assert.match(net.text, /no second call/);
});
