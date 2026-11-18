import assert from 'node:assert/strict';
import test from 'node:test';

import { CRM_COLUMNS, CRM_NAME_MIN_WIDTH, CRM_TABLE_MIN_WIDTH } from './customers-format.ts';

// Regression: on a half-open foldable (about 700 wide) the table was drawn with all the fixed columns, the customer name got about 15px and every name and the
// CUSTOMER header were written one letter per line. The table is only drawn when the name column keeps at least CRM_NAME_MIN_WIDTH.

test('the table needs room for every fixed column, the row padding and gaps, the buttons, and a readable name', () => {
  const columns = Object.values(CRM_COLUMNS).reduce((a, b) => a + b, 0);
  assert.equal(columns, 580);
  const leftForName = CRM_TABLE_MIN_WIDTH - (columns + 32 + 84 + 46);
  assert.equal(leftForName, CRM_NAME_MIN_WIDTH);
  assert.ok(CRM_NAME_MIN_WIDTH >= 200);
});

test('a width where the old 640 breakpoint drew the table but the name would get under 50px is now the compact row', () => {
  const nameRoom = (width: number) => width - (580 + 32 + 84 + 46);
  for (const width of [640, 700, 760, 800]) {
    assert.ok(nameRoom(width) < CRM_NAME_MIN_WIDTH, `${width} leaves ${nameRoom(width)}px for the name`);
    assert.ok(width < CRM_TABLE_MIN_WIDTH, `${width} must not draw the table`);
  }
  assert.ok(CRM_TABLE_MIN_WIDTH <= 1100, 'the table still appears on a tablet before the 3-column job card grid');
});
