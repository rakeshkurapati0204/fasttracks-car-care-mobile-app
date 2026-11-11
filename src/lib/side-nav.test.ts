import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sideNavAction, stackAnimation } from './side-nav.ts';

test('tapping the screen you are on does nothing, with or without a trailing slash', () => {
  assert.equal(sideNavAction('/more/calls', '/more/calls', true), 'none');
  assert.equal(sideNavAction('/more/calls/', '/more/calls', false), 'none');
  assert.equal(sideNavAction('/', '/', true), 'none');
});

test('docked sidebar replaces the screen, the phone menu pushes it', () => {
  assert.equal(sideNavAction('/more/calls', '/customers', true), 'replace');
  assert.equal(sideNavAction('/more/calls', '/customers', false), 'push');
});

test('a detail screen inside a section still navigates when its section is tapped', () => {
  assert.equal(sideNavAction('/customers/123', '/customers', true), 'replace');
  assert.equal(sideNavAction('/customers/123', '/customers', false), 'push');
});

test('no slide transition beside a docked sidebar, default everywhere else', () => {
  assert.equal(stackAnimation(true), 'none');
  assert.equal(stackAnimation(false), undefined);
});
