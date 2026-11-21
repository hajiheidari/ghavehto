CREATE TABLE public.private_draft_submissions (
  job_id uuid PRIMARY KEY REFERENCES public.agent_jobs(id),
  submitted_by uuid NOT NULL REFERENCES public.users(id)
);
REVOKE ALL ON public.private_draft_submissions FROM PUBLIC;

CREATE FUNCTION public.submit_private_draft(token_hash bytea, job_kind text, operation uuid, request jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; job uuid;
BEGIN
  actor := public.editorial_session_actor(token_hash);
  PERFORM 1 FROM public.operations_access WHERE user_id=actor ORDER BY role FOR SHARE;
  IF NOT public.operations_authorized(actor,'operator') THEN
    RAISE EXCEPTION 'Operator required' USING ERRCODE='42501';
  END IF;
  IF job_kind IS NULL OR job_kind NOT IN ('research','content') OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid private draft submission' USING ERRCODE='22023';
  END IF;

  -- Share the maintenance enqueue lock so another caller cannot claim an existing operation.
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-enqueue:'||operation::text,0));
  SELECT id INTO job FROM public.agent_jobs WHERE operation_id=operation;
  IF FOUND THEN
    IF NOT EXISTS(SELECT 1 FROM public.private_draft_submissions WHERE job_id=job AND submitted_by=actor) THEN
      RAISE EXCEPTION 'Agent operation already used' USING ERRCODE='23505';
    END IF;
    RETURN public.enqueue_agent_job(job_kind,operation,request);
  END IF;
  job := public.enqueue_agent_job(job_kind,operation,request);
  INSERT INTO public.private_draft_submissions(job_id,submitted_by) VALUES(job,actor);
  INSERT INTO public.audit_events(actor_id,action,reason,metadata)
    VALUES(actor,'agent.draft_submitted','Private draft intake',jsonb_build_object('jobId',job,'kind',job_kind));
  RETURN job;
END $$;
REVOKE ALL ON FUNCTION public.submit_private_draft(bytea,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_private_draft(bytea,text,uuid,jsonb) TO ghahvehto_editorial;
