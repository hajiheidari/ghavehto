-- Apply only evidence-backed allocations; never guess a legacy spend's lots.
CREATE FUNCTION public.allocate_legacy_stamp_spend(
  target_debit uuid, awards uuid[], quantities integer[]
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  debit public.stamp_entries%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Allocation requires read committed isolation' USING ERRCODE='25000';
  END IF;
  SELECT * INTO debit FROM public.stamp_entries WHERE id=target_debit AND kind='spend';
  IF NOT FOUND OR debit.effective_at>clock_timestamp() OR
    coalesce(cardinality(awards),0)=0 OR cardinality(awards) IS DISTINCT FROM cardinality(quantities)
    OR array_ndims(awards)<>1 OR array_ndims(quantities)<>1 OR EXISTS (
      SELECT 1 FROM unnest(awards,quantities) AS x(id,units) WHERE id IS NULL OR units IS NULL OR units<=0
    ) OR (SELECT count(DISTINCT id) FROM unnest(awards) AS x(id))<>cardinality(awards)
    OR (SELECT sum(units) FROM unnest(quantities) AS x(units))<>-debit.units THEN
    RAISE EXCEPTION 'Invalid historical stamp allocation' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'stamp-balance:'||debit.user_id::text||':'||debit.program_id::text||':'||debit.program_version::text,0));

  IF EXISTS (SELECT 1 FROM public.stamp_spend_allocations WHERE debit_id=target_debit) THEN
    IF NOT EXISTS (
      SELECT id,units FROM unnest(awards,quantities) AS x(id,units)
      EXCEPT SELECT award_id,units FROM public.stamp_spend_allocations WHERE debit_id=target_debit
    ) AND (SELECT count(*) FROM public.stamp_spend_allocations WHERE debit_id=target_debit)
      =cardinality(awards) THEN RETURN; END IF;
    RAISE EXCEPTION 'Historical spend already allocated' USING ERRCODE='23505';
  END IF;

  -- Reversal and explicit expiry history require separate reconciliation rules.
  IF EXISTS (
    SELECT 1 FROM public.stamp_entries e WHERE e.user_id=debit.user_id AND e.cafe_id=debit.cafe_id
      AND e.program_id=debit.program_id AND e.program_version=debit.program_version
      AND e.kind IN ('reversal','expire')
  ) OR EXISTS (
    SELECT 1 FROM unnest(awards,quantities) AS x(id,units)
    LEFT JOIN public.stamp_entries e ON e.id=x.id AND e.kind='award'
      AND e.user_id=debit.user_id AND e.cafe_id=debit.cafe_id AND e.program_id=debit.program_id
      AND e.program_version=debit.program_version AND e.effective_at<=debit.effective_at
      AND (e.expires_at IS NULL OR e.expires_at>debit.effective_at)
    WHERE e.id IS NULL OR x.units>e.units-coalesce((
      SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.award_id=e.id
    ),0)
  ) THEN
    RAISE EXCEPTION 'Historical stamp lots unavailable' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.stamp_spend_allocations(debit_id,award_id,units)
    SELECT target_debit,id,units FROM unnest(awards,quantities) AS x(id,units);
END $$;
REVOKE ALL ON FUNCTION public.allocate_legacy_stamp_spend(uuid,uuid[],integer[]) FROM PUBLIC;
