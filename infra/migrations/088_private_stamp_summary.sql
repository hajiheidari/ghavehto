CREATE FUNCTION public.read_private_stamp_summary(token_hash bytea,target_cafe uuid,target_program uuid,target_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; checked_at timestamptz; required integer; available bigint;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  IF target_cafe IS NULL OR target_program IS NULL OR target_version IS NULL OR target_version<1 THEN
    RAISE EXCEPTION 'Invalid stamp scope' USING ERRCODE='22023';
  END IF;
  SELECT v.stamps_required INTO required FROM public.stamp_program_versions v
    WHERE v.cafe_id=target_cafe AND v.program_id=target_program AND v.version=target_version
    AND EXISTS(SELECT 1 FROM public.stamp_entries e WHERE e.user_id=actor AND e.cafe_id=v.cafe_id
      AND e.program_id=v.program_id AND e.program_version=v.version);
  IF required IS NULL THEN RETURN NULL; END IF;
  checked_at:=clock_timestamp();
  WITH journal AS (
    SELECT * FROM public.stamp_entries WHERE user_id=actor AND cafe_id=target_cafe
      AND program_id=target_program AND program_version=target_version AND effective_at<=checked_at
  ), invalid AS (
    SELECT 1 FROM journal e WHERE
      ((e.kind IN ('spend','expire') OR (e.kind='reversal' AND e.units<0)) AND (
        -e.units<>coalesce((SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.debit_id=e.id),0)
        OR EXISTS(SELECT 1 FROM public.stamp_spend_allocations a JOIN public.stamp_entries w ON w.id=a.award_id
          WHERE a.debit_id=e.id AND (w.kind<>'award' OR w.user_id<>actor OR w.cafe_id<>target_cafe
            OR w.program_id<>target_program OR w.program_version<>target_version OR w.effective_at>e.effective_at
            OR (e.kind='reversal' AND e.units<0 AND w.id<>e.reversal_of)
            OR (e.kind='spend' AND w.expires_at<=e.effective_at)
            OR (e.kind='expire' AND (w.expires_at IS NULL OR w.expires_at>e.effective_at))))))
      OR (e.kind='reversal' AND e.units>0 AND NOT EXISTS(
        SELECT 1 FROM public.stamp_spend_reversal_links l JOIN journal d ON d.id=e.reversal_of
          WHERE l.reversal_id=e.id AND d.kind='spend' AND d.units=-e.units AND d.effective_at<=e.effective_at))
    UNION ALL
    SELECT 1 FROM journal w JOIN public.stamp_lot_movements m ON m.award_id=w.id
      JOIN public.stamp_entries d ON d.id=m.debit_id WHERE w.kind='award' AND d.effective_at<=checked_at
      AND (d.user_id<>actor OR d.cafe_id<>target_cafe OR d.program_id<>target_program OR d.program_version<>target_version)
  ), lots AS (
    SELECT e.expires_at,e.units,e.units-coalesce((SELECT sum(m.units) FROM public.stamp_lot_movements m
      JOIN public.stamp_entries d ON d.id=m.debit_id WHERE m.award_id=e.id AND d.effective_at<=checked_at),0) AS remaining
      FROM journal e WHERE e.kind='award'
  )
  SELECT CASE WHEN EXISTS(SELECT 1 FROM invalid) OR EXISTS(SELECT 1 FROM lots WHERE remaining<0 OR remaining>units)
    THEN NULL ELSE coalesce(sum(remaining) FILTER(WHERE expires_at IS NULL OR expires_at>checked_at),0) END
    INTO available FROM lots;
  RETURN jsonb_build_object('cafeId',target_cafe,'programId',target_program,'programVersion',target_version,
    'stampsRequired',required,'availableUnits',available::text,'asOf',checked_at);
END $$;
REVOKE ALL ON FUNCTION public.read_private_stamp_summary(bytea,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_stamp_summary(bytea,uuid,uuid,integer) TO ghahvehto_loyalty_reader;
