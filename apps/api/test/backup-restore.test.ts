import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {test} from 'node:test';
import pg from 'pg';
import {migrate,schemaReady} from '../src/nest/migrations.js';

const execute=promisify(execFile);

test('a disposable PostgreSQL backup restores migrations, independent journals and restricted permissions',async()=>{
  assert.ok(process.env.DATABASE_URL,'Disposable DATABASE_URL required');
  const container=process.env.POSTGRES_TEST_CONTAINER;
  assert.ok(container&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container),'Disposable PostgreSQL container required');
  const suffix=randomBytes(8).toString('hex');
  const sourceName='gh_backup_source_'+suffix,targetName='gh_backup_target_'+suffix;
  const archive='/tmp/gh_backup_'+suffix+'.dump';
  const address=new URL(process.env.DATABASE_URL);
  const host=new pg.Pool({connectionString:address.toString()});
  let source:pg.Pool|undefined,target:pg.Pool|undefined,sourceCreated=false,targetCreated=false;
  const command=(args:string[])=>execute('docker',['exec',container,...args],{timeout:60000,maxBuffer:1024*1024});
  try {
    await host.query('CREATE DATABASE '+sourceName);sourceCreated=true;
    address.pathname='/'+sourceName;
    source=new pg.Pool({connectionString:address.toString()});
    await migrate(source);
    const {rows:[user]}=await source.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(48)]);
    const {rows:[cafe]}=await source.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST RESTORE','test restore',$1) RETURNING id",[randomUUID()]);
    const {rows:[program]}=await source.query('INSERT INTO stamp_programs(cafe_id) VALUES($1) RETURNING id',[cafe.id]);
    await source.query('INSERT INTO stamp_program_versions(program_id,cafe_id,version,stamps_required) VALUES($1,$2,1,10)',[program.id,cafe.id]);
    await source.query(`INSERT INTO stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
      VALUES($1,$2,$3,1,$4,1,'award','TEST restore stamp',clock_timestamp())`,[user.id,cafe.id,program.id,randomUUID()]);
    const {rows:[budget]}=await source.query('INSERT INTO star_award_budgets(funded_units,remaining_units,active) VALUES(10,10,true) RETURNING id');
    await source.query('SELECT public.award_funded_stars($1,$2,$3,5,NULL)',[user.id,budget.id,randomUUID()]);
    await source.query(`INSERT INTO tier_entries(user_id,qualification_year,operation_id,units,kind,reason,effective_at)
      VALUES($1,2026,$2,3,'award','TEST restore tier',clock_timestamp())`,[user.id,randomUUID()]);
    const tables=['schema_migrations','users','cafes','stamp_programs','stamp_program_versions',
      'stamp_entries','star_entries','star_award_budgets','tier_entries','audit_events'];
    const snapshot=async(pool:pg.Pool)=>{
      const result:Record<string,unknown>={};
      for(const table of tables){
        // Table names are fixed test constants. JSON text preserves bytea, dates and large integers.
        result[table]=(await pool.query('SELECT coalesce(jsonb_agg(entry ORDER BY entry::text),\'[]\'::jsonb)::text AS contents FROM (SELECT to_jsonb(t) AS entry FROM public.'+table+' t) rows')).rows[0].contents;
      }
      return result;
    };
    const expected=await snapshot(source);
    await command(['pg_dump','-U','postgres','--format=custom','--no-owner','--file='+archive,'--dbname='+sourceName]);
    // A post-backup fixture change must not appear in the restored point-in-time snapshot.
    await source.query("INSERT INTO cafes(name,normalized_name,slug) VALUES('TEST AFTER BACKUP','test after',$1)",[randomUUID()]);
    await host.query('CREATE DATABASE '+targetName);targetCreated=true;
    await command(['pg_restore','-U','postgres','--exit-on-error','--single-transaction','--no-owner','--dbname='+targetName,archive]);
    address.pathname='/'+targetName;
    target=new pg.Pool({connectionString:address.toString()});
    assert.deepEqual(await snapshot(target),expected);
    const client=await target.connect();
    try {assert.equal(await schemaReady(client),true);}
    finally {client.release();}
    await migrate(target);
    assert.deepEqual(await snapshot(target),expected);
    assert.equal((await target.query("SELECT ST_Distance(ST_GeomFromText('POINT(0 0)'),ST_GeomFromText('POINT(3 4)')) AS distance")).rows[0].distance,5);
    const restored=target;
    for(const table of ['stamp_entries','star_entries','tier_entries']){
      await assert.rejects(restored.query('DELETE FROM public.'+table),{code:'55000'});
    }
    const restricted=await restored.connect();
    try {
      await restricted.query('BEGIN');
      await restricted.query('SET LOCAL ROLE ghahvehto_app');
      await assert.rejects(restricted.query('SELECT * FROM public.star_entries'),{code:'42501'});
      await restricted.query('ROLLBACK');
      await restricted.query('BEGIN');
      await restricted.query('SET LOCAL ROLE ghahvehto_identity');
      await assert.rejects(restricted.query('SELECT * FROM public.agent_jobs'),{code:'42501'});
      await restricted.query('ROLLBACK');
    } finally {await restricted.query('ROLLBACK');restricted.release();}
  } finally {
    await source?.end();await target?.end();
    try {
      await command(['rm','-f','--',archive]);
    } finally {
      try {
        if(targetCreated) await host.query('DROP DATABASE '+targetName+' WITH (FORCE)');
        if(sourceCreated) await host.query('DROP DATABASE '+sourceName+' WITH (FORCE)');
      } finally {await host.end();}
    }
  }
});
