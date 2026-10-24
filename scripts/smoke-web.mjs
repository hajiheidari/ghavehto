import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const apiPort = 44101;
const webPort = 43002;
const api = spawn(process.execPath, ['apps/api/dist/nest/main.js'], { env: { ...process.env, PORT:String(apiPort) }, stdio: 'pipe' });
const web = spawn(process.execPath, ['apps/web/node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port',String(webPort)], {
  env: { ...process.env, API_BASE_URL:`http://127.0.0.1:${apiPort}`, NEXT_TELEMETRY_DISABLED:'1' }, stdio:'pipe',
});
let logs = '';
for (const child of [api,web]) {
  child.stdout.on('data', chunk => { logs += chunk.toString(); });
  child.stderr.on('data', chunk => { logs += chunk.toString(); });
  child.on('error', error => { logs += error.message; });
}
async function wait(url) {
  for (let attempt=0;attempt<100;attempt++) {
    try { const response = await fetch(url, { signal:AbortSignal.timeout(1500) }); if(response.ok) return; } catch {}
    await setTimeout(400);
  }
  throw new Error(`Server not ready: ${url}\n${logs}`);
}
try {
  await wait(`http://127.0.0.1:${apiPort}/health/live`);
  const base = `http://127.0.0.1:${webPort}`;
  await wait(base);
  const home = await fetch(base);
  const html = await home.text();
  assert.match(html, /lang="fa" dir="rtl"/);
  assert.ok(html.includes('ارتباط وب با API مشترک برقرار است'), 'SSR must actually call the running Nest API');
  assert.match(html, /noindex/);
  assert.equal((await fetch(base+'/cafes')).status,200);
  for (const kind of ['cafe','admin','agents']) {
    const page = await fetch(`${base}/dashboard/${kind}`);
    assert.equal(page.status,200);
    assert.ok((await page.text()).includes('هیچ داده مدیریتی'));
  }
  assert.equal((await fetch(base+'/missing')).status,404);
  assert.equal((await fetch(base+'/robots.txt')).status,200);
  console.log('Web smoke passed: real SSR → Nest connection, RTL, empty directory, protected placeholders, 404 and robots');
} finally {
  api.kill(); web.kill();
}
