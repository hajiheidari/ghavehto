CREATE FUNCTION public.read_private_draft_submission(token_hash bytea,operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; receipt jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  PERFORM 1 FROM public.operations_access WHERE user_id=actor ORDER BY role FOR SHARE;
  IF NOT public.operations_authorized(actor,'operator') THEN
    RAISE EXCEPTION 'Operator required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('jobId',j.id,'kind',j.kind,'state',j.state,'attempts',j.attempts,
    'attemptLimit',j.attempt_limit,'paused',c.paused,'createdAt',j.created_at)
    INTO receipt FROM public.agent_jobs j JOIN public.private_draft_submissions s ON s.job_id=j.id AND s.submitted_by=actor
    JOIN public.agent_controls c ON c.kind=j.kind WHERE j.operation_id=operation;
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.read_private_draft_submission(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_draft_submission(bytea,uuid) TO ghahvehto_editorial;
