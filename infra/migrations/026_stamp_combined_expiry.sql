-- Attach a documented single or combined expiry without rewriting either journal entry.
CREATE FUNCTION public.link_legacy_stamp_expiry_awards(target_expiry uuid,target_awards uuid[])
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  expiry public.stamp_entries%ROWTYPE;
  total_units bigint;
  smallest_lot bigint;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Allocation requires read committed isolation' USING ERRCODE='25000';
  END IF;
  SELECT * INTO expiry FROM public.stamp_entries WHERE id=target_expiry AND kind='expire';
  IF NOT FOUND OR expiry.effective_at>clock_timestamp() THEN
    RAISE EXCEPTION 'Historical expiry unavailable' USING ERRCODE='22023';
  END IF;
  IF coalesce(cardinality(target_awards),0)=0 OR array_ndims(target_awards)<>1
    OR cardinality(target_awards)<>(SELECT count(DISTINCT id) FROM unnest(target_awards) AS x(id))
    OR cardinality(target_awards)<>(
      SELECT count(*) FROM public.stamp_entries e WHERE e.id=ANY(target_awards) AND e.kind='award'
        AND e.user_id=expiry.user_id AND e.cafe_id=expiry.cafe_id AND e.program_id=expiry.program_id
        AND e.program_version=expiry.program_version AND e.expires_at<=expiry.effective_at
    ) THEN RAISE EXCEPTION 'Historical awards unavailable' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'stamp-balance:'||expiry.user_id::text||':'||expiry.program_id::text||':'||expiry.program_version::text,0));
  IF EXISTS (SELECT 1 FROM public.stamp_spend_allocations WHERE debit_id=target_expiry) THEN
    IF (SELECT array_agg(award_id ORDER BY award_id) FROM public.stamp_spend_allocations WHERE debit_id=target_expiry)
      =(SELECT array_agg(id ORDER BY id) FROM unnest(target_awards) AS x(id)) THEN RETURN; END IF;
    RAISE EXCEPTION 'Historical expiry already allocated' USING ERRCODE='23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stamp_entries e WHERE e.user_id=expiry.user_id AND e.cafe_id=expiry.cafe_id
      AND e.program_id=expiry.program_id AND e.program_version=expiry.program_version
      AND (e.kind='reversal' OR (e.kind='spend' AND -e.units<>coalesce((
        SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.debit_id=e.id
      ),0)))
  ) OR EXISTS (
    SELECT 1 FROM public.stamp_spend_allocations a
    JOIN public.stamp_entries e ON e.id=a.debit_id
    JOIN public.stamp_entries lot ON lot.id=a.award_id
    WHERE a.award_id=ANY(target_awards) AND (e.kind='expire' OR e.effective_at>=lot.expires_at)
  ) THEN RAISE EXCEPTION 'Stamp history requires reconciliation' USING ERRCODE='22023'; END IF;

  WITH remainders AS MATERIALIZED (
    SELECT e.id,e.units-coalesce((SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.award_id=e.id),0) AS units
    FROM public.stamp_entries e WHERE e.id=ANY(target_awards)
  ), totals AS (
    SELECT sum(units) AS total,min(units) AS smallest FROM remainders
  ), inserted AS (
    INSERT INTO public.stamp_spend_allocations(debit_id,award_id,units)
      SELECT target_expiry,id,units FROM remainders CROSS JOIN totals
      WHERE totals.total=-expiry.units AND totals.smallest>0
      RETURNING 1
  )
  SELECT totals.total,totals.smallest INTO total_units,smallest_lot FROM totals;
  IF total_units<>-expiry.units OR smallest_lot<=0 THEN
    RAISE EXCEPTION 'Historical expiry does not match the awards remainder' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.audit_events(cafe_id,action,reason,metadata)
    VALUES(expiry.cafe_id,'loyalty.stamp_expiry_linked','Documented historical stamp expiry',
      jsonb_build_object('awardIds',target_awards,'entryId',target_expiry));
END $$;
REVOKE ALL ON FUNCTION public.link_legacy_stamp_expiry_awards(uuid,uuid[]) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.link_legacy_stamp_expiry(target_expiry uuid,target_award uuid)
RETURNS void LANGUAGE sql SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.link_legacy_stamp_expiry_awards(target_expiry,ARRAY[target_award]);
$$;
REVOKE ALL ON FUNCTION public.link_legacy_stamp_expiry(uuid,uuid) FROM PUBLIC;
