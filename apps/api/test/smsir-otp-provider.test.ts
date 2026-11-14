import assert from 'node:assert/strict';
import test from 'node:test';
import { SmsIrOtpProvider } from '../src/nest/smsir-otp-provider.js';

const config = { apiKey: 'fixture-key', templateId: 42, parameterName: 'Code' };
const input = { destination: '+989120000000', code: '004271' };
const accepted = () => Response.json({ status: 1, data: { messageId: 101 } });

test('SMS.ir verify uses one fixed HTTPS request with the reviewed template shape', async () => {
  let calls = 0;
  const provider = new SmsIrOtpProvider(config, async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.sms.ir/v1/send/verify');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('x-api-key'), config.apiKey);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      mobile: '9120000000', templateId: 42, parameters: [{ name: 'Code', value: '004271' }],
    });
    return accepted();
  });
  await provider.send(input);
  assert.equal(calls, 1);
});

test('SMS.ir failures are sanitized and never retried', async () => {
  const failure = { message: 'SMS.ir OTP delivery was not accepted' };
  for (const respond of [
    () => new Response('private provider diagnostic', { status: 429 }),
    () => Response.json({ status: 0, data: { messageId: 101 } }),
    () => Response.json({ status: 1 }),
    () => new Response('malformed receipt'),
    () => { throw new Error(config.apiKey); },
  ]) {
    let calls = 0;
    const provider = new SmsIrOtpProvider(config, async () => { calls++; return respond(); });
    await assert.rejects(provider.send(input), failure);
    assert.equal(calls, 1);
  }
});

test('SMS.ir abort and invalid inputs fail before sending or propagate cancellation', async () => {
  let calls = 0;
  const controller = new AbortController();
  const provider = new SmsIrOtpProvider(config, async (_url, init) => {
    calls++;
    controller.abort('private cancellation reason');
    assert.equal(init?.signal?.aborted, true);
    return accepted();
  });
  await assert.rejects(provider.send({ ...input, code: '12' }));
  await assert.rejects(provider.send({ ...input, destination: '+971501234567' }));
  await assert.rejects(provider.send({ ...input, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
  await assert.rejects(provider.send({ ...input, signal: controller.signal }), { message: 'SMS.ir OTP delivery was not accepted' });
  assert.equal(calls, 1);
  assert.throws(() => new SmsIrOtpProvider({ ...config, templateId: 0 }), /Invalid SMS.ir OTP configuration/);
});
