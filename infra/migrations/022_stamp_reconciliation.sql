-- Operator diagnostics only. No application role receives this function.
CREATE FUNCTION public.inspect_stamp_reconciliation(
  recipient uuid,target_cafe uuid,target_program uuid,target_version integer,as_of timestamptz
) RETURNS TABLE (legacy_spend_count bigint,reversal_count bigint,expiry_entry_count bigint,
  expired_unspent_units bigint,active_unspent_units bigint)
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  WITH journal AS MATERIALIZED (
    SELECT e.id,e.kind,e.units,e.expires_at
    FROM public.stamp_entries e
    WHERE e.user_id=recipient AND e.cafe_id=target_cafe AND e.program_id=target_program
      AND e.program_version=target_version AND e.effective_at<=as_of
  ), lots AS (
    SELECT j.expires_at,j.units-coalesce((
      SELECT sum(a.units) FROM public.stamp_spend_allocations a
      JOIN journal debit ON debit.id=a.debit_id AND debit.kind='spend'
      WHERE a.award_id=j.id
    ),0) AS remaining
    FROM journal j WHERE j.kind='award'
  )
  SELECT
    (SELECT count(*) FROM journal j WHERE j.kind='spend' AND -j.units<>coalesce((
      SELECT sum(a.units) FROM public.stamp_spend_allocations a WHERE a.debit_id=j.id
    ),0)),
    (SELECT count(*) FROM journal WHERE kind='reversal'),
    (SELECT count(*) FROM journal WHERE kind='expire'),
    coalesce(sum(remaining) FILTER (WHERE expires_at<=as_of),0)::bigint,
    coalesce(sum(remaining) FILTER (WHERE expires_at IS NULL OR expires_at>as_of),0)::bigint
  FROM lots;
$$;
REVOKE ALL ON FUNCTION public.inspect_stamp_reconciliation(uuid,uuid,uuid,integer,timestamptz) FROM PUBLIC;
