import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countAt, formatCount, parseCount } from './count-up.ts';

test('splits rupees, percent and plain numbers', () => {
  assert.deepEqual(parseCount('₹1,23,456'), { prefix: '₹', n: 123456, decimals: 0, grouped: true, suffix: '' });
  assert.deepEqual(parseCount('87%'), { prefix: '', n: 87, decimals: 0, grouped: false, suffix: '%' });
  assert.equal(parseCount('12.5')?.decimals, 1);
});

test('leaves values it cannot read safely alone', () => {
  assert.equal(parseCount('10:30 AM'), null);
  assert.equal(parseCount('3 / 5'), null);
  assert.equal(parseCount('—'), null);
});

test('formats with Indian grouping and keeps prefix/suffix', () => {
  const p = parseCount('₹1,23,456')!;
  assert.equal(formatCount(p, 123456), '₹1,23,456');
  assert.equal(formatCount(p, 0), '₹0');
  assert.equal(formatCount(parseCount('87%')!, 43), '43%');
});

test('easing starts at the start value and ends exactly on the target', () => {
  assert.equal(countAt(0, 100, 0), 0);
  assert.equal(countAt(0, 100, 1), 100);
  assert.ok(countAt(0, 100, 0.5) > 50);
});
