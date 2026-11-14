import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from './bootstrap.ts';
import { parseBootstrap } from './generated.ts';
test('generated contract validates every field and rejects invented loyalty availability', () => {
  assert.deepEqual(parseBootstrap(bootstrap), bootstrap);
  for (const key of Object.keys(bootstrap)) {
    const malformed = { ...bootstrap } as Record<string,unknown>;
    delete malformed[key];
    assert.throws(() => parseBootstrap(malformed));
  }
  assert.throws(() => parseBootstrap({ ...bootstrap, loyaltyEnabled:true }));
  assert.throws(() => parseBootstrap({ ...bootstrap, locale:'en-US' }));
});
