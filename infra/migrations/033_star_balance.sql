-- Fail closed until historical spend, expiry and reversal allocation rules exist.
CREATE FUNCTION public.inspect_funded_star_balance(recipient uuid,as_of timestamptz)
RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT CASE WHEN bool_or(e.kind<>'award' OR e.funding_budget_id IS NULL) THEN NULL
    ELSE coalesce(sum(e.units) FILTER (WHERE e.expires_at IS NULL OR e.expires_at>as_of),0)
    END
  FROM public.star_entries e WHERE e.user_id=recipient AND e.effective_at<=as_of
  HAVING recipient IS NOT NULL AND as_of IS NOT NULL AND isfinite(as_of);
$$;
REVOKE ALL ON FUNCTION public.inspect_funded_star_balance(uuid,timestamptz) FROM PUBLIC;
