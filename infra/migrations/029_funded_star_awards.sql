-- Budget provisioning is restricted to database maintenance.
CREATE TABLE public.star_award_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funded_units integer NOT NULL CHECK (funded_units>0),
  remaining_units integer NOT NULL CHECK (remaining_units BETWEEN 0 AND funded_units),
  active boolean NOT NULL DEFAULT false
);
ALTER TABLE public.star_award_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.star_award_budgets FROM PUBLIC;
ALTER TABLE public.star_entries ADD COLUMN funding_budget_id uuid REFERENCES public.star_award_budgets(id),
  ADD CHECK (funding_budget_id IS NULL OR kind='award');

CREATE FUNCTION public.award_funded_stars(recipient uuid,budget_id uuid,operation uuid,amount integer,expiry timestamptz)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  recorded public.star_entries%ROWTYPE;
  awarded_at timestamptz;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Star awards require read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR budget_id IS NULL OR operation IS NULL OR amount IS NULL OR amount NOT BETWEEN 1 AND 1000000000
    OR (expiry IS NOT NULL AND NOT isfinite(expiry)) THEN
    RAISE EXCEPTION 'Invalid star award' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('star-award:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star recipient unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO recorded FROM public.star_entries WHERE operation_id=operation;
  IF FOUND THEN
    IF recorded.kind='award' AND recorded.user_id=recipient AND recorded.funding_budget_id=budget_id
      AND recorded.units=amount AND recorded.expires_at IS NOT DISTINCT FROM expiry THEN RETURN recorded.id; END IF;
    RAISE EXCEPTION 'Star operation already used' USING ERRCODE='23505';
  END IF;
  UPDATE public.star_award_budgets SET remaining_units=remaining_units-amount
    WHERE id=budget_id AND active AND remaining_units>=amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star funding unavailable' USING ERRCODE='22023'; END IF;
  awarded_at:=clock_timestamp();
  IF expiry<=awarded_at THEN RAISE EXCEPTION 'Invalid star expiry' USING ERRCODE='22023'; END IF;
  INSERT INTO public.star_entries(user_id,operation_id,units,kind,reason,effective_at,expires_at,funding_budget_id)
    VALUES(recipient,operation,amount,'award','Funded platform star award',awarded_at,expiry,budget_id) RETURNING * INTO recorded;
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.stars_awarded','Funded platform star award',jsonb_build_object('budgetId',budget_id,'entryId',recorded.id));
  RETURN recorded.id;
END $$;
REVOKE ALL ON FUNCTION public.award_funded_stars(uuid,uuid,uuid,integer,timestamptz) FROM PUBLIC;
