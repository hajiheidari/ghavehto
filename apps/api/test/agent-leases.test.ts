import assert from 'node:assert/strict';
import {createApp} from '../src/nest/app.js';
import {startWebPanel} from './web-panel.js';
import {SessionService} from '../src/nest/sessions.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {InternalDraftWorker} from '../src/nest/internal-draft-worker.js';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {migrate} from '../src/nest/migrations.js';

test('internal agent leases fence stale workers, honor pause and bound retries without external effects',async t=>{
  assert.ok(process.env.DATABASE_URL);
  const base=new URL(process.env.DATABASE_URL),database='gh_agents_'+randomBytes(8).toString('hex');
  const host=new pg.Pool({connectionString:base.toString()});let pool:pg.Pool|undefined,created=false;
  try {
    await host.query(`CREATE DATABASE ${database}`);created=true;base.pathname='/'+database;
    pool=new pg.Pool({connectionString:base.toString()});await migrate(pool);await migrate(pool);const db=pool;
    assert.equal((await db.query('SELECT 1 FROM agent_controls')).rowCount,0,'No agent is configured or enabled by migration');
    await db.query("INSERT INTO agent_controls(kind) VALUES('discovery'),('research'),('content'),('outreach')");
    const enqueue='SELECT public.enqueue_agent_job($1,$2,$3) AS id';
    const lease='SELECT public.lease_agent_job($1,$2,$3) AS receipt';
    const transition='SELECT public.transition_agent_lease($1,$2,$3,$4,$5) AS accepted';
    const worker=randomUUID();
    const queue=async(kind='research')=>(await db.query(enqueue,[kind,randomUUID(),{source:'TEST disposable, untrusted source'}])).rows[0].id as string;
    const take=async(kind='research',who=worker)=>(await db.query(lease,[kind,who,60])).rows[0].receipt as {jobId:string;leaseToken:string;attempt:number}|null;
    const move=async(job:NonNullable<Awaited<ReturnType<typeof take>>>,action:string,output:object|null=null,who=worker)=>(await db.query(transition,[job.jobId,who,job.leaseToken,action,output])).rows[0].accepted;
    await t.test('operation replay is exact, all four controls default paused, and costs stay zero',async()=>{
      const operation=randomUUID(),args=['research',operation,{query:'TEST'}];
      const r=await Promise.all([db.query(enqueue,args),db.query(enqueue,args)]);assert.deepEqual(r[0].rows,r[1].rows);
      await assert.rejects(db.query(enqueue,['research',operation,{query:'CHANGED'}]),{code:'23505'});
      for(const kind of ['discovery','research','content','outreach']) assert.equal(await take(kind),null);
      await assert.rejects(db.query('UPDATE agent_jobs SET cost_units=1'),{code:'23514'});
      await db.query("SELECT public.pause_agent('research',false,'TEST start internal research')");
      const job=await take();assert.ok(job);
      assert.equal(await move(job,'complete',{draft:'TEST synthetic draft'}),true);
      assert.equal((await db.query('SELECT state FROM agent_jobs WHERE id=$1',[job.jobId])).rows[0].state,'awaiting_review');
      assert.equal(await move(job,'complete',{draft:'TEST synthetic draft'}),false);
      await assert.rejects(db.query(transition,[job.jobId,worker,job.leaseToken,'execute',{}]),{code:'22023'});
    });
    await t.test('competing workers cannot own the same job and stale tokens cannot finish or heartbeat',async()=>{
      const id=await queue(),other=randomUUID();
      const receipts=await Promise.all([take(),take('research',other)]);assert.equal(receipts.filter(Boolean).length,1);
      const first=receipts.find(Boolean)!;assert.equal(first.jobId,id);
      const firstWorker=receipts[0]?worker:other;
      assert.equal(await move({...first,leaseToken:randomUUID()},'heartbeat',null,firstWorker),false);
      await db.query("UPDATE agent_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);
      const next=await take();assert.ok(next);assert.equal(next.attempt,2);assert.notEqual(first.leaseToken,next.leaseToken);
      for(const action of ['heartbeat','complete','transient']) assert.equal(await move(first,action,action==='complete'?{}:null,firstWorker),false);
      assert.equal(await move(next,'heartbeat'),true);
      await db.query("SELECT public.pause_agent('research',true,'TEST pause active job')");
      assert.equal(await move(next,'complete',{}),false);assert.equal(await take(),null);
      await db.query("SELECT public.pause_agent('research',false,'TEST resume')");
      assert.equal(await move(next,'complete',{draft:'TEST needs human review'}),true);
    });
    await t.test('SKIP LOCKED avoids blocked jobs, backoff and expiry stop at the attempt limit',async()=>{
      const first=await queue(),second=await queue(),lock=await db.connect();
      try {
        await lock.query('BEGIN');await lock.query('SELECT 1 FROM agent_jobs WHERE id=$1 FOR UPDATE',[first]);
        const receipt=await take();assert.ok(receipt);assert.equal(receipt.jobId,second);assert.equal(await move(receipt,'complete',{}),true);
      }finally{await lock.query('ROLLBACK');lock.release();}
      let receipt=await take();assert.ok(receipt);assert.equal(receipt.jobId,first);
      assert.equal(await move(receipt,'transient'),true);assert.equal(await take(),null);
      const state=(await db.query('SELECT state,available_at>clock_timestamp() AS delayed FROM agent_jobs WHERE id=$1',[first])).rows[0];
      assert.deepEqual(state,{state:'retry_wait',delayed:true});
      for(let attempt=2;attempt<=3;attempt++){
        await db.query("UPDATE agent_jobs SET available_at=clock_timestamp()-interval '1 second' WHERE id=$1",[first]);
        receipt=await take();assert.ok(receipt);assert.equal(receipt.attempt,attempt);
        assert.equal(await move(receipt,'transient'),true);
      }
      assert.equal((await db.query('SELECT state FROM agent_jobs WHERE id=$1',[first])).rows[0].state,'dead');
      assert.equal(await take(),null);
      await db.query("UPDATE agent_controls SET attempt_limit=1 WHERE kind='research'");
      const abandoned=await queue(),last=await take();assert.ok(last);assert.equal(last.jobId,abandoned);
      await db.query("UPDATE agent_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[abandoned]);
      assert.equal(await take(),null);
      assert.deepEqual((await db.query('SELECT state,failure_code FROM agent_jobs WHERE id=$1',[abandoned])).rows,[{state:'dead',failure_code:'lease_expired'}]);
    });
    await t.test('ordinary runtime capabilities cannot queue, lease, transition or inspect agent work',async()=>{
      const client=await db.connect();
      try {
        for(const role of ['ghahvehto_app','ghahvehto_identity','ghahvehto_tracking']){
          for(const [sql,args] of [[enqueue,['outreach',randomUUID(),{}]],[lease,['outreach',worker,60]],
            [transition,[randomUUID(),worker,randomUUID(),'complete',{}]],['SELECT * FROM agent_jobs',[]]] as const){
            await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
            await assert.rejects(client.query(sql,[...args]),{code:'42501'});await client.query('ROLLBACK');
          }
        }
      }finally{await client.query('ROLLBACK');client.release();}
      assert.equal((await db.query('SELECT 1 FROM agent_jobs WHERE cost_units<>0')).rowCount,0);
      for(const table of ['star_entries','tier_entries','stamp_entries']) assert.equal((await db.query(`SELECT 1 FROM ${table}`)).rowCount,0);
    });
    const user=async()=>(await db.query(`INSERT INTO users(phone_hash,phone_ciphertext,phone_verified_at)
      VALUES($1,$2,clock_timestamp()) RETURNING id`,[randomBytes(32),randomBytes(32)])).rows[0].id as string;
    const admin=await user(),editor=await user(),reviewer=await user(),consumer=await user();
    await db.query("INSERT INTO operations_access(user_id,role) VALUES($1,'admin'),($2,'editor'),($3,'editor')",[admin,editor,reviewer]);
    const save='SELECT public.save_content_revision($1,$2,$3,$4,$5,$6,$7) AS id';
    const review='SELECT public.review_operation($1,$2,$3,$4,$5,$6,$7) AS id';
    const usable='SELECT public.operation_review_usable($1,$2) AS usable';
    const hash='SELECT public.operation_subject_hash($1,$2) AS hash';
    const sources=JSON.stringify([{rights:'permitted',url:'https://example.invalid/source',publicationDate:null,retrievalEvidence:'TEST disposable'}]);
    assert.equal((await db.query('SELECT 1 FROM content_documents')).rowCount,0);
    await t.test('private editorial HTTP derives writes from live sessions and isolates its database login',async()=>{
      const login='gh_editorial_'+randomBytes(8).toString('hex');
      const password=randomBytes(24).toString('hex');
      await db.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
      const url=new URL(base);url.username=login;url.password=password;
      const editorialPool=new pg.Pool({connectionString:url.toString()});
      try {
        await db.query(`GRANT ghahvehto_editorial TO ${login}`);
        await assert.rejects(createApp({editorialPool:db}),/Dedicated restricted editorial login/);
        await assert.rejects(editorialPool.query('SELECT * FROM public.sessions'),{code:'42501'});
        const standard=await createApp();
        try {
          await standard.app.listen(0,'127.0.0.1');
          const response=await fetch((await standard.app.getUrl())+'/v1/internal/editorial/revisions',{method:'POST'});
          assert.equal(response.status,404);
        } finally {await standard.app.close();}
        const {app,document}=await createApp({editorialPool});
        try {
          assert.ok(!document.paths['/v1/internal/editorial/revisions']);
          await app.listen(0,'127.0.0.1');
          const origin=await app.getUrl();
          const sessions=new SessionService(db);
          const consumerId=await user();
          const [author,reviewerSession,consumer]=await Promise.all([sessions.issue(editor),sessions.issue(reviewer),sessions.issue(consumerId)]);
          const post=(path:string,input:object,token?:string)=>fetch(origin+'/v1/internal/editorial/'+path,{
            method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
            body:JSON.stringify(input),
          });
          const documentInput={documentId:randomUUID(),slug:'test-'+randomBytes(8).toString('hex')};
          assert.equal((await post('documents',documentInput,consumer.accessToken)).status,403);
          const creates=await Promise.all([post('documents',documentInput,author.accessToken),post('documents',documentInput,author.accessToken)]);
          for(const response of creates) {
            assert.equal(response.status,201);
            assert.deepEqual(await response.json(),{id:documentInput.documentId});
          }
          assert.equal((await post('documents',documentInput,reviewerSession.accessToken)).status,409);
          assert.equal((await post('documents',{...documentInput,slug:documentInput.slug+'-changed'},author.accessToken)).status,409);
          const auditCount=await db.query("SELECT 1 FROM audit_events WHERE action='content.document_created' AND actor_id=$1 AND metadata->>'documentId'=$2",[editor,documentInput.documentId]);
          assert.equal(auditCount.rowCount,1);
          const revision={documentId:documentInput.documentId,operationId:randomUUID(),expectedRevision:0,title:'Test draft',body:'Test body <b>untrusted</b>',sources:[{rights:'original'}]};
          assert.equal((await post('revisions',revision)).status,401);
          assert.equal((await post('revisions',revision,consumer.accessToken)).status,403);
          assert.equal((await post('revisions',{...revision,actorId:admin},author.accessToken)).status,400);
          const saved=await post('revisions',revision,author.accessToken);
          assert.equal(saved.status,201);
          assert.equal(saved.headers.get('cache-control'),'no-store');
          const receipt=await saved.json() as {id:string};
          assert.deepEqual(await (await post('revisions',revision,author.accessToken)).json(),receipt);
          const get=(path:string,token?:string)=>fetch(origin+'/v1/internal/editorial/'+path,{
            headers:token?{authorization:'Bearer '+token}:{},
          });
          assert.equal((await get('documents')).status,401);
          assert.equal((await get('documents',consumer.accessToken)).status,403);
          assert.equal((await get('documents?after='+randomUUID(),author.accessToken)).status,400);
          const inventory=await get('documents',author.accessToken);
          assert.equal(inventory.status,200);
          assert.equal(inventory.headers.get('cache-control'),'no-store');
          const initialInventory=await inventory.json() as {items:Record<string,unknown>[]};
          assert.deepEqual(initialInventory.items,[{documentId:documentInput.documentId,slug:documentInput.slug,
            revisionId:receipt.id,revision:1,title:revision.title}]);
          const web=await startWebPanel(await app.getUrl(),false,false,true);
          try {
            const page=(query:string,token?:string)=>fetch(web.url+'/dashboard/editorial'+query,{
              headers:token?{Cookie:'__Host-ghahvehto-access='+token}:{},
            });
            const index=await page('',author.accessToken);
            assert.match(index.headers.get('cache-control')??'',/no-store/);
            const html=await index.text();
            assert.match(html,/dir="rtl"/);
            assert.ok(html.includes(revision.title));
            assert.ok(html.includes('revision='+receipt.id));
            assert.ok(!html.includes(author.accessToken));
            const subjectPage=await page('?revision='+receipt.id,reviewerSession.accessToken);
            const subjectHtml=await subjectPage.text();
            assert.match(subjectHtml,/Test body &lt;b&gt;untrusted&lt;\/b&gt;/);
            assert.ok(!subjectHtml.includes('<b>untrusted</b>'));
            const nextRevision=await post('revisions',{...revision,operationId:randomUUID(),expectedRevision:1},author.accessToken);
            assert.equal(nextRevision.status,201);
            const {id:reviewRevision}=await nextRevision.json() as {id:string};
            const reviewHtml=await (await page('?revision='+reviewRevision,reviewerSession.accessToken)).text();
            const reviewOperation=/<input(?=[^>]*name="operationId")[^>]*value="([^"]+)"/.exec(reviewHtml)?.[1];
            assert.ok(reviewOperation);
            const form=new URLSearchParams({revisionId:reviewRevision,operationId:reviewOperation,
              decision:'approved',lifetimeSeconds:'60',reason:'TEST independent panel review'});
            const submit=(token:string,origin?:string)=>fetch(web.url+'/dashboard/editorial/review',{
              method:'POST',redirect:'manual',headers:{Cookie:'__Host-ghahvehto-access='+token,...(origin?{Origin:origin}:{})},body:form,
            });
            assert.equal((await submit(reviewerSession.accessToken)).status,403);
            assert.equal((await submit(reviewerSession.accessToken,'https://foreign.invalid')).status,403);
            assert.match((await submit(author.accessToken,'https://panel.example.test')).headers.get('location')??'',/review=unconfirmed/);
            const decisions=await Promise.all(Array.from({length:2},()=>submit(reviewerSession.accessToken,'https://panel.example.test')));
            for(const response of decisions) {
              assert.equal(response.status,303);
              assert.match(response.headers.get('location')??'',/review=saved/);
            }
            const decisionHtml=await (await page('?revision='+reviewRevision,reviewerSession.accessToken)).text();
            assert.match(decisionHtml,/تصمیم ثبت‌شده/);
            assert.match(decisionHtml,/TEST independent panel review/);
            assert.ok(!decisionHtml.includes('action="/dashboard/editorial/review"'));
            const statusPath='revisions/'+reviewRevision+'/review';
            assert.equal((await get(statusPath,consumer.accessToken)).status,403);
            assert.equal((await get(statusPath)).status,401);
            const status=await (await get(statusPath,author.accessToken)).json() as {receipt:{usable:boolean}};
            assert.equal(status.receipt.usable,true);
            await db.query('UPDATE operations_access SET revoked_at=clock_timestamp() WHERE user_id=$1',[reviewer]);
            const revoked=await (await get(statusPath,author.accessToken)).json() as typeof status;
            assert.equal(revoked.receipt.usable,false);
            await db.query('UPDATE operations_access SET revoked_at=NULL WHERE user_id=$1',[reviewer]);
            const stored=await db.query('SELECT reviewer_id,lifetime_seconds FROM operation_reviews WHERE revision_id=$1',[reviewRevision]);
            assert.deepEqual(stored.rows,[{reviewer_id:reviewer,lifetime_seconds:60}]);
            const queueAdmin=await sessions.issue(admin);
            const queuePage=(token:string)=>fetch(web.url+'/dashboard/editorial/jobs',{headers:{Cookie:'__Host-ghahvehto-access='+token}});
            assert.match(await (await queuePage(author.accessToken)).text(),/مجوز مدیر ندارید/);
            const queueHtml=await (await queuePage(queueAdmin.accessToken)).text();
            assert.match(queueHtml,/پیش‌نویس‌های در انتظار بازبینی/);
            assert.match(queueHtml,/job=/);
            const {rows:[agentDraft]}=await db.query("SELECT id FROM agent_jobs WHERE state='awaiting_review' AND NOT EXISTS(SELECT 1 FROM operation_reviews WHERE job_id=agent_jobs.id) LIMIT 1");
            const draftPage=async(token:string)=>fetch(web.url+'/dashboard/editorial/jobs?job='+agentDraft.id,{headers:{Cookie:'__Host-ghahvehto-access='+token}});
            const draftHtml=await (await draftPage(queueAdmin.accessToken)).text();
            const agentReviewOperation=/<input(?=[^>]*name="operationId")[^>]*value="([^"]+)"/.exec(draftHtml)?.[1];
            assert.ok(agentReviewOperation);
            const agentReviewForm=new URLSearchParams({jobId:agentDraft.id,operationId:agentReviewOperation,
              decision:'approved',lifetimeSeconds:'3600',reason:'TEST reviewed private agent packet'});
            const reviewAgent=(token:string,origin?:string)=>fetch(web.url+'/dashboard/editorial/jobs/review',{
              method:'POST',redirect:'manual',headers:{Cookie:'__Host-ghahvehto-access='+token,...(origin?{Origin:origin}:{})},
              body:agentReviewForm,
            });
            assert.equal((await reviewAgent(queueAdmin.accessToken)).status,403);
            assert.match((await reviewAgent(author.accessToken,'https://panel.example.test')).headers.get('location')??'',/review=unconfirmed/);
            for(const response of await Promise.all([reviewAgent(queueAdmin.accessToken,'https://panel.example.test'),reviewAgent(queueAdmin.accessToken,'https://panel.example.test')])){
              assert.equal(response.status,303);
              assert.match(response.headers.get('location')??'',/review=saved/);
            }
            const approvedHtml=await (await draftPage(queueAdmin.accessToken)).text();
            assert.match(approvedHtml,/تصمیم ثبت‌شده/);
            assert.ok(!approvedHtml.includes('action="/dashboard/editorial/jobs/review"'));
            const agentStatusPath='jobs/'+agentDraft.id+'/review';
            assert.equal((await get(agentStatusPath,author.accessToken)).status,403);
            const approval=await (await get(agentStatusPath,queueAdmin.accessToken)).json() as {receipt:{usable:boolean}};
            assert.equal(approval.receipt.usable,true);
            const {rows:[kind]}=await db.query('SELECT kind FROM agent_jobs WHERE id=$1',[agentDraft.id]);
            await db.query('SELECT public.pause_agent($1,true,$2)',[kind.kind,'TEST pause reviewed work']);
            const pausedApproval=await (await get(agentStatusPath,queueAdmin.accessToken)).json() as typeof approval;
            assert.equal(pausedApproval.receipt.usable,false);
            await db.query('SELECT public.pause_agent($1,false,$2)',[kind.kind,'TEST restore internal control']);
            const inventoryHtml=await (await page('',author.accessToken)).text();
            const newDocument=/<input(?=[^>]*name="documentId")[^>]*value="([^"]+)"/.exec(inventoryHtml)?.[1];
            assert.ok(newDocument);
            const documentForm=new URLSearchParams({documentId:newDocument,slug:'test-panel-'+randomBytes(8).toString('hex')});
            const createFromPanel=(token:string,origin?:string)=>fetch(web.url+'/dashboard/editorial/document',{
              method:'POST',redirect:'manual',headers:{Cookie:'__Host-ghahvehto-access='+token,...(origin?{Origin:origin}:{})},body:documentForm,
            });
            assert.equal((await createFromPanel(author.accessToken)).status,403);
            assert.equal((await createFromPanel(author.accessToken,'https://foreign.invalid')).status,403);
            assert.match((await createFromPanel(consumer.accessToken,'https://panel.example.test')).headers.get('location')??'',/created=unconfirmed/);
            for(const response of await Promise.all(Array.from({length:2},()=>createFromPanel(author.accessToken,'https://panel.example.test')))){
              assert.equal(response.status,303);
              assert.match(response.headers.get('location')??'',/created=saved/);
            }
            assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='content.document_created' AND metadata->>'documentId'=$1",[newDocument])).rowCount,1);
            const editorHtml=await (await page('?document='+newDocument,author.accessToken)).text();
            const editOperation=/<input(?=[^>]*name="operationId")[^>]*value="([^"]+)"/.exec(editorHtml)?.[1];
            assert.ok(editOperation);
            const editForm=new URLSearchParams({documentId:newDocument,operationId:editOperation,expectedRevision:'0',
              title:'Panel draft',body:'Test edited original text',sources:JSON.stringify([{rights:'original'}])});
            const saveFromPanel=(token:string,operation=editOperation)=>fetch(web.url+'/dashboard/editorial/save',{
              method:'POST',redirect:'manual',headers:{Cookie:'__Host-ghahvehto-access='+token,Origin:'https://panel.example.test'},
              body:new URLSearchParams({...Object.fromEntries(editForm),operationId:operation}),
            });
            assert.equal((await saveFromPanel(consumer.accessToken)).status,409);
            const edits=await Promise.all([saveFromPanel(author.accessToken),saveFromPanel(author.accessToken)]);
            assert.deepEqual(edits.map(response=>response.status),[303,303]);
            assert.equal(edits[0].headers.get('location'),edits[1].headers.get('location'));
            assert.equal((await saveFromPanel(author.accessToken,randomUUID())).status,409);
            assert.equal((await db.query('SELECT 1 FROM content_revisions WHERE document_id=$1',[newDocument])).rowCount,1);
            const denied=await (await page('',consumer.accessToken)).text();
            assert.match(denied,/مجوز ویرایشگر ندارید/);
            assert.ok(!denied.includes(revision.title));
            assert.match(await (await page('')).text(),/به نشست معتبر نیاز دارید/);
          } finally {await web.close();}
          for(let i=0;i<21;i++){
            assert.equal((await post('documents',{documentId:randomUUID(),slug:'test-list-'+randomBytes(8).toString('hex')},author.accessToken)).status,201);
          }
          const firstPage=await (await get('documents',author.accessToken)).json() as {items:{documentId:string;revision:number;revisionId:string|null}[];nextCursor:string};
          assert.equal(firstPage.items.length,20);
          const secondPage=await (await get('documents?after='+firstPage.nextCursor,author.accessToken)).json() as typeof firstPage;
          assert.equal(secondPage.items.length,3);
          assert.equal(secondPage.nextCursor,null);
          const all=[...firstPage.items,...secondPage.items];
          assert.equal(new Set(all.map(item=>item.documentId)).size,23);
          assert.equal(all.filter(item=>item.revision===0&&item.revisionId===null).length,21);
          const revisionPath='revisions/'+receipt.id;
          assert.equal((await get(revisionPath)).status,401);
          assert.equal((await get(revisionPath,consumer.accessToken)).status,403);
          assert.equal((await get('revisions/'+randomUUID(),author.accessToken)).status,404);
          const subject=await get(revisionPath,reviewerSession.accessToken);
          assert.equal(subject.status,200);
          assert.equal(subject.headers.get('cache-control'),'no-store');
          const {rows:[expected]}=await db.query("SELECT encode(public.operation_subject_hash(NULL,$1),'hex') AS hash",[receipt.id]);
          const draft=await subject.json() as {body:string;payloadHash:string};
          assert.equal(draft.body,revision.body);
          assert.equal(draft.payloadHash,expected.hash);
          const adminSession=await sessions.issue(admin);
          assert.equal((await get('jobs')).status,401);
          assert.equal((await get('jobs',author.accessToken)).status,403);
          assert.equal((await get('jobs?after='+randomUUID(),adminSession.accessToken)).status,400);
          for(let i=0;i<21;i++){
            await queue('research');
            const leased=await take('research');
            assert.ok(leased);
            assert.equal(await move(leased,'complete',{draft:'TEST queue listing'}),true);
          }
          const pending=await get('jobs',adminSession.accessToken);
          assert.equal(pending.headers.get('cache-control'),'no-store');
          const firstJobs=await pending.json() as {items:{jobId:string}[];nextCursor:string};
          assert.equal(firstJobs.items.length,20);
          const remainingJobs=await (await get('jobs?after='+firstJobs.nextCursor,adminSession.accessToken)).json() as typeof firstJobs;
          assert.ok(remainingJobs.items.length>0);
          const allJobs=[...firstJobs.items,...remainingJobs.items];
          assert.equal(new Set(allJobs.map(item=>item.jobId)).size,allJobs.length);
          const reviewedJob=firstJobs.items[0].jobId;
          assert.equal((await post('reviews',{jobId:reviewedJob,operationId:randomUUID(),decision:'rejected',
            lifetimeSeconds:60,reason:'TEST removed from pending queue'},adminSession.accessToken)).status,201);
          const refreshed=await (await get('jobs',adminSession.accessToken)).json() as typeof firstJobs;
          assert.ok(!refreshed.items.some(item=>item.jobId===reviewedJob));
          const {rows:[job]}=await db.query("SELECT id FROM agent_jobs WHERE state='awaiting_review' LIMIT 1");
          assert.ok(job);
          assert.equal((await get('jobs/'+job.id,author.accessToken)).status,403);
          assert.equal((await get('jobs/'+job.id,adminSession.accessToken)).status,200);
          assert.equal((await get('jobs/'+randomUUID(),adminSession.accessToken)).status,404);
          const review={revisionId:receipt.id,operationId:randomUUID(),decision:'approved',lifetimeSeconds:60,reason:'Test independent review'};
          assert.equal((await post('reviews',review,author.accessToken)).status,403);
          assert.equal((await post('reviews',review,reviewerSession.accessToken)).status,201);
          await sessions.revoke(reviewerSession.accessToken);
          assert.equal((await get(revisionPath,reviewerSession.accessToken)).status,401);
          assert.equal((await post('reviews',review,reviewerSession.accessToken)).status,401);
          const put=(path:string,input:object,token:string)=>fetch(origin+'/v1/internal/editorial/'+path,{
            method:'PUT',headers:{'content-type':'application/json',authorization:'Bearer '+token},
            body:JSON.stringify(input),
          });
          const assignment={userId:consumerId,role:'editor',enabled:true,reason:'Test delegated editor'};
          assert.equal((await put('roles',assignment,author.accessToken)).status,403);
          assert.equal((await put('roles',{...assignment,role:'admin'},adminSession.accessToken)).status,400);
          assert.deepEqual(await (await put('roles',assignment,adminSession.accessToken)).json(),{changed:true});
          assert.deepEqual(await (await put('roles',assignment,adminSession.accessToken)).json(),{changed:false});
          assert.equal((await get(revisionPath,consumer.accessToken)).status,200);
          assert.deepEqual(await (await put('roles',{...assignment,enabled:false},adminSession.accessToken)).json(),{changed:true});
          assert.equal((await get(revisionPath,consumer.accessToken)).status,403);
          const control={kind:'content',paused:true,attemptLimit:4,reason:'Test draft control change'};
          assert.equal((await put('controls',control,author.accessToken)).status,403);
          assert.equal((await put('controls',{...control,kind:'outreach'},adminSession.accessToken)).status,400);
          assert.deepEqual(await (await put('controls',control,adminSession.accessToken)).json(),{changed:true});
          assert.deepEqual(await (await put('controls',control,adminSession.accessToken)).json(),{changed:false});
          const changes=await db.query("SELECT action FROM audit_events WHERE actor_id=$1 AND action IN ('operations.role_changed','agent.control_changed') ORDER BY action",[admin]);
          assert.deepEqual(changes.rows.map(row=>row.action),['agent.control_changed','operations.role_changed','operations.role_changed']);
          const request={kind:'research',operationId:randomUUID(),title:'Test research',body:'Test source text',sources:[{rights:'original'}]};
          assert.equal((await post('jobs',request,author.accessToken)).status,403);
          assert.equal((await post('jobs',{...request,kind:'outreach'},adminSession.accessToken)).status,400);
          assert.equal((await post('jobs',{...request,sources:[{rights:'unknown'}]},adminSession.accessToken)).status,400);
          const submissions=await Promise.all([post('jobs',request,adminSession.accessToken),post('jobs',request,adminSession.accessToken)]);
          assert.deepEqual(submissions.map(response=>response.status),[201,201]);
          const [submitted,replayed]=await Promise.all(submissions.map(response=>response.json())) as {id:string}[];
          assert.deepEqual(submitted,replayed);
          assert.equal((await post('jobs',{...request,body:'Changed text'},adminSession.accessToken)).status,409);
          await put('roles',{...assignment,role:'operator'},adminSession.accessToken);
          assert.equal((await post('jobs',request,consumer.accessToken)).status,409);
          const submittedAudit=await db.query("SELECT 1 FROM audit_events WHERE action='agent.draft_submitted' AND actor_id=$1 AND metadata->>'jobId'=$2",[admin,submitted.id]);
          assert.equal(submittedAudit.rowCount,1);
          const leased=await take('research');
          assert.equal(leased?.jobId,submitted.id);
          assert.ok(leased);
          assert.equal(await move(leased,'complete',{draft:'Test private result'}),true);
          const {rows:[audit]}=await db.query("SELECT actor_id FROM audit_events WHERE action='content.revised' AND metadata->>'revisionId'=$1",[receipt.id]);
          assert.equal(audit.actor_id,editor);
        } finally {await app.close();}
      } finally {
        await editorialPool.end();
        await db.query(`DROP ROLE ${login}`);
      }
    });

    await t.test('CMS revisions preserve source evidence, reject stale edits and require independent reviewer authority',async()=>{

      const {rows:[doc]}=await db.query('INSERT INTO content_documents(slug) VALUES($1) RETURNING id',['test-'+randomBytes(8).toString('hex')]);
      const operation=randomUUID(),args=[editor,doc.id,0,operation,'پیش‌نویس آزمایشی','متن مصنوعی فقط در آزمون',sources];
      await assert.rejects(db.query(save,[consumer,...args.slice(1)]),{code:'42501'});
      await assert.rejects(db.query(save,[...args.slice(0,6),JSON.stringify([{rights:'unknown',url:'https://example.invalid'}])]),{code:'22023'});
      const saved=await Promise.all([db.query(save,args),db.query(save,args)]);assert.deepEqual(saved[0].rows,saved[1].rows);
      const id=saved[0].rows[0].id;
      await assert.rejects(db.query(save,[...args.slice(0,5),'TEST changed body',sources]),{code:'23505'});
      await assert.rejects(db.query(save,[editor,doc.id,0,randomUUID(),args[4],args[5],sources]),{code:'40001'});
      await assert.rejects(db.query(review,[editor,null,id,randomUUID(),'approved',3600,'TEST self review']),{code:'42501'});
      await assert.rejects(db.query(review,[consumer,null,id,randomUUID(),'approved',3600,'TEST unassigned']),{code:'42501'});
      const rargs=[reviewer,null,id,randomUUID(),'approved',3600,'TEST independent evidence review'];
      const decisions=await Promise.all([db.query(review,rargs),db.query(review,rargs)]);assert.deepEqual(decisions[0].rows,decisions[1].rows);
      const rid=decisions[0].rows[0].id,digest=(await db.query(hash,[null,id])).rows[0].hash;
      assert.deepEqual((await db.query(usable,[rid,digest])).rows,[{usable:true}]);
      assert.deepEqual((await db.query(usable,[rid,randomBytes(32)])).rows,[{usable:false}]);
      await assert.rejects(db.query(review,[...rargs.slice(0,5),7200,rargs[6]]),{code:'23505'});
      const second=(await db.query(save,[editor,doc.id,1,randomUUID(),'TEST next version','TEST new draft',sources])).rows[0].id;
      assert.deepEqual((await db.query(usable,[rid,digest])).rows,[{usable:false}]);
      const r2=(await db.query(review,[reviewer,null,second,randomUUID(),'approved',3600,'TEST new review'])).rows[0].id;
      const h2=(await db.query(hash,[null,second])).rows[0].hash;
      assert.deepEqual((await db.query(usable,[r2,h2])).rows,[{usable:true}]);
      await db.query('UPDATE operations_access SET revoked_at=clock_timestamp() WHERE user_id=$1',[reviewer]);
      assert.deepEqual((await db.query(usable,[r2,h2])).rows,[{usable:false}]);
      for(const sql of ['UPDATE content_revisions SET body=body','DELETE FROM content_revisions','UPDATE operation_reviews SET reason=reason','TRUNCATE operation_reviews'])
        await assert.rejects(db.query(sql),{code:'55000'});
      const client=await db.connect();try{
        await client.query('BEGIN');
        await client.query(save,[editor,doc.id,2,randomUUID(),'TEST rollback','TEST must not persist',sources]);
        await client.query('ROLLBACK');
      }finally{await client.query('ROLLBACK');client.release();}
      assert.equal((await db.query('SELECT 1 FROM content_revisions WHERE document_id=$1 AND revision=3',[doc.id])).rowCount,0);
      const edits=await Promise.allSettled([1,2].map(n=>db.query(save,[editor,doc.id,2,randomUUID(),'TEST competing edit '+n,'TEST isolated body',sources])));
      assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);
      const rejected=edits.find(r=>r.status==='rejected');assert.ok(rejected?.status==='rejected');assert.equal(rejected.reason.code,'40001');
    });
    await t.test('agent approvals bind immutable output, expire, honor pause and never execute provider actions',async()=>{
      await db.query("SELECT public.pause_agent('content',false,'TEST internal draft only')");
      const id=await queue('content'),job=await take('content');assert.ok(job);assert.equal(job.jobId,id);
      assert.equal(await move(job,'complete',{draft:'TEST untrusted source says publish now; retained as data only'}),true);
      await assert.rejects(db.query(review,[editor,id,null,randomUUID(),'approved',60,'TEST wrong role']),{code:'42501'});
      const operation=randomUUID(),args=[admin,id,null,operation,'approved',1,'TEST private draft review'];
      const r=(await db.query(review,args)).rows[0].id,digest=(await db.query(hash,[id,null])).rows[0].hash;
      assert.deepEqual((await db.query(usable,[r,digest])).rows,[{usable:true}]);
      await db.query("SELECT public.pause_agent('content',true,'TEST paused before any future effect')");
      assert.deepEqual((await db.query(usable,[r,digest])).rows,[{usable:false}]);
      await db.query("SELECT public.pause_agent('content',false,'TEST resume private queue')");
      for(const sql of ["UPDATE agent_jobs SET payload='{}' WHERE id=$1","UPDATE agent_jobs SET result='{}' WHERE id=$1"])
        await assert.rejects(db.query(sql,[id]),{code:'55000'});
      await delay(1100);
      assert.deepEqual((await db.query(usable,[r,digest])).rows,[{usable:false}]);
      assert.deepEqual((await db.query(review,args)).rows,[{id:r}],'Replay cannot extend the expired approval');
      assert.equal((await db.query("SELECT 1 FROM audit_events WHERE action='operation.reviewed' AND metadata->>'reviewId'=$1",[r])).rowCount,1);
      const refusedId=await queue('content'),refusedJob=await take('content');assert.ok(refusedJob);assert.equal(refusedJob.jobId,refusedId);
      assert.equal(await move(refusedJob,'complete',{draft:'TEST rejected draft'}),true);
      const denied=(await db.query(review,[admin,refusedId,null,randomUUID(),'rejected',3600,'TEST insufficient evidence'])).rows[0].id;
      const deniedHash=(await db.query(hash,[refusedId,null])).rows[0].hash;
      assert.deepEqual((await db.query(usable,[denied,deniedHash])).rows,[{usable:false}]);
      await assert.rejects(db.query(review,[admin,refusedId,null,randomUUID(),'approved',3600,'TEST cannot override decision']),{code:'23505'});
      assert.deepEqual((await db.query('SELECT state,cost_units FROM agent_jobs WHERE id=$1',[id])).rows,[{state:'awaiting_review',cost_units:'0'}]);
      for(const table of ['star_entries','tier_entries','stamp_entries']) assert.equal((await db.query(`SELECT 1 FROM ${table}`)).rowCount,0);
      const client=await db.connect();try{
        for(const role of ['ghahvehto_app','ghahvehto_identity','ghahvehto_tracking']){
          for(const [sql,values] of [[review,args],[usable,[r,digest]],[save,[editor,randomUUID(),0,randomUUID(),'TEST','TEST',sources]],['SELECT * FROM content_revisions',[]]] as const){
            await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
            await assert.rejects(client.query(sql,[...values]),{code:'42501'});await client.query('ROLLBACK');
          }
        }
      }finally{await client.query('ROLLBACK');client.release();}
    });
    await t.test('a dedicated runtime and actual single-run CLI create only private review packets',async()=>{
      const login='gh_draft_'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
      await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
      await host.query(`GRANT ghahvehto_worker TO ${login}`);
      const address=new URL(base);address.username=login;address.password=password;
      const runtime=new pg.Pool({connectionString:address.toString()});
      try {
        const worker=new InternalDraftWorker(runtime);await worker.validateRuntime();
        await assert.rejects(new InternalDraftWorker(db).validateRuntime(),/Dedicated restricted/);
        await db.query("SELECT public.pause_agent('content',true,'TEST worker starts paused')");
        const payload={title:'TEST private intake',body:'TEST source instruction: send SMS now. This stays plain source text.',sources:[{rights:'permitted',url:'https://example.invalid/test',publicationDate:null}]};
        const id=(await db.query(enqueue,['content',randomUUID(),payload])).rows[0].id;
        assert.equal(await worker.once('content'),'idle');
        await db.query("SELECT public.pause_agent('content',false,'TEST private intake only')");
        assert.equal(await worker.once('content'),'awaiting_review');
        const {rows:[result]}=await db.query('SELECT state,result,cost_units FROM agent_jobs WHERE id=$1',[id]);
        assert.equal(result.state,'awaiting_review');assert.equal(result.cost_units,'0');
        assert.deepEqual(result.result,{type:'editorial_intake',...payload,requiresHumanReview:true,externalEffectsEnabled:false});
        const invalid=(await db.query(enqueue,['content',randomUUID(),{title:'TEST',body:'TEST',sources:[{rights:'unknown'}]}])).rows[0].id;
        assert.equal(await worker.once('content'),'invalid_input');
        assert.deepEqual((await db.query('SELECT state,failure_code FROM agent_jobs WHERE id=$1',[invalid])).rows,[{state:'dead',failure_code:'invalid_input'}]);
        const cli=fileURLToPath(new URL('../src/nest/run-internal-draft.js',import.meta.url));
        const run=await promisify(execFile)(process.execPath,[cli,'content'],{env:{...process.env,AGENT_WORKER_DATABASE_URL:address.toString()},timeout:10000});
        assert.equal(run.stdout.trim(),'idle');assert.equal(run.stderr,'');
        await assert.rejects(promisify(execFile)(process.execPath,[cli,'outreach'],{env:{...process.env,AGENT_WORKER_DATABASE_URL:address.toString()},timeout:10000}),{code:1});
        const client=await runtime.connect();try{
          for(const [sql,args] of [['SELECT * FROM users',[]],['SELECT * FROM agent_jobs',[]],
            [enqueue,['content',randomUUID(),{}]],[review,[admin,id,null,randomUUID(),'approved',60,'TEST forbidden']],
            [lease,['outreach',randomUUID(),60]],['SELECT public.lease_internal_draft($1,$2)',['outreach',randomUUID()]]] as const){
            await client.query('BEGIN');await client.query('SET LOCAL ROLE ghahvehto_worker');
            await assert.rejects(client.query(sql,[...args]),{code:'42501'});await client.query('ROLLBACK');
          }
        }finally{await client.query('ROLLBACK');client.release();}
      }finally {
        await runtime.end();await db.query(`DROP OWNED BY ${login}`);await host.query(`DROP ROLE ${login}`);
      }
    });
    await t.test('private operations panel enforces admin access and audits effective changes once',async()=>{
      const login='gh_ops_'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
      await host.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
      await host.query(`GRANT ghahvehto_editorial TO ${login}`);
      const address=new URL(base);address.username=login;address.password=password;
      const runtime=new pg.Pool({connectionString:address.toString()});
      try {
        const {app}=await createApp({editorialPool:runtime});
        try {
          await app.listen(0,'127.0.0.1');
          const sessions=new SessionService(db);
          const [adminSession,editorSession]=await Promise.all([sessions.issue(admin),sessions.issue(editor)]);
          const url=await app.getUrl();
          const get=(token:string)=>fetch(url+'/v1/internal/editorial/controls',{headers:{authorization:'Bearer '+token}});
          assert.equal((await get(editorSession.accessToken)).status,403);
          const controls=await (await get(adminSession.accessToken)).json() as {items:unknown[]};
          assert.equal(controls.items.length,4);
          const web=await startWebPanel(url,false,false,true);
          try {
            const page=(token:string)=>fetch(web.url+'/dashboard/editorial/operations',{headers:{Cookie:'__Host-ghahvehto-access='+token}});
            assert.match(await (await page(editorSession.accessToken)).text(),/مجوز مدیر ندارید/);
            const html=await (await page(adminSession.accessToken)).text();
            assert.match(html,/سقف تلاش کارهای تازه/);
            assert.ok(!html.includes(adminSession.accessToken));
            const submit=(action:string,body:URLSearchParams,token=adminSession.accessToken,origin='https://panel.example.test')=>fetch(
              web.url+'/dashboard/editorial/operations/'+action,{method:'POST',redirect:'manual',
                headers:{Cookie:'__Host-ghahvehto-access='+token,Origin:origin},body});
            const body=new URLSearchParams({kind:'research',paused:'true',attemptLimit:'7',reason:'TEST operations panel control'});
            assert.equal((await submit('control',body,adminSession.accessToken,'https://foreign.invalid')).status,403);
            assert.match((await submit('control',body,editorSession.accessToken)).headers.get('location')??'',/result=unconfirmed/);
            for(const response of await Promise.all([submit('control',body),submit('control',body)])) {
              assert.equal(response.status,303);
              assert.match(response.headers.get('location')??'',/result=saved/);
            }
            assert.deepEqual((await db.query("SELECT paused,attempt_limit FROM agent_controls WHERE kind='research'")).rows,
              [{paused:true,attempt_limit:7}]);
            assert.equal((await db.query("SELECT 1 FROM audit_events WHERE actor_id=$1 AND action='agent.control_changed' AND reason=$2",
              [admin,'TEST operations panel control'])).rowCount,1);
            const target=await user(),roleForm=new URLSearchParams({userId:target,role:'editor',enabled:'true',reason:'TEST operations panel role'});
            for(const response of await Promise.all([submit('role',roleForm),submit('role',roleForm)])) {
              assert.match(response.headers.get('location')??'',/result=saved/);
            }
            assert.equal((await db.query('SELECT 1 FROM operations_access WHERE user_id=$1 AND role=$2 AND revoked_at IS NULL',[target,'editor'])).rowCount,1);
            roleForm.set('enabled','false');
            await submit('role',roleForm);
            assert.equal((await db.query('SELECT 1 FROM operations_access WHERE user_id=$1 AND role=$2 AND revoked_at IS NOT NULL',[target,'editor'])).rowCount,1);
            roleForm.set('role','admin');
            assert.equal((await submit('role',roleForm)).status,400);
            body.set('kind','outreach');
            assert.equal((await submit('control',body)).status,400);
            roleForm.set('role','operator');roleForm.set('enabled','true');
            await submit('role',roleForm);
            const operatorSession=await sessions.issue(target);
            const intakePage=await fetch(web.url+'/dashboard/editorial/submit',{headers:{Cookie:'__Host-ghahvehto-access='+operatorSession.accessToken}});
            const intakeHtml=await intakePage.text();
            assert.match(intakeHtml,/ثبت پیش‌نویس برای پردازش داخلی/);
            const submissionOperation=/<input(?=[^>]*name="operationId")[^>]*value="([^"]+)"/.exec(intakeHtml)?.[1];
            assert.ok(submissionOperation);
            const intake=new URLSearchParams({kind:'research',operationId:submissionOperation,title:'TEST intake',
              body:'TEST supplied text',sources:JSON.stringify([{rights:'original'}])});
            const sendDraft=(token=operatorSession.accessToken,origin='https://panel.example.test')=>fetch(web.url+'/dashboard/editorial/submit/send',{
              method:'POST',redirect:'manual',headers:{Cookie:'__Host-ghahvehto-access='+token,Origin:origin},body:intake,
            });
            assert.equal((await sendDraft(operatorSession.accessToken,'https://foreign.invalid')).status,403);
            assert.match((await sendDraft(editorSession.accessToken)).headers.get('location')??'',/result=unconfirmed/);
            for(const sent of await Promise.all([sendDraft(),sendDraft()])) {
              assert.equal(sent.status,303);
              assert.match(sent.headers.get('location')??'',/result=saved/);
            }
            const getSubmission=(token:string)=>fetch(url+'/v1/internal/editorial/submissions/'+submissionOperation,
              {headers:{authorization:'Bearer '+token}});
            const initial=await (await getSubmission(operatorSession.accessToken)).json() as {jobId:string;state:string;paused:boolean};
            assert.equal(initial.state,'queued');assert.equal(initial.paused,true);
            assert.equal((await getSubmission(adminSession.accessToken)).status,404);
            assert.equal((await getSubmission(editorSession.accessToken)).status,403);
            assert.equal((await db.query('SELECT 1 FROM agent_jobs WHERE operation_id=$1',[submissionOperation])).rowCount,1);
            const statusHtml=await (await fetch(web.url+'/dashboard/editorial/submit?operation='+submissionOperation,
              {headers:{Cookie:'__Host-ghahvehto-access='+operatorSession.accessToken}})).text();
            assert.match(statusHtml,/در صف/);assert.match(statusHtml,/متوقف/);
            roleForm.set('enabled','false');
            await submit('role',roleForm);
            assert.equal((await getSubmission(operatorSession.accessToken)).status,403);
          } finally {await web.close();}
        } finally {await app.close();}
      } finally {await runtime.end();await host.query(`DROP ROLE ${login}`);}
    });
  }finally {
    await pool?.end();if(created)for(let attempt=0;;attempt++){
      try{await host.query(`DROP DATABASE ${database}`);break;}
      catch(error){if((error as pg.DatabaseError).code!=='55006'||attempt>=19)throw error;await delay(50);}
    }
    await host.end();
  }
});
