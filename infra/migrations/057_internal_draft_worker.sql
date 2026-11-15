-- A narrow worker can process supplied local research/content into review packets.
-- It cannot enqueue, unpause, approve, publish, send, spend or read identity tables.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_worker') THEN
    CREATE ROLE ghahvehto_worker NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_worker;
CREATE FUNCTION public.lease_internal_draft(job_kind text,worker uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF job_kind IS NULL OR job_kind NOT IN ('research','content') THEN
    RAISE EXCEPTION 'External agent adapters are disabled' USING ERRCODE='42501'; END IF;
  RETURN public.lease_agent_job(job_kind,worker,60);
END $$;
CREATE FUNCTION public.finish_internal_draft(job uuid,worker uuid,token uuid,output jsonb)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.transition_agent_lease(job,worker,token,'complete',output);
$$;
CREATE FUNCTION public.fail_internal_draft(job uuid,worker uuid,token uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.transition_agent_lease(job,worker,token,'invalid_input',NULL);
$$;
REVOKE ALL ON FUNCTION public.lease_internal_draft(text,uuid),public.finish_internal_draft(uuid,uuid,uuid,jsonb),public.fail_internal_draft(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lease_internal_draft(text,uuid),public.finish_internal_draft(uuid,uuid,uuid,jsonb),public.fail_internal_draft(uuid,uuid,uuid) TO ghahvehto_worker;
