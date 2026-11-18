CREATE INDEX experience_claims_receipt_history
  ON public.experience_claims(user_id,claimed_at DESC,id DESC);

CREATE FUNCTION public.list_private_experience_reservations(token_hash bytea, after_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; boundary public.experience_claims%ROWTYPE; result jsonb;
BEGIN
  actor := public.editorial_session_actor(token_hash);
  IF after_operation IS NOT NULL THEN
    SELECT * INTO boundary FROM public.experience_claims WHERE operation_id=after_operation AND user_id=actor;
    IF NOT FOUND THEN RAISE EXCEPTION 'Receipt cursor unavailable' USING ERRCODE='22023'; END IF;
  END IF;
  WITH candidates AS (
    SELECT id,operation_id,experience_id,cafe_id,claimed_at
    FROM public.experience_claims
    WHERE user_id=actor AND (after_operation IS NULL OR (claimed_at,id)<(boundary.claimed_at,boundary.id))
    ORDER BY claimed_at DESC,id DESC LIMIT 21
  ), numbered AS (
    SELECT *,row_number() OVER(ORDER BY claimed_at DESC,id DESC) AS position FROM candidates
  )
  SELECT jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object('operationId',n.operation_id,'title',e.title,'claimedAt',n.claimed_at,
      'state',CASE WHEN x.id IS NOT NULL THEN 'cancelled' WHEN f.id IS NOT NULL THEN 'fulfilled' ELSE 'reserved' END)
      ORDER BY n.position) FILTER(WHERE n.position<=20),'[]'::jsonb),
    'nextCursor',CASE WHEN count(*)>20 THEN (array_agg(n.operation_id) FILTER(WHERE n.position=20))[1] END
  ) INTO result
  FROM numbered n JOIN public.experiences e ON e.id=n.experience_id AND e.cafe_id=n.cafe_id
  LEFT JOIN public.experience_cancellations x ON x.claim_id=n.id
  LEFT JOIN public.experience_fulfillments f ON f.claim_id=n.id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_private_experience_reservations(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_private_experience_reservations(bytea,uuid) TO ghahvehto_participation;
