DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_stamp_redeemer') THEN
    CREATE ROLE ghahvehto_stamp_redeemer NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_stamp_redeemer;

CREATE TABLE public.stamp_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  program_id uuid NOT NULL,
  program_version integer NOT NULL,
  stock integer NOT NULL CHECK (stock>=0),
  active boolean NOT NULL DEFAULT false,
  FOREIGN KEY (program_id,cafe_id,program_version) REFERENCES public.stamp_program_versions(program_id,cafe_id,version)
);
CREATE TABLE public.stamp_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  reward_id uuid NOT NULL REFERENCES public.stamp_rewards(id),
  entry_id uuid NOT NULL UNIQUE REFERENCES public.stamp_entries(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER stamp_redemptions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.stamp_redemptions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.stamp_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stamp_rewards,public.stamp_redemptions FROM PUBLIC;

-- Internal only; caller must obtain recipient from a verified session.
CREATE FUNCTION public.redeem_stamp_reward(recipient uuid,target_reward uuid,operation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.stamp_redemptions%ROWTYPE;
  reward public.stamp_rewards%ROWTYPE;
  cost integer;
  available bigint;
  has_expiring_history boolean;
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
  SELECT coalesce(sum(units) FILTER (WHERE effective_at<=clock_timestamp()),0),
    coalesce(bool_or(expires_at IS NOT NULL OR kind='expire'),false)
    INTO available,has_expiring_history FROM public.stamp_entries
    WHERE user_id=recipient AND cafe_id=reward.cafe_id AND program_id=reward.program_id AND program_version=reward.program_version;
  IF has_expiring_history OR available<cost THEN
    RAISE EXCEPTION 'Stamp balance unavailable' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at)
    VALUES(recipient,reward.cafe_id,reward.program_id,reward.program_version,operation,-cost,'spend','Stamp reward redemption',clock_timestamp())
    RETURNING id INTO debit;
  UPDATE public.stamp_rewards SET stock=stock-1 WHERE id=target_reward;
  INSERT INTO public.stamp_redemptions(operation_id,user_id,reward_id,entry_id)
    VALUES(operation,recipient,target_reward,debit) RETURNING id INTO receipt;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(recipient,reward.cafe_id,'loyalty.stamp_redeemed','Stamp reward redemption',
      jsonb_build_object('rewardId',target_reward,'redemptionId',receipt,'entryId',debit));
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.redeem_stamp_reward(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_stamp_reward(uuid,uuid,uuid) TO ghahvehto_stamp_redeemer;
