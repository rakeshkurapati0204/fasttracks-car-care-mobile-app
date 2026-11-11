import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitWidth, isRail, liveWidth, maxFor, nudgeWidth, parseSavedWidth, settleWidth, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_RAIL, toggledWidth } from './sidebar-width.ts';

test('a drag stays between the rail and the maximum, and ignores garbage', () => {
  assert.equal(liveWidth(10), SIDEBAR_RAIL);
  assert.equal(liveWidth(9999), SIDEBAR_MAX);
  assert.equal(liveWidth(250.6), 251);
  assert.equal(liveWidth(NaN), SIDEBAR_DEFAULT);
  assert.equal(liveWidth(Infinity), SIDEBAR_DEFAULT);
});

test('letting go snaps to the rail or to a readable width, never in between', () => {
  assert.equal(settleWidth(80), SIDEBAR_RAIL);
  assert.equal(settleWidth(149), SIDEBAR_RAIL);
  assert.equal(settleWidth(150), SIDEBAR_MIN); // just opened: the narrowest readable width
  assert.equal(settleWidth(170), SIDEBAR_MIN);
  assert.equal(settleWidth(240), 240);
  assert.equal(settleWidth(500), SIDEBAR_MAX);
  assert.equal(isRail(SIDEBAR_RAIL), true);
  assert.equal(isRail(SIDEBAR_DEFAULT), false);
});

test('keyboard and screen-reader steps', () => {
  assert.equal(nudgeWidth(SIDEBAR_DEFAULT, 1), SIDEBAR_DEFAULT + 24);
  assert.equal(nudgeWidth(SIDEBAR_MAX, 1), SIDEBAR_MAX);
  assert.equal(nudgeWidth(SIDEBAR_DEFAULT, -1), SIDEBAR_DEFAULT - 24);
  assert.equal(nudgeWidth(SIDEBAR_DEFAULT - 24, -1), SIDEBAR_RAIL); // would be narrower than readable: folds
  assert.equal(nudgeWidth(SIDEBAR_MIN, -1), SIDEBAR_RAIL);
  assert.equal(nudgeWidth(SIDEBAR_RAIL, 1), SIDEBAR_MIN);
  assert.equal(nudgeWidth(SIDEBAR_RAIL, -1), SIDEBAR_RAIL);
});

test('saved width: missing, damaged or out of range values fall back safely', () => {
  assert.equal(parseSavedWidth(null), SIDEBAR_DEFAULT);
  assert.equal(parseSavedWidth(undefined), SIDEBAR_DEFAULT);
  assert.equal(parseSavedWidth('abc'), SIDEBAR_DEFAULT);
  assert.equal(parseSavedWidth('72'), SIDEBAR_RAIL);
  assert.equal(parseSavedWidth('260'), 260);
  assert.equal(parseSavedWidth('9000'), SIDEBAR_MAX);
  assert.equal(parseSavedWidth('160'), SIDEBAR_MIN);
});

test('the sidebar never takes more than 40% of the window', () => {
  assert.equal(maxFor(1600), SIDEBAR_MAX);
  assert.equal(maxFor(800), 320);
  assert.equal(maxFor(600), 240);
  assert.equal(maxFor(300), SIDEBAR_MIN); // never below the readable minimum
  assert.equal(liveWidth(500, 240), 240);
  assert.equal(settleWidth(500, 240), 240);
  assert.equal(fitWidth(360, 600), 240); // a wide saved sidebar in a narrow window is squeezed...
  assert.equal(fitWidth(360, 1600), 360); // ...and comes back in a wide one
  assert.equal(fitWidth(SIDEBAR_RAIL, 600), SIDEBAR_RAIL);
  assert.equal(fitWidth(200, 600), 200);
});

test('fold / unfold toggle remembers the width it had', () => {
  assert.equal(toggledWidth(300, 300), SIDEBAR_RAIL);
  assert.equal(toggledWidth(SIDEBAR_RAIL, 300), 300);
  assert.equal(toggledWidth(SIDEBAR_RAIL, SIDEBAR_RAIL), SIDEBAR_DEFAULT); // never had one: open to the default
  assert.equal(toggledWidth(SIDEBAR_RAIL, 9999), SIDEBAR_MAX);
});
