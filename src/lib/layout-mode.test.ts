import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canPin, isPinned, parseMenuStyle, slideDistance } from './layout-mode.ts';

test('the slide-out menu is the default at every window size', () => {
  for (const w of [320, 360, 411, 600, 720, 839, 927, 1280, 1920, 3000]) assert.equal(isPinned(w, 'slide'), false, String(w));
});

test('a pinned sidebar needs a window with room for it', () => {
  assert.equal(isPinned(400, 'pinned'), false);
  assert.equal(isPinned(599, 'pinned'), false);
  assert.equal(isPinned(600, 'pinned'), true);
  assert.equal(isPinned(1280, 'pinned'), true);
  assert.equal(canPin(400), false);
  assert.equal(canPin(700), true);
});

test('the card slides a fraction of a narrow window and a fixed width on a wide one', () => {
  assert.equal(Math.round(slideDistance(390)), 257); // phone: about two thirds
  assert.equal(slideDistance(1280), 360); // capped
  assert.equal(slideDistance(5000), 360);
  assert.ok(slideDistance(320) < slideDistance(400)); // grows smoothly with the window, no jumps
});

test('a stored value that is not a style, or an old "auto", is slide-out', () => {
  assert.equal(parseMenuStyle(null), 'slide');
  assert.equal(parseMenuStyle('auto'), 'slide');
  assert.equal(parseMenuStyle('whatever'), 'slide');
  assert.equal(parseMenuStyle('pinned'), 'pinned');
});
