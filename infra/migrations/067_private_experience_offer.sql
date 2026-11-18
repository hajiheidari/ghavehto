-- Preview the same version and branch the reservation routine will recheck.
CREATE FUNCTION public.read_private_experience_offer(token_hash bytea, experience uuid, version_number integer, branch uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  actor uuid;
  offer jsonb;
  checked_at timestamptz;
BEGIN
  actor := public.editorial_session_actor(token_hash);
  checked_at := clock_timestamp();
  SELECT jsonb_build_object('title',x.title,'branchName',b.name,'startsAt',v.starts_at,'endsAt',v.ends_at,
    'eligibility',status.eligibility)
    INTO offer
    FROM public.experiences x
    JOIN public.experience_versions v ON v.experience_id=x.id AND v.cafe_id=x.cafe_id
    JOIN public.branches b ON b.id=branch AND b.cafe_id=x.cafe_id
    CROSS JOIN LATERAL (
      SELECT public.inspect_experience_eligibility(actor,experience,version_number,branch,checked_at) AS eligibility
    ) status
    WHERE x.id=experience AND v.version=version_number
      AND status.eligibility IN ('eligible','outside_window','capacity_unavailable','limit_reached','prior_participation');
  RETURN offer;
END $$;
REVOKE ALL ON FUNCTION public.read_private_experience_offer(bytea,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_experience_offer(bytea,uuid,integer,uuid) TO ghahvehto_participation;
