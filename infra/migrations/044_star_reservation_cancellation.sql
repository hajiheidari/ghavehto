-- Internal cancellation of an undelivered reservation. No delivery or payout route.
CREATE TABLE public.star_redemption_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_id uuid NOT NULL UNIQUE REFERENCES public.star_redemptions(id),
  operation_id uuid NOT NULL UNIQUE,
  reversal_entry_id uuid NOT NULL UNIQUE REFERENCES public.star_spend_reversals(entry_id) DEFERRABLE INITIALLY DEFERRED,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 240),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER star_redemption_cancellations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.star_redemption_cancellations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.star_redemption_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.star_redemption_cancellations FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.reject_reserved_star_spend_reversal()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.star_redemptions r WHERE r.entry_id=NEW.spend_id
    AND NOT EXISTS (SELECT 1 FROM public.star_redemption_cancellations c
      WHERE c.redemption_id=r.id AND c.reversal_entry_id=NEW.entry_id)) THEN
    RAISE EXCEPTION 'Reserved star spend requires reservation cancellation' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.cancel_star_reservation(recipient uuid,reservation uuid,operation uuid,explanation text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  receipt public.star_redemptions%ROWTYPE;
  prior public.star_redemption_cancellations%ROWTYPE;
  spent public.star_entries%ROWTYPE;
  checked_at timestamptz;
  restored uuid:=gen_random_uuid();
  cancellation uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Star cancellation requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR reservation IS NULL OR operation IS NULL OR explanation IS NULL
    OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid star cancellation' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('star-award:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star recipient unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO receipt FROM public.star_redemptions WHERE id=reservation AND user_id=recipient;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star reservation unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO prior FROM public.star_redemption_cancellations WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.redemption_id=reservation AND prior.reason=btrim(explanation) THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Star operation already used' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.star_entries WHERE operation_id=operation) THEN
    RAISE EXCEPTION 'Star operation already used' USING ERRCODE='23505';
  END IF;
  -- Same stock -> same account lock order as reservation; inactive rewards can be cancelled.
  PERFORM 1 FROM public.star_rewards WHERE id=receipt.reward_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('star-balance:'||recipient::text,0));
  checked_at:=clock_timestamp();
  IF EXISTS(SELECT 1 FROM public.star_redemption_cancellations WHERE redemption_id=reservation)
    OR public.inspect_funded_star_balance(recipient,checked_at) IS NULL THEN
    RAISE EXCEPTION 'Star cancellation unavailable' USING ERRCODE='22023';
  END IF;
  SELECT * INTO spent FROM public.star_entries WHERE id=receipt.entry_id AND user_id=recipient
    AND kind='spend' AND effective_at<=checked_at;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.star_entries WHERE reversal_of=receipt.entry_id)
    OR EXISTS(SELECT 1 FROM public.star_spend_allocations a JOIN public.star_entries w ON w.id=a.award_id
      WHERE a.debit_id=receipt.entry_id AND w.expires_at<=checked_at) THEN
    RAISE EXCEPTION 'Star cancellation unavailable' USING ERRCODE='22023';
  END IF;
  -- The deferred FK requires the corresponding immutable reversal by transaction commit.
  INSERT INTO public.star_redemption_cancellations(redemption_id,operation_id,reversal_entry_id,reason)
    VALUES(reservation,operation,restored,btrim(explanation)) RETURNING id INTO cancellation;
  INSERT INTO public.star_entries(id,user_id,operation_id,units,kind,reason,effective_at,reversal_of)
    VALUES(restored,recipient,operation,-spent.units,'reversal',btrim(explanation),checked_at,spent.id);
  INSERT INTO public.star_spend_reversals(entry_id,spend_id) VALUES(restored,spent.id);
  UPDATE public.star_rewards SET stock=stock+1 WHERE id=receipt.reward_id AND stock<2147483647;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star stock unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.star_reservation_cancelled',btrim(explanation),
      jsonb_build_object('cancellationId',cancellation,'redemptionId',reservation,'entryId',restored));
  RETURN cancellation;
END $$;
REVOKE ALL ON FUNCTION public.cancel_star_reservation(uuid,uuid,uuid,text) FROM PUBLIC;
