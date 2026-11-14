import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detailAnimation, sideNavAction, topLevelAnimation } from './side-nav.ts';

test('tapping the screen you are on does nothing, with or without a trailing slash', () => {
  assert.equal(sideNavAction('/more/calls', '/more/calls'), 'none');
  assert.equal(sideNavAction('/more/calls/', '/more/calls'), 'none');
  assert.equal(sideNavAction('/', '/'), 'none');
});

test('every menu entry replaces the screen, so the stack never grows and no old screen is left beside the new one', () => {
  assert.equal(sideNavAction('/more/calls', '/customers'), 'replace');
  assert.equal(sideNavAction('/more/overview', '/more/calls'), 'replace');
});

test('a detail screen inside a section still navigates when its section is tapped', () => {
  assert.equal(sideNavAction('/customers/123', '/customers'), 'replace');
});

test('top-level screens swap with a fade; detail screens keep the platform slide', () => {
  assert.equal(topLevelAnimation, 'fade');
  assert.equal(detailAnimation, undefined);
});
