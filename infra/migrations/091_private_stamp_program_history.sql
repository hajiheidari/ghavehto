CREATE INDEX stamp_entries_program_history_idx ON public.stamp_entries
  (user_id,cafe_id,program_id,program_version,recorded_at DESC,id DESC);

CREATE FUNCTION public.read_private_stamp_program_history(token_hash bytea,target_cafe uuid,target_program uuid,
  target_version integer,after_entry uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; cursor_time timestamptz; records jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  IF target_cafe IS NULL OR target_program IS NULL OR target_version IS NULL OR target_version<1 THEN
    RAISE EXCEPTION 'Invalid stamp scope' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.stamp_entries WHERE user_id=actor AND cafe_id=target_cafe
    AND program_id=target_program AND program_version=target_version) THEN RETURN NULL; END IF;
  IF after_entry IS NOT NULL THEN
    SELECT recorded_at INTO cursor_time FROM public.stamp_entries WHERE id=after_entry AND user_id=actor
      AND cafe_id=target_cafe AND program_id=target_program AND program_version=target_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable stamp cursor' USING ERRCODE='22023'; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(item ORDER BY recorded_at DESC,id DESC),'[]'::jsonb) INTO records FROM (
    SELECT id,recorded_at,jsonb_build_object('id',id,'units',units,'kind',kind,'recordedAt',recorded_at,
      'effectiveAt',effective_at,'reversalOf',reversal_of,'expiresAt',expires_at,
      'cafeId',cafe_id,'programId',program_id,'programVersion',program_version) AS item
    FROM public.stamp_entries WHERE user_id=actor AND cafe_id=target_cafe
      AND program_id=target_program AND program_version=target_version
      AND (after_entry IS NULL OR (recorded_at,id)<(cursor_time,after_entry))
      ORDER BY recorded_at DESC,id DESC LIMIT 21) bounded;
  RETURN jsonb_build_object('ledger','stamp','items',
    (SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) FROM jsonb_array_elements(records) WITH ORDINALITY AS page(value,ordinal) WHERE ordinal<=20),
    'nextCursor',CASE WHEN jsonb_array_length(records)>20 THEN records->19->>'id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.read_private_stamp_program_history(bytea,uuid,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_stamp_program_history(bytea,uuid,uuid,integer,uuid) TO ghahvehto_loyalty_reader;
