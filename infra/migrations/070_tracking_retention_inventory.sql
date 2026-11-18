-- Planning only. This cutoff neither authorizes deletion nor changes attribution.
CREATE FUNCTION public.inspect_tracking_retention(cutoff timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE report jsonb;
BEGIN
  IF cutoff IS NULL OR NOT isfinite(cutoff) OR cutoff>statement_timestamp() THEN
    RAISE EXCEPTION 'A finite historical cutoff is required' USING ERRCODE='22023';
  END IF;
  WITH old_touches AS (
    SELECT t.id,t.operation_id,t.recorded_at,l.attribution_window_seconds
    FROM public.cafe_tracking_touches t JOIN public.cafe_tracking_links l ON l.id=t.link_id
    WHERE t.recorded_at<cutoff
  ), identity_refs AS (
    SELECT f.touch_id,count(*) AS total
    FROM public.cafe_tracking_identity_facts f JOIN old_touches t ON t.id=f.touch_id GROUP BY f.touch_id
  ), interaction_refs AS (
    SELECT i.touch_id,count(*) AS total
    FROM public.cafe_tracking_interactions i JOIN old_touches t ON t.id=i.touch_id GROUP BY i.touch_id
  )
  SELECT jsonb_build_object(
    'touches',count(*),
    'withinAttributionWindow',count(*) FILTER (WHERE t.recorded_at+t.attribution_window_seconds*interval '1 second'>statement_timestamp()),
    'consentReceipts',count(c.operation_id),
    'legacyConsentReceipts',count(*) FILTER (WHERE NOT c.operation_scoped),
    'touchesWithIdentityFacts',count(f.touch_id),
    'identityFacts',coalesce(sum(f.total),0),
    'touchesWithInteractions',count(i.touch_id),
    'interactions',coalesce(sum(i.total),0)
  ) INTO report
  FROM old_touches t
  LEFT JOIN public.cafe_tracking_consents c ON c.operation_id=t.operation_id
  LEFT JOIN identity_refs f ON f.touch_id=t.id
  LEFT JOIN interaction_refs i ON i.touch_id=t.id;
  RETURN report;
END $$;
REVOKE ALL ON FUNCTION public.inspect_tracking_retention(timestamptz) FROM PUBLIC;
