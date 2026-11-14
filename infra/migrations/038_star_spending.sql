-- Internal accounting only: no runtime grant, reward delivery or payment.
CREATE TABLE public.star_spend_allocations (
  debit_id uuid NOT NULL REFERENCES public.star_entries(id),
  award_id uuid NOT NULL REFERENCES public.star_entries(id),
  units integer NOT NULL CHECK (units>0),
  PRIMARY KEY(debit_id,award_id),
  CHECK (debit_id<>award_id)
);
CREATE INDEX star_spend_allocations_award ON public.star_spend_allocations(award_id);
CREATE TRIGGER star_spend_allocations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.star_spend_allocations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.star_spend_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.star_spend_allocations FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.inspect_funded_star_balance(recipient uuid,as_of timestamptz)
RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  WITH history AS (
    SELECT * FROM public.star_entries WHERE user_id=recipient AND effective_at<=as_of
  ), invalid AS (
    SELECT 1 FROM history e WHERE
      (e.kind='award' AND (e.funding_budget_id IS NULL OR e.units<coalesce(
        (SELECT sum(a.units) FROM public.star_spend_allocations a
          JOIN public.star_entries d ON d.id=a.debit_id WHERE a.award_id=e.id AND d.effective_at<=as_of),0)))
      OR (e.kind='spend' AND (-e.units<>coalesce(
        (SELECT sum(a.units) FROM public.star_spend_allocations a WHERE a.debit_id=e.id),0)
        OR EXISTS (SELECT 1 FROM public.star_spend_allocations a JOIN public.star_entries w ON w.id=a.award_id
          WHERE a.debit_id=e.id AND (w.user_id<>recipient OR w.kind<>'award' OR w.funding_budget_id IS NULL
            OR w.effective_at>e.effective_at OR w.expires_at<=e.effective_at))))
      OR e.kind NOT IN ('award','spend')
  )
  SELECT CASE WHEN EXISTS(SELECT 1 FROM invalid) THEN NULL ELSE coalesce((
    SELECT sum(e.units-coalesce((SELECT sum(a.units) FROM public.star_spend_allocations a
      JOIN public.star_entries d ON d.id=a.debit_id WHERE a.award_id=e.id AND d.effective_at<=as_of),0))
    FROM history e WHERE e.kind='award' AND (e.expires_at IS NULL OR e.expires_at>as_of)
  ),0) END
  WHERE recipient IS NOT NULL AND as_of IS NOT NULL AND isfinite(as_of);
$$;

CREATE FUNCTION public.spend_funded_stars(recipient uuid,operation uuid,amount integer,explanation text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.star_entries%ROWTYPE;
  checked_at timestamptz;
  available bigint;
  debit uuid;
  allocated bigint;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Star spending requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR operation IS NULL OR amount IS NULL OR amount NOT BETWEEN 1 AND 1000000000
    OR explanation IS NULL OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid star spend' USING ERRCODE='22023';
  END IF;
  -- Share the award operation namespace to serialize cross-kind retries too.
  PERFORM pg_advisory_xact_lock(hashtextextended('star-award:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star recipient unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM public.star_entries WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.kind='spend' AND prior.user_id=recipient AND prior.units=-amount AND prior.reason=btrim(explanation) THEN
      RETURN prior.id;
    END IF;
    RAISE EXCEPTION 'Star operation already used' USING ERRCODE='23505';
  END IF;
  -- Different operations on one account must compete for the same lot balance.
  PERFORM pg_advisory_xact_lock(hashtextextended('star-balance:'||recipient::text,0));
  checked_at:=clock_timestamp();
  SELECT public.inspect_funded_star_balance(recipient,checked_at) INTO available;
  IF available IS NULL OR available<amount THEN
    RAISE EXCEPTION 'Star balance unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.star_entries(user_id,operation_id,units,kind,reason,effective_at)
    VALUES(recipient,operation,-amount,'spend',btrim(explanation),checked_at) RETURNING id INTO debit;
  WITH lots AS (
    SELECT e.id,e.expires_at,e.effective_at,e.units-coalesce(
      (SELECT sum(a.units) FROM public.star_spend_allocations a WHERE a.award_id=e.id),0) AS remaining
    FROM public.star_entries e WHERE e.user_id=recipient AND e.kind='award' AND e.effective_at<=checked_at
      AND (e.expires_at IS NULL OR e.expires_at>checked_at)
  ), ordered AS (
    SELECT id,remaining,coalesce(sum(remaining) OVER (
      ORDER BY expires_at NULLS LAST,effective_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ),0) AS preceding FROM lots WHERE remaining>0
  )
  INSERT INTO public.star_spend_allocations(debit_id,award_id,units)
    SELECT debit,id,least(remaining,amount-preceding)::integer FROM ordered WHERE preceding<amount;
  SELECT coalesce(sum(units),0) INTO allocated FROM public.star_spend_allocations WHERE debit_id=debit;
  IF allocated<>amount THEN RAISE EXCEPTION 'Star balance unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.stars_spent',btrim(explanation),jsonb_build_object('entryId',debit));
  RETURN debit;
END $$;
REVOKE ALL ON FUNCTION public.spend_funded_stars(uuid,uuid,integer,text) FROM PUBLIC;
