-- Attach a documented single-award expiry without rewriting either journal entry.
CREATE FUNCTION public.link_legacy_stamp_expiry(target_expiry uuid,target_award uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  expiry public.stamp_entries%ROWTYPE;
  award public.stamp_entries%ROWTYPE;
  linked_award uuid;
  remaining bigint;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Allocation requires read committed isolation' USING ERRCODE='25000';
  END IF;
  SELECT * INTO expiry FROM public.stamp_entries WHERE id=target_expiry AND kind='expire';
  IF NOT FOUND OR expiry.effective_at>clock_timestamp() THEN
    RAISE EXCEPTION 'Historical expiry unavailable' USING ERRCODE='22023';
  END IF;
  SELECT * INTO award FROM public.stamp_entries WHERE id=target_award AND kind='award'
    AND user_id=expiry.user_id AND cafe_id=expiry.cafe_id AND program_id=expiry.program_id
    AND program_version=expiry.program_version AND expires_at<=expiry.effective_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'Historical award unavailable' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'stamp-balance:'||award.user_id::text||':'||award.program_id::text||':'||award.program_version::text,0));
  SELECT a.award_id INTO linked_award FROM public.stamp_spend_allocations a WHERE a.debit_id=target_expiry;
  IF FOUND THEN
    IF linked_award=target_award THEN RETURN; END IF;
    RAISE EXCEPTION 'Historical expiry already allocated' USING ERRCODE='23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stamp_entries e WHERE e.user_id=award.user_id AND e.cafe_id=award.cafe_id
      AND e.program_id=award.program_id AND e.program_version=award.program_version
      AND (e.kind='reversal' OR (e.kind='spend' AND -e.units<>coalesce((
        SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.debit_id=e.id
      ),0)))
  ) OR EXISTS (
    SELECT 1 FROM public.stamp_spend_allocations a
    JOIN public.stamp_entries e ON e.id=a.debit_id
    WHERE a.award_id=target_award AND (e.kind='expire' OR e.effective_at>=award.expires_at)
  ) THEN RAISE EXCEPTION 'Stamp history requires reconciliation' USING ERRCODE='22023'; END IF;

  SELECT award.units-coalesce(sum(a.units),0) INTO remaining
    FROM public.stamp_spend_allocations a WHERE a.award_id=target_award;
  IF remaining<>-expiry.units THEN
    RAISE EXCEPTION 'Historical expiry does not match the award remainder' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.stamp_spend_allocations(debit_id,award_id,units)
    VALUES(target_expiry,target_award,remaining);
  INSERT INTO public.audit_events(cafe_id,action,reason,metadata)
    VALUES(award.cafe_id,'loyalty.stamp_expiry_linked','Documented historical stamp expiry',
      jsonb_build_object('awardId',target_award,'entryId',target_expiry));
END $$;
REVOKE ALL ON FUNCTION public.link_legacy_stamp_expiry(uuid,uuid) FROM PUBLIC;

-- Apply only evidence-backed allocations; never guess a legacy spend's lots.
CREATE OR REPLACE FUNCTION public.allocate_legacy_stamp_spend(
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

  -- An unlinked expiry is reconciled after its historical spends.
  IF EXISTS (
    SELECT 1 FROM public.stamp_entries e WHERE e.user_id=debit.user_id AND e.cafe_id=debit.cafe_id
      AND e.program_id=debit.program_id AND e.program_version=debit.program_version
      AND e.kind='reversal'
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
