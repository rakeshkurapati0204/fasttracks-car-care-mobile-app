import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCachedProfile, serializeProfile } from './profile-cache.ts';

const user = { id: 'u1', username: 'asha', name: 'Asha K', role: 'SALES', employeeId: 'FT026', designation: 'Sales', monthlySalary: 25000, salaryType: 'MONTHLY', joiningDate: '2025-01-01', mustChangePassword: false };

test('keeps only what is needed to pick a screen, never salary details', () => {
  const raw = serializeProfile(user)!;
  assert.ok(!raw.includes('25000') && !raw.includes('MONTHLY') && !raw.includes('2025-01-01'));
  assert.deepEqual(parseCachedProfile(raw), { id: 'u1', username: 'asha', name: 'Asha K', role: 'SALES', employeeId: 'FT026', designation: 'Sales', mustChangePassword: false });
});

test('a forced password change survives a restart', () => {
  assert.equal(parseCachedProfile(serializeProfile({ ...user, mustChangePassword: true }))!.mustChangePassword, true);
});

test('nothing, garbage or an incomplete profile gives no user', () => {
  for (const raw of [null, undefined, '', 'not json', '[]', '{}', '{"id":"u1"}', '{"id":"u1","username":"a","name":"A"}', '{"id":1,"username":"a","name":"A","role":"SALES"}']) {
    assert.equal(parseCachedProfile(raw as string | null), null, String(raw));
  }
});
