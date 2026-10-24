import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCafeAccess, parseBranchAccess } from './access-generated.ts';

test('generated access responses reject malformed identifiers and private-data-shaped responses', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  assert.deepEqual(parseCafeAccess({cafeId:id, name:'TEST'}), {cafeId:id,name:'TEST'});
  for (const value of [null, {}, {cafeId:'wrong',name:'TEST'}, {cafeId:id,name:2}, {phone:'+989120000000'}]) assert.throws(() => parseCafeAccess(value));
  assert.throws(() => parseBranchAccess({cafeId:id, branchId:'wrong',name:'TEST'}));
});
