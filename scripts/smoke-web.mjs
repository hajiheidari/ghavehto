import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

function start(args, env) {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe'] });
  let output = '';
  let spawnFailed = false;
  child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-4096); });
  child.stderr.resume();
  child.on('error', () => { spawnFailed = true; });
  return {
    async ready(label, healthPath) {
      for (let attempt=0;attempt<100;attempt++) {
        if (spawnFailed || child.exitCode!==null) break;
        const address = /http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0];
        if (address) {
          try {
            const response = await fetch(address + healthPath, { signal:AbortSignal.timeout(1500) });
            if(response.ok) return address;
          } catch {}
        }
        await setTimeout(400);
      }
      throw new Error(label + ' did not become ready on its assigned loopback port');
    },
    close() { child.kill(); },
  };
}

const api = start(['apps/api/dist/nest/main.js'],{PORT:'0',IDENTITY_DATABASE_URL:''});
let web;
try {
  const apiUrl = await api.ready('Nest API','/health/live');
  web = start(['apps/web/node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','0'],
    { API_BASE_URL:apiUrl, NEXT_TELEMETRY_DISABLED:'1', PRIVATE_PARTICIPATION_VIEW:'0' });
  const base = await web.ready('Next web','/');
  const home = await fetch(base);
  const html = await home.text();
  assert.match(html, /lang="fa" dir="rtl"/);
  assert.ok(html.includes('ارتباط وب با API مشترک برقرار است'), 'SSR must actually call the running Nest API');
  assert.match(html, /noindex/);
  const cafes = await fetch(base+'/cafes?q=smoke');
  assert.equal(cafes.status,200);
  assert.match(await cafes.text(), /فهرست کافه‌ها فعلاً در دسترس نیست/);
  assert.equal((await fetch(base+'/cafes/not-a-uuid')).status,404);
  const branch = await fetch(base+'/cafes/30000000-0000-4000-8000-000000000001');
  assert.equal(branch.status,200);
  assert.match(await branch.text(), /اطلاعات شعبه فعلاً در دسترس نیست/);
  for (const kind of ['cafe','admin','agents']) {
    const page = await fetch(`${base}/dashboard/${kind}`);
    assert.equal(page.status,200,'/dashboard/' + kind + ' must return HTTP 200');
    assert.ok((await page.text()).includes('هیچ داده مدیریتی'),'/dashboard/' + kind + ' must show the protected placeholder');
  }
  assert.equal((await fetch(base+'/dashboard/participation')).status,404,'Participation view must be disabled by default');
  assert.equal((await fetch(base+'/missing')).status,404);
  assert.equal((await fetch(base+'/robots.txt')).status,200);
  console.log('Web smoke passed: real SSR → Nest connection, RTL, directory unavailable state, protected placeholders, 404 and robots');
} finally {
  web?.close(); api.close();
}
