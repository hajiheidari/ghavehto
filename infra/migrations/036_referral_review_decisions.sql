-- Each referral has at most one terminal review decision. No payout is performed.
CREATE TABLE public.referral_review_decisions (
  attribution_id uuid PRIMARY KEY REFERENCES public.referral_attributions(id),
  decision text NOT NULL CHECK (decision IN ('eligible','rejected')),
  screening text NOT NULL CHECK (screening IN ('review_pending','review_volume','account_unavailable')),
  daily_cap integer NOT NULL CHECK (daily_cap BETWEEN 1 AND 10000),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 240),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER referral_review_decisions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.referral_review_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.referral_review_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_review_decisions FROM PUBLIC;

CREATE FUNCTION public.record_referral_review(target_attribution uuid,outcome text,cap integer,explanation text)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.referral_review_decisions%ROWTYPE;
  risk text;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Referral review requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF target_attribution IS NULL OR outcome IS NULL OR outcome NOT IN ('eligible','rejected')
    OR cap IS NULL OR cap NOT BETWEEN 1 AND 10000 OR explanation IS NULL
    OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid referral review' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('referral-review:'||target_attribution::text,0));
  SELECT * INTO prior FROM public.referral_review_decisions WHERE attribution_id=target_attribution;
  IF FOUND THEN
    IF prior.decision=outcome AND prior.daily_cap=cap AND prior.reason=btrim(explanation) THEN RETURN; END IF;
    RAISE EXCEPTION 'Referral decision already recorded' USING ERRCODE='23505';
  END IF;
  PERFORM 1 FROM public.users u JOIN public.referral_attributions r
    ON u.id IN (r.inviter_id,r.invitee_id) WHERE r.id=target_attribution ORDER BY u.id FOR SHARE OF u;
  risk:=public.inspect_referral_review(target_attribution,cap);
  IF risk IS NULL OR (outcome='eligible' AND risk<>'review_pending') THEN
    RAISE EXCEPTION 'Referral is not eligible' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.referral_review_decisions(attribution_id,decision,screening,daily_cap,reason)
    VALUES(target_attribution,outcome,risk,cap,btrim(explanation));
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.referral_reviewed','Recorded terminal referral review',
      jsonb_build_object('attributionId',target_attribution,'decision',outcome,'screening',risk));
END $$;
REVOKE ALL ON FUNCTION public.record_referral_review(uuid,text,integer,text) FROM PUBLIC;
