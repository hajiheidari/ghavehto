-- Read-only screening for later reward decisions. Does not approve or issue a reward.
CREATE INDEX referral_attributions_inviter_time_idx
  ON public.referral_attributions(inviter_id,recorded_at,id);

CREATE FUNCTION public.inspect_referral_review(target_attribution uuid, daily_cap integer)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT CASE
    WHEN inviter.deleted_at IS NOT NULL OR invitee.deleted_at IS NOT NULL
      OR inviter.phone_verified_at IS NULL OR invitee.phone_verified_at IS NULL THEN 'account_unavailable'
    WHEN (
      SELECT count(*) FROM public.referral_attributions earlier
      WHERE earlier.inviter_id=r.inviter_id AND earlier.recorded_at>=r.recorded_at-interval '24 hours'
        AND (earlier.recorded_at,earlier.id)<=(r.recorded_at,r.id)
    )>daily_cap THEN 'review_volume'
    ELSE 'review_pending'
  END
  FROM public.referral_attributions r
  JOIN public.users inviter ON inviter.id=r.inviter_id
  JOIN public.users invitee ON invitee.id=r.invitee_id
  WHERE r.id=target_attribution AND daily_cap BETWEEN 1 AND 10000;
$$;
REVOKE ALL ON FUNCTION public.inspect_referral_review(uuid,integer) FROM PUBLIC;
