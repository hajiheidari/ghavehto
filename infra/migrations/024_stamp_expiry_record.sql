-- Maintenance only; no runtime grants. Preserve the original award and debit.
CREATE FUNCTION public.record_stamp_award_expiry(target_award uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  award public.stamp_entries%ROWTYPE;
  expiry_id uuid;
  remaining bigint;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Expiry requires read committed isolation' USING ERRCODE='25000';
  END IF;
  SELECT * INTO award FROM public.stamp_entries WHERE id=target_award AND kind='award' AND expires_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expiring stamp award unavailable' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'stamp-balance:'||award.user_id::text||':'||award.program_id::text||':'||award.program_version::text,0));
  IF clock_timestamp()<award.expires_at THEN
    RAISE EXCEPTION 'Stamp award has not expired' USING ERRCODE='22023';
  END IF;

  SELECT e.id INTO expiry_id FROM public.stamp_spend_allocations a
    JOIN public.stamp_entries e ON e.id=a.debit_id
    WHERE a.award_id=target_award AND e.kind='expire';
  IF FOUND THEN RETURN expiry_id; END IF;

  IF EXISTS (
    SELECT 1 FROM public.stamp_entries e
    WHERE e.user_id=award.user_id AND e.cafe_id=award.cafe_id AND e.program_id=award.program_id
      AND e.program_version=award.program_version AND
      (e.kind='reversal' OR (e.kind IN ('spend','expire') AND -e.units<>coalesce(
        (SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.debit_id=e.id),0)))
  ) THEN RAISE EXCEPTION 'Stamp history requires reconciliation' USING ERRCODE='22023'; END IF;

  SELECT award.units-coalesce(sum(units),0) INTO remaining
    FROM public.stamp_spend_allocations WHERE award_id=target_award;
  IF remaining<=0 THEN RETURN NULL; END IF;

  INSERT INTO public.stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
    VALUES(award.user_id,award.cafe_id,award.program_id,award.program_version,gen_random_uuid(),
      -remaining,'expire','Unspent stamp award expired',award.expires_at)
    RETURNING id INTO expiry_id;
  INSERT INTO public.stamp_spend_allocations(debit_id,award_id,units)
    VALUES(expiry_id,target_award,remaining);
  INSERT INTO public.audit_events(cafe_id,action,reason,metadata)
    VALUES(award.cafe_id,'loyalty.stamp_expired','Unspent stamp award expired',
      jsonb_build_object('awardId',target_award,'entryId',expiry_id));
  RETURN expiry_id;
END $$;
REVOKE ALL ON FUNCTION public.record_stamp_award_expiry(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.redeem_stamp_reward(recipient uuid,target_reward uuid,operation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.stamp_redemptions%ROWTYPE;
  reward public.stamp_rewards%ROWTYPE;
  cost integer;
  available bigint;
  has_expiring_history boolean;
  unallocated_history boolean;
  checked_at timestamptz;
  allocated bigint;
  debit uuid;
  receipt uuid;
BEGIN
  IF recipient IS NULL OR target_reward IS NULL OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid redemption' USING ERRCODE='22023';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Redemption requires read committed isolation' USING ERRCODE='25000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('stamp-redeem-operation:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM public.stamp_redemptions WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.user_id=recipient AND prior.reward_id=target_reward THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Redemption operation already used' USING ERRCODE='23505';
  END IF;
  SELECT * INTO reward FROM public.stamp_rewards WHERE id=target_reward AND active AND stock>0 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward unavailable' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.cafes WHERE id=reward.cafe_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reward unavailable' USING ERRCODE='22023'; END IF;

  -- Stock locks alone do not protect one balance spent on different rewards.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'stamp-balance:'||recipient::text||':'||reward.program_id::text||':'||reward.program_version::text,0));
  SELECT stamps_required INTO STRICT cost FROM public.stamp_program_versions
    WHERE program_id=reward.program_id AND cafe_id=reward.cafe_id AND version=reward.program_version;
  checked_at:=clock_timestamp();
  SELECT coalesce(sum(units) FILTER (WHERE effective_at<=checked_at),0),
    coalesce(bool_or(expires_at IS NOT NULL),false),
    coalesce(bool_or(kind='reversal' OR (kind IN ('spend','expire') AND -units<>coalesce(
      (SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.debit_id=e.id),0))),false)
    INTO available,has_expiring_history,unallocated_history FROM public.stamp_entries e
    WHERE user_id=recipient AND cafe_id=reward.cafe_id AND program_id=reward.program_id AND program_version=reward.program_version;
  -- Legacy or reversal history cannot safely be attributed to expiring lots.
  IF (has_expiring_history AND unallocated_history) OR available<cost THEN
    RAISE EXCEPTION 'Stamp balance unavailable' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
    VALUES(recipient,reward.cafe_id,reward.program_id,reward.program_version,operation,-cost,'spend','Stamp reward redemption',checked_at)
    RETURNING id INTO debit;
  IF NOT unallocated_history THEN
    WITH lots AS (
      SELECT e.id,e.expires_at,e.effective_at,e.units-coalesce(
        (SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.award_id=e.id),0) AS remaining
      FROM public.stamp_entries e
      WHERE e.user_id=recipient AND e.cafe_id=reward.cafe_id AND e.program_id=reward.program_id
        AND e.program_version=reward.program_version AND e.kind='award' AND e.effective_at<=checked_at
        AND (e.expires_at IS NULL OR e.expires_at>checked_at)
    ), ordered AS (
      SELECT id,remaining,coalesce(sum(remaining) OVER (
        ORDER BY expires_at NULLS LAST,effective_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),0) AS preceding FROM lots WHERE remaining>0
    )
    INSERT INTO public.stamp_spend_allocations(debit_id,award_id,units)
      SELECT debit,id,least(remaining,cost-preceding)::integer FROM ordered WHERE preceding<cost;
    SELECT coalesce(sum(units),0) INTO allocated FROM public.stamp_spend_allocations WHERE debit_id=debit;
    IF allocated<>cost THEN RAISE EXCEPTION 'Stamp balance unavailable' USING ERRCODE='22023'; END IF;
  END IF;
  UPDATE public.stamp_rewards SET stock=stock-1 WHERE id=target_reward;
  INSERT INTO public.stamp_redemptions(operation_id,user_id,reward_id,entry_id)
    VALUES(operation,recipient,target_reward,debit) RETURNING id INTO receipt;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(recipient,reward.cafe_id,'loyalty.stamp_redeemed','Stamp reward redemption',
      jsonb_build_object('rewardId',target_reward,'redemptionId',receipt,'entryId',debit));
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.redeem_stamp_reward(uuid,uuid,uuid) FROM PUBLIC;

-- Operator diagnostics only. No application role receives this function.
CREATE OR REPLACE FUNCTION public.inspect_stamp_reconciliation(
  recipient uuid,target_cafe uuid,target_program uuid,target_version integer,as_of timestamptz
) RETURNS TABLE (legacy_spend_count bigint,reversal_count bigint,expiry_entry_count bigint,
  expired_unspent_units bigint,active_unspent_units bigint)
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  WITH journal AS MATERIALIZED (
    SELECT e.id,e.kind,e.units,e.expires_at
    FROM public.stamp_entries e
    WHERE e.user_id=recipient AND e.cafe_id=target_cafe AND e.program_id=target_program
      AND e.program_version=target_version AND e.effective_at<=as_of
  ), lots AS (
    SELECT j.expires_at,j.units-coalesce((
      SELECT sum(a.units) FROM public.stamp_spend_allocations a
      JOIN journal debit ON debit.id=a.debit_id AND debit.kind IN ('spend','expire')
      WHERE a.award_id=j.id
    ),0) AS remaining
    FROM journal j WHERE j.kind='award'
  )
  SELECT
    (SELECT count(*) FROM journal j WHERE j.kind='spend' AND -j.units<>coalesce((
      SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.debit_id=j.id
    ),0)),
    (SELECT count(*) FROM journal WHERE kind='reversal'),
    (SELECT count(*) FROM journal WHERE kind='expire'),
    coalesce(sum(remaining) FILTER (WHERE expires_at<=as_of),0)::bigint,
    coalesce(sum(remaining) FILTER (WHERE expires_at IS NULL OR expires_at>as_of),0)::bigint
  FROM lots;
$$;
REVOKE ALL ON FUNCTION public.inspect_stamp_reconciliation(uuid,uuid,uuid,integer,timestamptz) FROM PUBLIC;
