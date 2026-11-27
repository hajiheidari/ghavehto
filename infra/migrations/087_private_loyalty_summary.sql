-- Read existing accounting only; no earning, spending, replacement credit or expiry extension.
CREATE FUNCTION public.read_private_loyalty_summary(token_hash bytea,target_year integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; checked_at timestamptz:=clock_timestamp(); year_number integer; stars bigint; points bigint;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  checked_at:=clock_timestamp();
  year_number:=coalesce(target_year,extract(year FROM checked_at AT TIME ZONE 'UTC')::integer);
  IF year_number NOT BETWEEN 2000 AND 9999 THEN
    RAISE EXCEPTION 'Invalid qualification year' USING ERRCODE='22023';
  END IF;
  SELECT public.inspect_funded_star_balance(actor,checked_at),public.inspect_tier_qualification(actor,year_number,checked_at)
    INTO stars,points;
  RETURN jsonb_build_object('asOf',checked_at,'stars',jsonb_build_object('availableUnits',CASE WHEN stars>=0 THEN stars::text ELSE NULL END),
    'tier',jsonb_build_object('year',year_number,'points',CASE WHEN points>=0 THEN points::text ELSE NULL END));
END $$;
REVOKE ALL ON FUNCTION public.read_private_loyalty_summary(bytea,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_loyalty_summary(bytea,integer) TO ghahvehto_loyalty_reader;
