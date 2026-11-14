import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PhoneVault } from '../src/nest/phone-vault.js';

test('private phone encryption authenticates identity, ciphertext and key version', () => {
  const lookup = randomBytes(32), old = randomBytes(32), fresh = randomBytes(32);
  const vault = new PhoneVault(lookup, new Map([['old', old]]), 'old');
  const user = randomUUID(), phone = '+989120000000';
  const first = vault.seal(user, phone), second = vault.seal(user, phone);
  assert.notDeepEqual(first, second);
  assert.equal(first.includes(phone), false);
  assert.equal(vault.open(user, first), phone);
  assert.deepEqual(vault.lookup('۰۹۱۲۰۰۰۰۰۰۰'), vault.lookup(phone));
  assert.throws(() => vault.open(randomUUID(), first), /Invalid private identity/);
  const changed = JSON.parse(first.toString());
  changed.data = Buffer.alloc(12).toString('base64');
  assert.throws(() => vault.open(user, Buffer.from(JSON.stringify(changed))), /Invalid private identity/);
  const rotated = new PhoneVault(lookup, new Map([['old', old], ['new', fresh]]), 'new');
  assert.equal(rotated.open(user, first), phone);
  assert.deepEqual(rotated.lookup(phone), vault.lookup(phone));
  assert.equal(JSON.parse(rotated.seal(user, phone).toString()).kid, 'new');
  assert.throws(() => new PhoneVault(lookup, new Map([['new', fresh]]), 'new').open(user, first), /Invalid private identity/);
  lookup.fill(0); old.fill(0);
  assert.equal(vault.open(user, first), phone, 'Caller cannot mutate copied keys');
  assert.throws(() => new PhoneVault(Buffer.alloc(0), new Map(), 'missing'), /Explicit valid/);
});
