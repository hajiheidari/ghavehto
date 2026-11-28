CREATE INDEX star_entries_funding_budget_idx ON public.star_entries(funding_budget_id)
  WHERE funding_budget_id IS NOT NULL;

-- An aggregate diagnostic only; it never changes an award or a budget.
CREATE FUNCTION public.inspect_star_funding(target_budget uuid)
RETURNS TABLE (funded_units integer,remaining_units integer,issued_units bigint,variance bigint)
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT b.funded_units,b.remaining_units,j.issued,
    b.funded_units::bigint-b.remaining_units-j.issued
  FROM public.star_award_budgets b
  CROSS JOIN LATERAL (
    SELECT coalesce(sum(e.units),0) AS issued FROM public.star_entries e
    WHERE e.funding_budget_id=b.id
  ) j
  WHERE b.id=target_budget;
$$;
REVOKE ALL ON FUNCTION public.inspect_star_funding(uuid) FROM PUBLIC;
