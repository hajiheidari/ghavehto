import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCafeAccess, parseBranchAccess, parseSessionTokens, parseSessionStatus } from './access-generated.ts';
import { randomBytes } from 'node:crypto';

test('generated access responses reject malformed identifiers and private-data-shaped responses', () => {
  const id = '10000000-0000-4000-8000-000000000001';
  assert.deepEqual(parseCafeAccess({cafeId:id, name:'TEST'}), {cafeId:id,name:'TEST'});
  for (const value of [null, {}, {cafeId:'wrong',name:'TEST'}, {cafeId:id,name:2}, {phone:'+989120000000'}]) assert.throws(() => parseCafeAccess(value));
  assert.throws(() => parseBranchAccess({cafeId:id, branchId:'wrong',name:'TEST'}));
});

test('session contracts reject malformed credentials and noncanonical dates', () => {
  const tokens = {accessToken:randomBytes(32).toString('base64url'),refreshToken:randomBytes(32).toString('base64url'),accessExpiresAt:'2026-10-25T10:00:00.000Z',refreshExpiresAt:'2026-11-25T10:00:00.000Z'};
  assert.deepEqual(parseSessionTokens(tokens), tokens);
  assert.throws(() => parseSessionTokens({...tokens,accessToken:'bad'}));
  assert.throws(() => parseSessionTokens({...tokens,accessExpiresAt:'2026-02-30T10:00:00.000Z'}));
  assert.throws(() => parseSessionTokens({...tokens,accessExpiresAt:'not a date'}));
  assert.throws(() => parseSessionStatus({userId:'spoofed',sessionId:'bad'}));
});
