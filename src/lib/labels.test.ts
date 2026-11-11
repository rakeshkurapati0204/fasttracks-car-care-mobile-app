import assert from 'node:assert/strict';
import { test } from 'node:test';
import { humanize, roleLabel, titleCase } from './labels.ts';

test('stored codes read like words', () => {
  assert.equal(humanize('PAID'), 'Paid');
  assert.equal(humanize('IN_PROGRESS'), 'In progress');
  assert.equal(humanize('partially-paid'), 'Partially paid');
  assert.equal(humanize('  DRAFT '), 'Draft');
  assert.equal(humanize(''), '');
  assert.equal(humanize(null), '');
  assert.equal(humanize(undefined), '');
});

test('roles: the app names win, anything else is title-cased', () => {
  assert.equal(roleLabel('OWNER'), 'Founder');
  assert.equal(roleLabel('TECH_TEAM'), 'Tech Team');
  assert.equal(roleLabel('STORE_MANAGER'), 'Store Manager');
  assert.equal(roleLabel('painter'), 'Painter'); // free-text designations in the staff list
  assert.equal(roleLabel('Social media'), 'Social Media');
  assert.equal(roleLabel(null), '');
  assert.equal(titleCase('head_of_sales'), 'Head of Sales');
});
