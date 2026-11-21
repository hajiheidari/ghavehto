import pg from 'pg';
import {InternalDraftWorker} from './internal-draft-worker.js';

const kind=process.argv[2];
if(process.argv.length!==3||!['research','content'].includes(kind??'')||!process.env.AGENT_WORKER_DATABASE_URL) {
  console.error('Set AGENT_WORKER_DATABASE_URL to a dedicated restricted login and choose research or content. No external adapters are available.');
  process.exitCode=1;
}else {
  const pool=new pg.Pool({connectionString:process.env.AGENT_WORKER_DATABASE_URL,max:2});
  try {
    const worker=new InternalDraftWorker(pool);await worker.validateRuntime();
    console.log(await worker.once(kind as 'research'|'content'));
  }catch {
    // Never print source payloads, connection strings, SQL, credentials or raw errors.
    console.error('Internal draft worker failed; inspect private operational evidence.');process.exitCode=1;
  }finally{await pool.end();}
}
