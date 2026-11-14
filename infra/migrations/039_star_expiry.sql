-- Expiry records account for remaining lots without refunding issuance budgets.
CREATE TABLE public.star_expiry_records (
  entry_id uuid PRIMARY KEY REFERENCES public.star_entries(id),
  award_id uuid NOT NULL UNIQUE REFERENCES public.star_entries(id),
  units integer NOT NULL CHECK (units>0),
  CHECK (entry_id<>award_id)
);
CREATE TRIGGER star_expiry_records_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.star_expiry_records
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.star_expiry_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.star_expiry_records FROM PUBLIC;

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
      OR (e.kind='expire' AND NOT EXISTS (
        SELECT 1 FROM public.star_expiry_records x JOIN public.star_entries w ON w.id=x.award_id
        WHERE x.entry_id=e.id AND x.units=-e.units AND w.user_id=recipient AND w.kind='award'
          AND w.funding_budget_id IS NOT NULL AND w.expires_at<=e.effective_at
          AND x.units=w.units-coalesce((SELECT sum(a.units) FROM public.star_spend_allocations a
            JOIN public.star_entries d ON d.id=a.debit_id WHERE a.award_id=w.id AND d.effective_at<=e.effective_at),0)))
      OR e.kind NOT IN ('award','spend','expire')
  )
  SELECT CASE WHEN EXISTS(SELECT 1 FROM invalid) THEN NULL ELSE coalesce((
    SELECT sum(e.units-coalesce((SELECT sum(a.units) FROM public.star_spend_allocations a
      JOIN public.star_entries d ON d.id=a.debit_id WHERE a.award_id=e.id AND d.effective_at<=as_of),0))
    FROM history e WHERE e.kind='award' AND (e.expires_at IS NULL OR e.expires_at>as_of)
  ),0) END
  WHERE recipient IS NOT NULL AND as_of IS NOT NULL AND isfinite(as_of);
$$;

CREATE FUNCTION public.expire_funded_star_award(recipient uuid,award uuid,operation uuid)
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
  SELECT lot.units-coalesce(sum(units),0) INTO remaining FROM public.star_spend_allocations WHERE award_id=award;
  IF remaining<=0 THEN RAISE EXCEPTION 'Star expiry unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.star_entries(user_id,operation_id,units,kind,reason,effective_at)
    VALUES(recipient,operation,-remaining,'expire','Funded star lot expiry',checked_at) RETURNING id INTO debit;
  INSERT INTO public.star_expiry_records(entry_id,award_id,units) VALUES(debit,award,remaining);
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.stars_expired','Funded star lot expiry',jsonb_build_object('entryId',debit,'awardId',award));
  RETURN debit;
END $$;
REVOKE ALL ON FUNCTION public.expire_funded_star_award(uuid,uuid,uuid) FROM PUBLIC;
