import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout} from 'node:timers/promises';

export async function startWebPanel(apiUrl:string) {
  let root=dirname(fileURLToPath(import.meta.url));
  while(!existsSync(join(root,'pnpm-workspace.yaml'))) {
    const parent=dirname(root);
    if(parent===root) throw new Error('Workspace not found');
    root=parent;
  }
  const child=spawn(process.execPath,[join(root,'apps/web/node_modules/next/dist/bin/next'),'start',join(root,'apps/web'),'--hostname','127.0.0.1','--port','0'],{
    env:{...process.env,API_BASE_URL:apiUrl,NEXT_TELEMETRY_DISABLED:'1',PANEL_WRITE_ORIGIN:'https://panel.example.test'},stdio:['ignore','pipe','pipe'],
  });
  let output='';
  child.stdout.on('data',chunk=>{output=(output+String(chunk)).slice(-8000)});
  child.stderr.on('data',()=>{}); // Do not dump request or environment diagnostics.
  let failure=false;
  child.on('error',()=>{failure=true});
  for(let attempt=0;attempt<100;attempt++) {
    const url=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output)?.[0];
    if(url) {
      try {
        if((await fetch(url+'/dashboard/cafe')).ok) return {url,close:async()=>{
          const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
          child.kill();
          await Promise.race([exited,setTimeout(3000)]);
          if(child.exitCode===null) child.kill('SIGKILL');
        }};
      } catch {}
    }
    if(failure||child.exitCode!==null) break;
    await setTimeout(100);
  }
  child.kill();
  throw new Error('Built Next panel did not become ready');
}
