-- Dedicated capability: no identity/session, table read or activation authority.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_tracking') THEN
    CREATE ROLE ghahvehto_tracking NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_tracking;
CREATE TABLE public.cafe_tracking_rate_limits (
  visitor_hash bytea PRIMARY KEY CHECK(octet_length(visitor_hash)=32),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 30)
);
CREATE TABLE public.cafe_tracking_consents (
  operation_id uuid PRIMARY KEY REFERENCES public.cafe_tracking_touches(operation_id),
  visitor_hash bytea NOT NULL CHECK(octet_length(visitor_hash)=32),
  policy_version integer NOT NULL DEFAULT 1 CHECK(policy_version=1),
  consented_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER cafe_tracking_consents_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cafe_tracking_consents
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.cafe_tracking_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_tracking_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cafe_tracking_rate_limits,public.cafe_tracking_consents FROM PUBLIC;

CREATE FUNCTION public.record_consented_cafe_touch(hashed_code bytea,event_kind text,operation uuid,visitor bytea,consented boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.cafe_tracking_consents%ROWTYPE;
  bucket public.cafe_tracking_rate_limits%ROWTYPE;
  checked_at timestamptz;
  receipt uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Tracking requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF consented IS DISTINCT FROM true OR visitor IS NULL OR octet_length(visitor)<>32
    OR operation IS NULL THEN RAISE EXCEPTION 'Explicit tracking consent required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cafe-tracking-touch:'||operation::text,0));
  SELECT * INTO prior FROM public.cafe_tracking_consents WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.visitor_hash<>visitor THEN RAISE EXCEPTION 'Tracking operation already used' USING ERRCODE='23505'; END IF;
    -- Existing touch verifies exact code and event, without consuming the quota again.
    RETURN jsonb_build_object('state','recorded','touchId',public.record_cafe_tracking_touch(hashed_code,event_kind,operation));
  END IF;
  -- One server-HMAC bucket across all links and event kinds; forwarded IPs are not trusted.
  PERFORM pg_advisory_xact_lock(hashtextextended('cafe-tracking-rate:'||encode(visitor,'hex'),0));
  checked_at:=clock_timestamp();
  SELECT * INTO bucket FROM public.cafe_tracking_rate_limits WHERE visitor_hash=visitor FOR UPDATE;
  IF FOUND AND bucket.window_started_at>checked_at-interval '1 hour' AND bucket.attempts>=30 THEN
    RETURN jsonb_build_object('state','limited');
  END IF;
  INSERT INTO public.cafe_tracking_rate_limits(visitor_hash,window_started_at,attempts) VALUES(visitor,checked_at,1)
    ON CONFLICT(visitor_hash) DO UPDATE SET
      window_started_at=CASE WHEN cafe_tracking_rate_limits.window_started_at<=checked_at-interval '1 hour' THEN checked_at ELSE cafe_tracking_rate_limits.window_started_at END,
      attempts=CASE WHEN cafe_tracking_rate_limits.window_started_at<=checked_at-interval '1 hour' THEN 1 ELSE cafe_tracking_rate_limits.attempts+1 END;
  BEGIN
    receipt:=public.record_cafe_tracking_touch(hashed_code,event_kind,operation);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    -- Persist the abuse budget even when an inactive/unknown link is submitted.
    RETURN jsonb_build_object('state','unavailable');
  END;
  INSERT INTO public.cafe_tracking_consents(operation_id,visitor_hash) VALUES(operation,visitor);
  RETURN jsonb_build_object('state','recorded','touchId',receipt);
END $$;
REVOKE ALL ON FUNCTION public.record_consented_cafe_touch(bytea,text,uuid,bytea,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_consented_cafe_touch(bytea,text,uuid,bytea,boolean) TO ghahvehto_tracking;
