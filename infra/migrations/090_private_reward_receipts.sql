CREATE INDEX star_redemptions_member_history_idx ON public.star_redemptions(user_id,recorded_at DESC,id DESC);
CREATE INDEX stamp_redemptions_member_history_idx ON public.stamp_redemptions(user_id,created_at DESC,id DESC);

-- Never expose internal reasons, current stock or mutable reward cost as historical evidence.
CREATE VIEW public.private_reward_receipts WITH (security_invoker=true) AS
  SELECT 'star'::text AS ledger,r.user_id,r.operation_id,r.id,r.recorded_at,
    jsonb_build_object('id',r.id,'rewardId',r.reward_id,'entryId',r.entry_id,'reservedUnits',-e.units,
      'recordedAt',r.recorded_at,'state',CASE WHEN c.id IS NULL THEN 'reserved' ELSE 'cancelled' END,
      'cancellationId',c.id,'cancelledAt',c.recorded_at,'reversalEntryId',c.reversal_entry_id) AS receipt
    FROM public.star_redemptions r JOIN public.star_entries e ON e.id=r.entry_id AND e.user_id=r.user_id AND e.kind='spend'
    LEFT JOIN public.star_redemption_cancellations c ON c.redemption_id=r.id
  UNION ALL
  SELECT 'stamp'::text,r.user_id,r.operation_id,r.id,r.created_at,
    jsonb_build_object('id',r.id,'rewardId',r.reward_id,'entryId',r.entry_id,'reservedUnits',-e.units,
      'recordedAt',r.created_at,'state','reserved','cancellationId',NULL,'cancelledAt',NULL,'reversalEntryId',NULL,
      'cafeId',e.cafe_id,'programId',e.program_id,'programVersion',e.program_version)
    FROM public.stamp_redemptions r JOIN public.stamp_entries e ON e.id=r.entry_id AND e.user_id=r.user_id AND e.kind='spend';
REVOKE ALL ON public.private_reward_receipts FROM PUBLIC;

CREATE FUNCTION public.list_private_reward_receipts(token_hash bytea,target_ledger text,after_receipt uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; cursor_time timestamptz; records jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  IF target_ledger IS NULL OR target_ledger NOT IN ('stamp','star') THEN
    RAISE EXCEPTION 'Invalid receipt ledger' USING ERRCODE='22023';
  END IF;
  IF after_receipt IS NOT NULL THEN
    SELECT recorded_at INTO cursor_time FROM public.private_reward_receipts
      WHERE user_id=actor AND ledger=target_ledger AND id=after_receipt;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unavailable receipt cursor' USING ERRCODE='22023'; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(receipt ORDER BY recorded_at DESC,id DESC),'[]'::jsonb) INTO records FROM (
    SELECT id,recorded_at,receipt FROM public.private_reward_receipts WHERE user_id=actor AND ledger=target_ledger
      AND (after_receipt IS NULL OR (recorded_at,id)<(cursor_time,after_receipt))
      ORDER BY recorded_at DESC,id DESC LIMIT 21) bounded;
  RETURN jsonb_build_object('ledger',target_ledger,'items',
    (SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) FROM jsonb_array_elements(records) WITH ORDINALITY AS page(value,ordinal) WHERE ordinal<=20),
    'nextCursor',CASE WHEN jsonb_array_length(records)>20 THEN records->19->>'id' ELSE NULL END);
END $$;

CREATE FUNCTION public.recover_private_reward_receipt(token_hash bytea,target_ledger text,operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; result jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  IF target_ledger IS NULL OR target_ledger NOT IN ('stamp','star') OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid receipt recovery' USING ERRCODE='22023';
  END IF;
  SELECT receipt INTO result FROM public.private_reward_receipts
    WHERE user_id=actor AND ledger=target_ledger AND operation_id=operation;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_private_reward_receipts(bytea,text,uuid),
  public.recover_private_reward_receipt(bytea,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_private_reward_receipts(bytea,text,uuid),
  public.recover_private_reward_receipt(bytea,text,uuid) TO ghahvehto_loyalty_reader;
