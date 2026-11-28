CREATE INDEX stamp_entries_member_history_idx ON public.stamp_entries(user_id,recorded_at DESC,id DESC);
CREATE INDEX star_entries_member_history_idx ON public.star_entries(user_id,recorded_at DESC,id DESC);
CREATE INDEX tier_entries_member_history_idx ON public.tier_entries(user_id,recorded_at DESC,id DESC);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_loyalty_reader') THEN
    CREATE ROLE ghahvehto_loyalty_reader NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_loyalty_reader;

-- History only: journal totals are not advertised as available balances.
CREATE FUNCTION public.read_private_loyalty_history(token_hash bytea,ledger text,after_entry uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; target_table text; extra_fields text; cursor_time timestamptz; items jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  IF ledger IS NULL OR ledger NOT IN ('stamp','star','tier') THEN
    RAISE EXCEPTION 'Invalid loyalty history' USING ERRCODE='22023';
  END IF;
  -- Both identifiers and SQL fragments below are fixed server constants, never caller SQL.
  target_table:=CASE ledger WHEN 'stamp' THEN 'stamp_entries' WHEN 'star' THEN 'star_entries' ELSE 'tier_entries' END;
  extra_fields:=CASE ledger
    WHEN 'stamp' THEN ',''cafeId'',cafe_id,''programId'',program_id,''programVersion'',program_version,''expiresAt'',expires_at'
    WHEN 'star' THEN ',''expiresAt'',expires_at'
    ELSE ',''qualificationYear'',qualification_year' END;
  IF after_entry IS NOT NULL THEN
    EXECUTE format('SELECT recorded_at FROM public.%I WHERE id=$1 AND user_id=$2',target_table)
      INTO cursor_time USING after_entry,actor;
    IF cursor_time IS NULL THEN
      RAISE EXCEPTION 'Unavailable history cursor' USING ERRCODE='22023';
    END IF;
  END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(item ORDER BY recorded_at DESC,id DESC),''[]''::jsonb) FROM (
    SELECT id,recorded_at,jsonb_build_object(''id'',id,''units'',units,''kind'',kind,
      ''recordedAt'',recorded_at,''effectiveAt'',effective_at,''reversalOf'',reversal_of%s) AS item
    FROM public.%I WHERE user_id=$1 AND ($2::uuid IS NULL OR (recorded_at,id)<($3::timestamptz,$2))
    ORDER BY recorded_at DESC,id DESC LIMIT 21) entries',extra_fields,target_table)
    INTO items USING actor,after_entry,cursor_time;
  RETURN jsonb_build_object('ledger',ledger,'items',
    (SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) FROM jsonb_array_elements(items) WITH ORDINALITY AS page(value,ordinal) WHERE ordinal<=20),
    'nextCursor',CASE WHEN jsonb_array_length(items)>20 THEN items->19->>'id' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.read_private_loyalty_history(bytea,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_loyalty_history(bytea,text,uuid) TO ghahvehto_loyalty_reader;
