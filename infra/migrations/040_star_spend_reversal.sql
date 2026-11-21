-- Full internal spend reversals restore only their still-valid original lots.
CREATE TABLE public.star_spend_reversals (
  entry_id uuid PRIMARY KEY REFERENCES public.star_entries(id),
  spend_id uuid NOT NULL UNIQUE REFERENCES public.star_entries(id),
  CHECK(entry_id<>spend_id)
);
CREATE TRIGGER star_spend_reversals_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.star_spend_reversals
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.star_spend_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.star_spend_reversals FROM PUBLIC;

CREATE FUNCTION public.funded_star_lot_spent(award uuid,as_of timestamptz)
RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT coalesce(sum(a.units),0) FROM public.star_spend_allocations a
    JOIN public.star_entries d ON d.id=a.debit_id WHERE a.award_id=award AND d.effective_at<=as_of
    AND NOT EXISTS (SELECT 1 FROM public.star_spend_reversals r JOIN public.star_entries v ON v.id=r.entry_id
      WHERE r.spend_id=d.id AND v.effective_at<=as_of);
$$;
REVOKE ALL ON FUNCTION public.funded_star_lot_spent(uuid,timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.inspect_funded_star_balance(recipient uuid,as_of timestamptz)
RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  WITH history AS (
    SELECT * FROM public.star_entries WHERE user_id=recipient AND effective_at<=as_of
  ), invalid AS (
    SELECT 1 FROM history e WHERE
      (e.kind='award' AND (e.funding_budget_id IS NULL OR e.units<coalesce(
        (SELECT public.funded_star_lot_spent(e.id,as_of)),0)))
      OR (e.kind='spend' AND (-e.units<>coalesce(
        (SELECT sum(a.units) FROM public.star_spend_allocations a WHERE a.debit_id=e.id),0)
        OR EXISTS (SELECT 1 FROM public.star_spend_allocations a JOIN public.star_entries w ON w.id=a.award_id
          WHERE a.debit_id=e.id AND (w.user_id<>recipient OR w.kind<>'award' OR w.funding_budget_id IS NULL
            OR w.effective_at>e.effective_at OR w.expires_at<=e.effective_at))))
      OR (e.kind='expire' AND NOT EXISTS (
        SELECT 1 FROM public.star_expiry_records x JOIN public.star_entries w ON w.id=x.award_id
        WHERE x.entry_id=e.id AND x.units=-e.units AND w.user_id=recipient AND w.kind='award'
          AND w.funding_budget_id IS NOT NULL AND w.expires_at<=e.effective_at
          AND x.units=w.units-coalesce((SELECT public.funded_star_lot_spent(w.id,e.effective_at)),0)))
      OR (e.kind='reversal' AND NOT EXISTS (
        SELECT 1 FROM public.star_spend_reversals r JOIN public.star_entries d ON d.id=r.spend_id
        WHERE r.entry_id=e.id AND d.id=e.reversal_of AND d.user_id=recipient AND d.kind='spend'
          AND d.units=-e.units AND d.effective_at<=e.effective_at
          AND NOT EXISTS (SELECT 1 FROM public.star_spend_allocations a JOIN public.star_entries w ON w.id=a.award_id
            WHERE a.debit_id=d.id AND w.expires_at<=e.effective_at)))
      OR e.kind NOT IN ('award','spend','expire','reversal')
  )
  SELECT CASE WHEN EXISTS(SELECT 1 FROM invalid) THEN NULL ELSE coalesce((
    SELECT sum(e.units-coalesce((SELECT public.funded_star_lot_spent(e.id,as_of)),0))
    FROM history e WHERE e.kind='award' AND (e.expires_at IS NULL OR e.expires_at>as_of)
  ),0) END
  WHERE recipient IS NOT NULL AND as_of IS NOT NULL AND isfinite(as_of);
$$;

CREATE OR REPLACE FUNCTION public.spend_funded_stars(recipient uuid,operation uuid,amount integer,explanation text)
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
      (SELECT public.funded_star_lot_spent(e.id,checked_at)),0) AS remaining
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
CREATE OR REPLACE FUNCTION public.expire_funded_star_award(recipient uuid,award uuid,operation uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.star_entries%ROWTYPE;
  lot public.star_entries%ROWTYPE;
  checked_at timestamptz;
  remaining bigint;
  debit uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Star expiry requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR award IS NULL OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid star expiry' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('star-award:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star recipient unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM public.star_entries WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.kind='expire' AND prior.user_id=recipient AND EXISTS (
      SELECT 1 FROM public.star_expiry_records WHERE entry_id=prior.id AND award_id=award) THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Star operation already used' USING ERRCODE='23505';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('star-balance:'||recipient::text,0));
  checked_at:=clock_timestamp();
  IF public.inspect_funded_star_balance(recipient,checked_at) IS NULL THEN
    RAISE EXCEPTION 'Star history unavailable' USING ERRCODE='22023';
  END IF;
  SELECT * INTO lot FROM public.star_entries WHERE id=award AND user_id=recipient AND kind='award'
    AND funding_budget_id IS NOT NULL AND expires_at<=checked_at;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.star_expiry_records WHERE award_id=award) THEN
    RAISE EXCEPTION 'Star expiry unavailable' USING ERRCODE='22023';
  END IF;
  remaining:=lot.units-public.funded_star_lot_spent(award,checked_at);
  IF remaining<=0 THEN RAISE EXCEPTION 'Star expiry unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.star_entries(user_id,operation_id,units,kind,reason,effective_at)
    VALUES(recipient,operation,-remaining,'expire','Funded star lot expiry',checked_at) RETURNING id INTO debit;
  INSERT INTO public.star_expiry_records(entry_id,award_id,units) VALUES(debit,award,remaining);
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.stars_expired','Funded star lot expiry',jsonb_build_object('entryId',debit,'awardId',award));
  RETURN debit;
END $$;
REVOKE ALL ON FUNCTION public.expire_funded_star_award(uuid,uuid,uuid) FROM PUBLIC;

CREATE FUNCTION public.reverse_funded_star_spend(recipient uuid,original uuid,operation uuid,explanation text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.star_entries%ROWTYPE;
  spent public.star_entries%ROWTYPE;
  checked_at timestamptz;
  restored uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Star reversal requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR original IS NULL OR operation IS NULL OR explanation IS NULL
    OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid star reversal' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('star-award:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Star recipient unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM public.star_entries WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.user_id=recipient AND prior.kind='reversal' AND prior.reversal_of=original
      AND prior.reason=btrim(explanation) THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Star operation already used' USING ERRCODE='23505';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('star-balance:'||recipient::text,0));
  checked_at:=clock_timestamp();
  IF public.inspect_funded_star_balance(recipient,checked_at) IS NULL THEN
    RAISE EXCEPTION 'Star history unavailable' USING ERRCODE='22023';
  END IF;
  SELECT * INTO spent FROM public.star_entries WHERE id=original AND user_id=recipient AND kind='spend'
    AND effective_at<=checked_at;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.star_entries WHERE reversal_of=original)
    OR EXISTS (SELECT 1 FROM public.star_spend_allocations a JOIN public.star_entries w ON w.id=a.award_id
      WHERE a.debit_id=original AND w.expires_at<=checked_at) THEN
    RAISE EXCEPTION 'Star reversal unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.star_entries(user_id,operation_id,units,kind,reason,effective_at,reversal_of)
    VALUES(recipient,operation,-spent.units,'reversal',btrim(explanation),checked_at,original) RETURNING id INTO restored;
  INSERT INTO public.star_spend_reversals(entry_id,spend_id) VALUES(restored,original);
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.star_spend_reversed',btrim(explanation),jsonb_build_object('entryId',restored,'spendId',original));
  RETURN restored;
END $$;
REVOKE ALL ON FUNCTION public.reverse_funded_star_spend(uuid,uuid,uuid,text) FROM PUBLIC;
