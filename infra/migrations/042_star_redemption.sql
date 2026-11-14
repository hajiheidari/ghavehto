-- Internal reservation/accounting only. No seeded rewards, runtime grants or delivery.
CREATE TABLE public.star_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost integer NOT NULL CHECK(cost BETWEEN 1 AND 1000000000),
  stock integer NOT NULL CHECK(stock>=0),
  active boolean NOT NULL DEFAULT false
);
CREATE TABLE public.star_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  reward_id uuid NOT NULL REFERENCES public.star_rewards(id),
  entry_id uuid NOT NULL UNIQUE REFERENCES public.star_entries(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER star_redemptions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.star_redemptions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.star_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.star_rewards,public.star_redemptions FROM PUBLIC;

CREATE FUNCTION public.redeem_star_reward(recipient uuid,target_reward uuid,operation uuid)
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
  SELECT * INTO reward FROM public.star_rewards WHERE id=target_reward AND active AND stock>0 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star reward unavailable' USING ERRCODE='22023'; END IF;
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
