-- Internal deterministic queue only. No provider, spending or outreach execution.
CREATE TABLE public.agent_controls (
  kind text PRIMARY KEY CHECK(kind IN ('discovery','research','content','outreach')),
  paused boolean NOT NULL DEFAULT true,
  attempt_limit integer NOT NULL DEFAULT 3 CHECK(attempt_limit BETWEEN 1 AND 10)
);
CREATE TABLE public.agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  kind text NOT NULL REFERENCES public.agent_controls(kind),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536),
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','retry_wait','awaiting_review','dead')),
  attempt_limit integer NOT NULL CHECK(attempt_limit BETWEEN 1 AND 10),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND attempt_limit),
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  worker_id uuid,
  lease_token uuid,
  lease_until timestamptz,
  result jsonb CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND octet_length(result::text)<=65536)),
  failure_code text CHECK(failure_code IN ('transient','permanent','invalid_input','lease_expired')),
  cost_units bigint NOT NULL DEFAULT 0 CHECK(cost_units=0),
  CHECK((state='leased')=(worker_id IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK(state='leased' OR (worker_id IS NULL AND lease_token IS NULL AND lease_until IS NULL)),
  CHECK((state='awaiting_review')=(result IS NOT NULL))
);
CREATE INDEX agent_jobs_queue ON public.agent_jobs(kind,available_at,created_at,id) WHERE state IN ('queued','retry_wait','leased');
ALTER TABLE public.agent_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_controls,public.agent_jobs FROM PUBLIC;

CREATE FUNCTION public.enqueue_agent_job(job_kind text,operation uuid,request jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior public.agent_jobs%ROWTYPE; result uuid; attempts integer;
BEGIN
  IF operation IS NULL OR request IS NULL OR jsonb_typeof(request)<>'object' OR octet_length(request::text)>65536 THEN
    RAISE EXCEPTION 'Invalid agent request' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-enqueue:'||operation::text,0));
  SELECT * INTO prior FROM public.agent_jobs WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.kind=job_kind AND prior.payload=request THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Agent operation already used' USING ERRCODE='23505';
  END IF;
  SELECT attempt_limit INTO attempts FROM public.agent_controls WHERE kind=job_kind FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent not configured' USING ERRCODE='22023'; END IF;
  INSERT INTO public.agent_jobs(operation_id,kind,payload,attempt_limit) VALUES(operation,job_kind,request,attempts) RETURNING id INTO result;
  INSERT INTO public.audit_events(action,reason,metadata) VALUES('agent.queued','Internal zero-cost draft work',jsonb_build_object('jobId',result));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_agent_job(text,uuid,jsonb) FROM PUBLIC;

CREATE FUNCTION public.lease_agent_job(job_kind text,worker uuid,lifetime_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE job public.agent_jobs%ROWTYPE; paused boolean; checked_at timestamptz; token uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Agent leases require read committed isolation' USING ERRCODE='25000'; END IF;
  IF worker IS NULL OR lifetime_seconds IS NULL OR lifetime_seconds NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'Invalid agent lease' USING ERRCODE='22023'; END IF;
  SELECT c.paused INTO paused FROM public.agent_controls c WHERE kind=job_kind FOR SHARE;
  IF NOT FOUND OR paused THEN RETURN NULL; END IF;
  FOR job IN SELECT * FROM public.agent_jobs j WHERE j.kind=job_kind
    AND ((j.state IN ('queued','retry_wait') AND j.available_at<=clock_timestamp())
      OR (j.state='leased' AND j.lease_until<=clock_timestamp()))
    ORDER BY j.available_at,j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 100
  LOOP
    checked_at:=clock_timestamp();
    IF job.attempts>=job.attempt_limit THEN
      UPDATE public.agent_jobs SET state='dead',worker_id=NULL,lease_token=NULL,lease_until=NULL,failure_code='lease_expired' WHERE id=job.id;
      INSERT INTO public.audit_events(action,reason,metadata) VALUES('agent.dead','Lease attempt limit reached',jsonb_build_object('jobId',job.id));
      CONTINUE;
    END IF;
    token:=gen_random_uuid();
    UPDATE public.agent_jobs SET state='leased',attempts=attempts+1,worker_id=worker,lease_token=token,
      lease_until=checked_at+make_interval(secs=>lifetime_seconds),failure_code=NULL WHERE id=job.id;
    INSERT INTO public.audit_events(action,reason,metadata) VALUES('agent.leased','Bounded internal lease',jsonb_build_object('jobId',job.id,'attempt',job.attempts+1));
    RETURN jsonb_build_object('jobId',job.id,'kind',job.kind,'payload',job.payload,'leaseToken',token,'attempt',job.attempts+1);
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.lease_agent_job(text,uuid,integer) FROM PUBLIC;

-- token fencing is checked after both pause and job locks; stale workers cannot
-- extend, acknowledge, retry or finish a newly acquired lease.
CREATE FUNCTION public.transition_agent_lease(target_job uuid,worker uuid,token uuid,transition text,output jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE job public.agent_jobs%ROWTYPE; job_kind text; paused boolean; checked_at timestamptz;
BEGIN
  IF transition IS NULL OR transition NOT IN ('heartbeat','complete','transient','permanent','invalid_input') THEN
    RAISE EXCEPTION 'Invalid agent transition' USING ERRCODE='22023'; END IF;
  IF transition='complete' AND (output IS NULL OR jsonb_typeof(output)<>'object' OR octet_length(output::text)>65536) THEN
    RAISE EXCEPTION 'Invalid agent output' USING ERRCODE='22023'; END IF;
  SELECT kind INTO job_kind FROM public.agent_jobs WHERE id=target_job;
  SELECT c.paused INTO paused FROM public.agent_controls c WHERE kind=job_kind FOR SHARE;
  IF NOT FOUND OR paused THEN RETURN false; END IF;
  SELECT * INTO job FROM public.agent_jobs WHERE id=target_job FOR UPDATE;
  checked_at:=clock_timestamp();
  IF job.state<>'leased' OR worker IS NULL OR token IS NULL OR job.worker_id IS DISTINCT FROM worker
    OR job.lease_token IS DISTINCT FROM token OR job.lease_until<=checked_at THEN RETURN false; END IF;
  IF transition='heartbeat' THEN
    UPDATE public.agent_jobs SET lease_until=checked_at+interval '60 seconds' WHERE id=target_job;
    RETURN true;
  END IF;
  UPDATE public.agent_jobs SET state=CASE WHEN transition='complete' THEN 'awaiting_review'
      WHEN transition<>'transient' OR attempts>=attempt_limit THEN 'dead' ELSE 'retry_wait' END,
    result=CASE WHEN transition='complete' THEN output END,
    failure_code=CASE WHEN transition<>'complete' THEN transition END,
    available_at=checked_at+make_interval(secs=>least(3600,5*(2^job.attempts)::integer)),
    worker_id=NULL,lease_token=NULL,lease_until=NULL WHERE id=target_job;
  INSERT INTO public.audit_events(action,reason,metadata) VALUES('agent.transitioned','Internal worker transition',jsonb_build_object('jobId',target_job,'transition',transition));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.transition_agent_lease(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;

CREATE FUNCTION public.pause_agent(job_kind text,should_pause boolean,explanation text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF should_pause IS NULL OR explanation IS NULL OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Agent pause requires reason' USING ERRCODE='22023'; END IF;
  UPDATE public.agent_controls SET paused=should_pause WHERE kind=job_kind;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent not configured' USING ERRCODE='22023'; END IF;
  INSERT INTO public.audit_events(action,reason,metadata) VALUES('agent.pause_changed',btrim(explanation),jsonb_build_object('kind',job_kind,'paused',should_pause));
END $$;
REVOKE ALL ON FUNCTION public.pause_agent(text,boolean,text) FROM PUBLIC;
