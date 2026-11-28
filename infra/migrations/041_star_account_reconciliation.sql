-- Maintenance-only diagnostic. It never edits journals, budgets or projections.
CREATE FUNCTION public.inspect_star_account(recipient uuid,as_of timestamptz)
RETURNS TABLE(journal_units bigint,spendable_units bigint,pending_expiry_units bigint,variance bigint)
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  WITH state AS (
    SELECT public.inspect_funded_star_balance(recipient,as_of) AS available
  ), journal AS (
    SELECT coalesce(sum(units),0)::bigint AS total FROM public.star_entries
      WHERE user_id=recipient AND effective_at<=as_of
  ), pending AS (
    SELECT coalesce(sum(e.units-public.funded_star_lot_spent(e.id,as_of)),0)::bigint AS total
      FROM public.star_entries e WHERE e.user_id=recipient AND e.kind='award' AND e.funding_budget_id IS NOT NULL
        AND e.effective_at<=as_of AND e.expires_at<=as_of
        AND NOT EXISTS (SELECT 1 FROM public.star_expiry_records r JOIN public.star_entries d ON d.id=r.entry_id
          WHERE r.award_id=e.id AND d.effective_at<=as_of)
  )
  SELECT journal.total,state.available,CASE WHEN state.available IS NOT NULL THEN pending.total END,
    CASE WHEN state.available IS NOT NULL THEN journal.total-state.available-pending.total END
    FROM state,journal,pending WHERE recipient IS NOT NULL AND as_of IS NOT NULL AND isfinite(as_of);
$$;
REVOKE ALL ON FUNCTION public.inspect_star_account(uuid,timestamptz) FROM PUBLIC;
