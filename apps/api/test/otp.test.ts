import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DisabledOtpProvider, OtpCrypto } from '../src/nest/otp.js';

test('OTP digest binds challenge, normalized identity and secret without storing code', () => {
  const key = randomBytes(32);
  const crypto = new OtpCrypto(key);
  const id = randomUUID();
  const phone = '+989120000000'; // Synthetic fixture only; never delivered.
  const code = crypto.generateCode();
  assert.match(code, /^\d{6}$/);
  const digest = crypto.digest(id, phone, code);
  assert.equal(digest.length, 32);
  assert.equal(crypto.matches(id, '۰۹۱۲۰۰۰۰۰۰۰', code, digest), true);
  assert.equal(crypto.matches(id.toUpperCase(), phone, code, digest), true);
  assert.equal(crypto.matches(randomUUID(), phone, code, digest), false);
  assert.equal(crypto.matches(id, '+989130000000', code, digest), false);
  const wrong = code === '000000' ? '000001' : '000000';
  assert.equal(crypto.matches(id, phone, wrong, digest), false);
  assert.equal(new OtpCrypto(randomBytes(32)).matches(id, phone, code, digest), false);
  key.fill(0);
  assert.equal(crypto.matches(id, phone, code, digest), true, 'Caller cannot mutate the internal key');
  for (const invalid of ['', '12345', '1234567', '۱۲۳۴۵۶', '12345x']) {
    assert.equal(crypto.matches(id, phone, invalid, digest), false);
  }
  assert.equal(crypto.matches(id, phone, code, Buffer.alloc(0)), false);
  assert.throws(() => new OtpCrypto(Buffer.alloc(31)), /32 random bytes/);
  assert.throws(() => crypto.digest('bad-id', phone, code), /challenge ID/);
});

test('default OTP provider refuses delivery without exposing the payload', async () => {
  const provider = new DisabledOtpProvider();
  assert.equal(provider.enabled, false);
  await assert.rejects(provider.send({ destination: '+989120000000', code: '000000' }),
    error => error instanceof Error && error.message === 'OTP delivery is disabled');
});

test('OTP lookup buckets canonicalize identities and IP representations', () => {
  const crypto = new OtpCrypto(randomBytes(32));
  assert.deepEqual(crypto.fingerprint('phone', '09120000000'), crypto.fingerprint('phone', '+989120000000'));
  assert.deepEqual(crypto.fingerprint('ip', '192.0.2.1'), crypto.fingerprint('ip', '::ffff:192.0.2.1'));
  assert.deepEqual(crypto.fingerprint('ip', '2001:db8::1'), crypto.fingerprint('ip', '2001:0DB8:0:0:0:0:0:1'));
  assert.throws(() => crypto.fingerprint('ip', 'arbitrary-header'), /Invalid client IP/);
  assert.throws(() => crypto.fingerprint('ip', 'fe80::1%eth0'), /Invalid client IP/);
});
