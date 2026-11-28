CREATE INDEX agent_jobs_private_review_page ON public.agent_jobs(id) WHERE state='awaiting_review';

CREATE FUNCTION public.list_private_agent_reviews(token_hash bytea,after_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; result jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  PERFORM 1 FROM public.operations_access WHERE user_id=actor ORDER BY role FOR SHARE;
  IF NOT public.operations_authorized(actor,'admin') THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';
  END IF;
  IF after_job IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.agent_jobs WHERE id=after_job) THEN
    RAISE EXCEPTION 'Invalid agent review cursor' USING ERRCODE='22023';
  END IF;
  WITH candidates AS (
    SELECT j.id,j.kind,j.created_at,c.paused FROM public.agent_jobs j
    JOIN public.agent_controls c ON c.kind=j.kind
    WHERE j.state='awaiting_review' AND (after_job IS NULL OR j.id>after_job)
      AND NOT EXISTS(SELECT 1 FROM public.operation_reviews r WHERE r.job_id=j.id)
    ORDER BY j.id LIMIT 21
  ), numbered AS (
    SELECT *,row_number() OVER(ORDER BY id) AS position FROM candidates
  )
  SELECT jsonb_build_object('items',coalesce(jsonb_agg(
    jsonb_build_object('jobId',id,'kind',kind,'createdAt',created_at,'paused',paused)
    ORDER BY id) FILTER(WHERE position<=20),'[]'::jsonb),
    'nextCursor',CASE WHEN count(*)>20 THEN (array_agg(id) FILTER(WHERE position=20))[1] END)
    INTO result FROM numbered;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_private_agent_reviews(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_private_agent_reviews(bytea,uuid) TO ghahvehto_editorial;
