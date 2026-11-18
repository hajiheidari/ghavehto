-- Keep expired anti-abuse fingerprints out of the live quota table.
CREATE INDEX cafe_tracking_rate_limits_expiry
  ON public.cafe_tracking_rate_limits(window_started_at,visitor_hash);

CREATE FUNCTION public.prune_expired_tracking_buckets()
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  cutoff timestamptz := clock_timestamp()-interval '1 hour';
  removed integer;
BEGIN
  WITH expired AS (
    SELECT visitor_hash FROM public.cafe_tracking_rate_limits
      WHERE window_started_at<=cutoff
      ORDER BY window_started_at,visitor_hash LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.cafe_tracking_rate_limits q USING expired e
    WHERE q.visitor_hash=e.visitor_hash AND q.window_started_at<=cutoff;
  GET DIAGNOSTICS removed=ROW_COUNT;
  IF removed>0 THEN
    INSERT INTO public.audit_events(action,reason,metadata)
      VALUES('tracking.rate_limits_pruned','Expired tracking quota buckets',
        jsonb_build_object('removed',removed));
  END IF;
  RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.prune_expired_tracking_buckets() FROM PUBLIC;
