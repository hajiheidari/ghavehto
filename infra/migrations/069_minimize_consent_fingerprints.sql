-- Existing immutable receipts retain their original replay semantics.
ALTER TABLE public.cafe_tracking_consents ADD COLUMN operation_scoped boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.cafe_tracking_consents.visitor_hash IS
  'Operation-scoped replay digest for new receipts; legacy rows contain the original rate-limit digest.';

CREATE OR REPLACE FUNCTION public.record_consented_cafe_touch(hashed_code bytea,event_kind text,operation uuid,visitor bytea,consented boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.cafe_tracking_consents%ROWTYPE;
  bucket public.cafe_tracking_rate_limits%ROWTYPE;
  checked_at timestamptz;
  receipt uuid;
  receipt_hash bytea;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Tracking requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF consented IS DISTINCT FROM true OR visitor IS NULL OR octet_length(visitor)<>32
    OR operation IS NULL THEN RAISE EXCEPTION 'Explicit tracking consent required' USING ERRCODE='22023'; END IF;
  receipt_hash:=sha256(convert_to('ghahvehto:tracking-consent:v1','UTF8')||uuid_send(operation)||visitor);
  PERFORM pg_advisory_xact_lock(hashtextextended('cafe-tracking-touch:'||operation::text,0));
  SELECT * INTO prior FROM public.cafe_tracking_consents WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.visitor_hash<>(CASE WHEN prior.operation_scoped THEN receipt_hash ELSE visitor END) THEN RAISE EXCEPTION 'Tracking operation already used' USING ERRCODE='23505'; END IF;
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
  INSERT INTO public.cafe_tracking_consents(operation_id,visitor_hash,operation_scoped) VALUES(operation,receipt_hash,true);
  RETURN jsonb_build_object('state','recorded','touchId',receipt);
END $$;
