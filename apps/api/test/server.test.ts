import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.ts';
import { bootstrap } from '../../../packages/contracts/bootstrap.ts';

test('read-only shared bootstrap and Persian RTL harness over real HTTP', async () => {
  const server = createApp();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const result = await fetch(`${base}/v1/bootstrap`);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), bootstrap);
    assert.equal(result.headers.get('access-control-allow-origin'), null);
    const health = await fetch(`${base}/health`);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const home = await fetch(base);
    assert.match(await home.text(), /lang="fa" dir="rtl"/);
    assert.match(home.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    assert.equal((await fetch(`${base}/probe.js`)).status, 200);
    assert.equal((await fetch(`${base}/unknown`)).status, 404);
    const write = await fetch(`${base}/v1/bootstrap`, { method: 'POST' });
    assert.equal(write.status, 405);
    assert.equal(write.headers.get('allow'), 'GET');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
