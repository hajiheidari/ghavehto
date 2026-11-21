-- Maintenance-only award; use the UTC calendar year of the qualifying event.
CREATE FUNCTION public.award_tier_points(recipient uuid,operation uuid,amount integer,qualified_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  recorded public.tier_entries%ROWTYPE;
  year_number integer;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Tier awards require read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR operation IS NULL OR amount IS NULL OR amount NOT BETWEEN 1 AND 1000000000
    OR qualified_at IS NULL OR NOT isfinite(qualified_at) OR qualified_at>clock_timestamp()
    OR qualified_at<'2000-01-01T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'Invalid tier award' USING ERRCODE='22023';
  END IF;
  year_number:=extract(year FROM qualified_at AT TIME ZONE 'UTC');
  PERFORM pg_advisory_xact_lock(hashtextextended('tier-award:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tier recipient unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO recorded FROM public.tier_entries WHERE operation_id=operation;
  IF FOUND THEN
    IF recorded.kind='award' AND recorded.user_id=recipient AND recorded.units=amount
      AND recorded.effective_at=qualified_at THEN RETURN recorded.id; END IF;
    RAISE EXCEPTION 'Tier operation already used' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.tier_entries(user_id,qualification_year,operation_id,units,kind,reason,effective_at)
    VALUES(recipient,year_number,operation,amount,'award','Platform tier qualification',qualified_at) RETURNING * INTO recorded;
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.tier_awarded','Platform tier qualification',jsonb_build_object('year',year_number,'entryId',recorded.id));
  RETURN recorded.id;
END $$;
REVOKE ALL ON FUNCTION public.award_tier_points(uuid,uuid,integer,timestamptz) FROM PUBLIC;

CREATE FUNCTION public.inspect_tier_qualification(recipient uuid,target_year integer,as_of timestamptz)
RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT coalesce(sum(e.units),0) FROM public.tier_entries e
  WHERE e.user_id=recipient AND e.qualification_year=target_year AND e.effective_at<=as_of;
$$;
REVOKE ALL ON FUNCTION public.inspect_tier_qualification(uuid,integer,timestamptz) FROM PUBLIC;
