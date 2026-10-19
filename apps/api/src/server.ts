import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bootstrap } from '../../../packages/contracts/bootstrap.ts';

const html = readFileSync(new URL('../static/index.html', import.meta.url));
export function createApp() {
  return createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(405, { error: 'method_not_allowed' });
    }
    const path = req.url?.split('?')[0];
    if (path === '/health') return json(200, { status: 'ok' });
    if (path === '/v1/bootstrap') return json(200, bootstrap);
    if (path === '/probe.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end("fetch('/v1/bootstrap').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{document.querySelector('#status').textContent=data.brand+' · ارتباط با API برقرار است';}).catch(()=>{document.querySelector('#status').textContent='ارتباط برقرار نشد؛ دوباره صفحه را باز کنید';});");
    }
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    return json(404, { error: 'not_found' });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(4100, '127.0.0.1', () => console.log('Ghahvehto local probe: http://127.0.0.1:4100'));
}
