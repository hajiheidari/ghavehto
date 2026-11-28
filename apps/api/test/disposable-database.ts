import {setTimeout as delay} from 'node:timers/promises';
import type {Pool} from 'pg';

/** End every client pool first. Wait for backend disconnects instead of killing live sockets. */
export async function dropDisposableDatabase(host:Pool,name:string) {
  if(!/^gh_(?:history|preferences|backup_source|backup_target)_[0-9a-f]{16}$/.test(name)) {
    throw new Error('Expected a generated disposable database name');
  }
  for(let attempt=0;;attempt++) {
    try {await host.query('DROP DATABASE '+name);return;}
    catch(error) {
      if((error as {code?:string}).code!=='55006'||attempt>=39) throw error;
      await delay(50);
    }
  }
}
