import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePersian, normalizeIranMobile } from '../src/nest/normalization.js';
import { hasCafePermission } from '../src/nest/authorization.js';

test('Iranian matching normalizes Arabic characters and mobile digits without accepting invalid OTP targets', () => {
  assert.equal(normalizePersian('  كافه‌يِ  تو '), 'کافه ی تو');
  for (const value of ['۰۹۱۲۳۴۵۶۷۸۹','٠٩١٢٣٤٥٦٧٨٩','00989123456789','+98 (912) 345-6789']) {
    assert.equal(normalizeIranMobile(value), '+989123456789');
  }
  for (const value of ['0912','+9891234567890','02112345678','hello','+12025550123']) {
    assert.throws(() => normalizeIranMobile(value));
  }
});
test('authorization requires authenticated actor, café and branch scope; staff cannot edit profile', () => {
  const membership = [{ userId: 'staff', cafeId: 'a', branchId: 'a1', role: 'staff' as const }];
  assert.equal(hasCafePermission('staff',membership,'a','award_stamp','a1'),true);
  assert.equal(hasCafePermission('staff',membership,'b','award_stamp','a1'),false);
  assert.equal(hasCafePermission('other',membership,'a','award_stamp','a1'),false);
  assert.equal(hasCafePermission('staff',membership,'a','award_stamp','a2'),false);
  assert.equal(hasCafePermission('staff',membership,'a','award_stamp'),false);
  assert.equal(hasCafePermission('staff',membership,'a','edit_profile'),false);
});
