-- Internal, once-only referral awards require reviewed eligibility and real QR interaction.
-- No budgets are provisioned, no runtime grants or delivery/payout adapters are enabled.
CREATE TABLE public.referral_star_awards (
  attribution_id uuid PRIMARY KEY REFERENCES public.referral_attributions(id),
  interaction_entry_id uuid NOT NULL UNIQUE REFERENCES public.stamp_entries(id),
  star_entry_id uuid NOT NULL UNIQUE REFERENCES public.star_entries(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER referral_star_awards_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.referral_star_awards
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.referral_star_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_star_awards FROM PUBLIC;

CREATE FUNCTION public.award_reviewed_referral(target_attribution uuid,interaction uuid,budget uuid,operation uuid,amount integer,expiry timestamptz)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  referral public.referral_attributions%ROWTYPE;
  prior public.referral_star_awards%ROWTYPE;
  entry public.star_entries%ROWTYPE;
  verified_accounts integer;
  awarded uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Referral awards require read committed isolation' USING ERRCODE='25000';
  END IF;
  IF target_attribution IS NULL OR interaction IS NULL OR budget IS NULL OR operation IS NULL
    OR amount IS NULL OR amount NOT BETWEEN 1 AND 1000000000 OR (expiry IS NOT NULL AND NOT isfinite(expiry)) THEN
    RAISE EXCEPTION 'Invalid referral award' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('star-award:'||operation::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('referral-award:'||target_attribution::text,0));
  SELECT * INTO referral FROM public.referral_attributions WHERE id=target_attribution;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referral unavailable' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.users WHERE id IN (referral.inviter_id,referral.invitee_id)
    AND phone_verified_at IS NOT NULL AND deleted_at IS NULL ORDER BY id FOR SHARE;
  GET DIAGNOSTICS verified_accounts=ROW_COUNT;
  IF verified_accounts<>2 THEN RAISE EXCEPTION 'Referral account unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM public.referral_star_awards WHERE attribution_id=target_attribution;
  IF FOUND THEN
    SELECT * INTO STRICT entry FROM public.star_entries WHERE id=prior.star_entry_id;
    IF prior.interaction_entry_id=interaction AND entry.operation_id=operation AND entry.funding_budget_id=budget
      AND entry.units=amount AND entry.expires_at IS NOT DISTINCT FROM expiry THEN RETURN entry.id; END IF;
    RAISE EXCEPTION 'Referral award already recorded' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.star_entries WHERE operation_id=operation) THEN
    RAISE EXCEPTION 'Star operation already used' USING ERRCODE='23505';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.referral_review_decisions d WHERE d.attribution_id=target_attribution
    AND d.decision='eligible' AND public.inspect_referral_review(target_attribution,d.daily_cap)='review_pending') THEN
    RAISE EXCEPTION 'Reviewed referral eligibility required' USING ERRCODE='22023';
  END IF;
  -- A claimed scan or caller-provided registration timestamp is not genuine interaction proof.
  PERFORM 1 FROM public.stamp_qr_tokens q JOIN public.stamp_entries e ON e.id=q.entry_id
    WHERE q.entry_id=interaction AND q.recipient_id=referral.invitee_id AND q.consumed_at>=referral.recorded_at
      AND e.user_id=referral.invitee_id AND e.kind='award' AND e.units=1
      AND e.effective_at>=referral.recorded_at AND e.award_actor_id<>referral.inviter_id
      AND NOT EXISTS(SELECT 1 FROM public.stamp_entries r WHERE r.reversal_of=e.id)
    FOR SHARE OF q;
  IF NOT FOUND THEN RAISE EXCEPTION 'Confirmed referral interaction required' USING ERRCODE='22023'; END IF;
  awarded:=public.award_funded_stars(referral.inviter_id,budget,operation,amount,expiry);
  INSERT INTO public.referral_star_awards(attribution_id,interaction_entry_id,star_entry_id)
    VALUES(target_attribution,interaction,awarded);
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.referral_stars_awarded','Reviewed referral with confirmed interaction',
      jsonb_build_object('attributionId',target_attribution,'interactionEntryId',interaction,'entryId',awarded));
  RETURN awarded;
END $$;
REVOKE ALL ON FUNCTION public.award_reviewed_referral(uuid,uuid,uuid,uuid,integer,timestamptz) FROM PUBLIC;
