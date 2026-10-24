import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/nest/app.js';
import { bootstrap } from '@ghahvehto/contracts';

test('Nest API serves shared contract; privileged routes fail closed', async () => {
  const { app, document } = await createApp();
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  try {
    const response = await fetch(`${base}/v1/bootstrap`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), bootstrap);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(document.components?.schemas?.BootstrapDto);
    for (const role of ['cafe', 'admin', 'agents']) {
      assert.equal((await fetch(`${base}/v1/dashboards/${role}`)).status, 401);
      assert.equal((await fetch(`${base}/v1/dashboards/${role}`, { headers: { authorization: 'Bearer forged' } })).status, 401);
    }
    assert.equal((await fetch(`${base}/v1/cafes/20000000-0000-4000-8000-000000000001/access`)).status, 401);
    assert.equal((await fetch(`${base}/v1/bootstrap`, { method: 'POST' })).status, 404);
    assert.equal((await fetch(`${base}/health/live`)).status, 200);
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try { assert.equal((await fetch(`${base}/health/ready`)).status, 503); }
    finally { if (previous !== undefined) process.env.DATABASE_URL = previous; }
  } finally { await app.close(); }
});
