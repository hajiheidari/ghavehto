-- Lock the reward even when the pre-wait stock snapshot is zero, then inspect the locked row.
CREATE OR REPLACE FUNCTION public.redeem_star_reward(recipient uuid,target_reward uuid,operation uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.star_redemptions%ROWTYPE;
  reward public.star_rewards%ROWTYPE;
  debit uuid;
  receipt uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Star redemption requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR target_reward IS NULL OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid star redemption' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('star-award:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star recipient unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM public.star_redemptions WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.user_id=recipient AND prior.reward_id=target_reward THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Star operation already used' USING ERRCODE='23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.star_entries WHERE operation_id=operation) THEN
    RAISE EXCEPTION 'Star operation already used' USING ERRCODE='23505';
  END IF;
  SELECT * INTO reward FROM public.star_rewards WHERE id=target_reward FOR UPDATE;
  IF NOT FOUND OR NOT reward.active OR reward.stock<=0 THEN RAISE EXCEPTION 'Star reward unavailable' USING ERRCODE='22023'; END IF;
  debit:=public.spend_funded_stars(recipient,operation,reward.cost,'Internal star reward reservation');
  UPDATE public.star_rewards SET stock=stock-1 WHERE id=target_reward;
  INSERT INTO public.star_redemptions(operation_id,user_id,reward_id,entry_id)
    VALUES(operation,recipient,target_reward,debit) RETURNING id INTO receipt;
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.star_reward_reserved','Internal star reward reservation',
      jsonb_build_object('redemptionId',receipt,'rewardId',target_reward,'entryId',debit));
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.redeem_star_reward(uuid,uuid,uuid) FROM PUBLIC;

