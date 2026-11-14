import assert from 'node:assert/strict';
import { test } from 'node:test';

import { slideDistance } from './layout-mode.ts';

test('the card slides a fraction of a narrow window and a fixed width on a wide one', () => {
  assert.equal(Math.round(slideDistance(390)), 257); // phone: about two thirds
  assert.equal(slideDistance(1280), 360); // capped
  assert.equal(slideDistance(5000), 360);
  assert.ok(slideDistance(320) < slideDistance(400)); // grows smoothly with the window, no jumps
});
