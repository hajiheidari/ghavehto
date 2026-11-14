-- Create inactive printable drafts only. Activation and public routing are separate.
CREATE FUNCTION public.register_cafe_tracking_draft(target_cafe uuid,target_branch uuid,target_experience uuid,hashed_code bytea,lifetime_seconds integer,window_seconds integer)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  link uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Tracking drafts require read committed isolation' USING ERRCODE='25000';
  END IF;
  IF target_cafe IS NULL OR target_branch IS NULL OR hashed_code IS NULL OR octet_length(hashed_code)<>32
    OR lifetime_seconds IS NULL OR lifetime_seconds NOT BETWEEN 1 AND 31536000
    OR window_seconds IS NULL OR window_seconds NOT BETWEEN 1 AND 31536000 THEN
    RAISE EXCEPTION 'Invalid tracking draft' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.cafes WHERE id=target_cafe AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking cafe unavailable' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.branches WHERE id=target_branch AND cafe_id=target_cafe FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking branch unavailable' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.users u JOIN public.cafe_memberships m ON m.user_id=u.id AND m.role='owner'
    WHERE m.cafe_id=target_cafe FOR SHARE OF u;
  IF NOT EXISTS(SELECT 1 FROM public.ownership_access_grants g
    JOIN public.ownership_claims c ON c.id=g.claim_id AND c.cafe_id=g.cafe_id AND c.decision='verified'
    JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.cafe_id=g.cafe_id AND m.user_id=c.user_id AND m.role='owner'
    JOIN public.users u ON u.id=m.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
    WHERE g.cafe_id=target_cafe AND g.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Verified tracking ownership required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.cafe_tracking_links(cafe_id,branch_id,experience_id,code_hash,expires_at,attribution_window_seconds)
    VALUES(target_cafe,target_branch,target_experience,hashed_code,clock_timestamp()+lifetime_seconds*interval '1 second',window_seconds)
    RETURNING id INTO link;
  INSERT INTO public.audit_events(cafe_id,action,reason,metadata)
    VALUES(target_cafe,'tracking.draft_created','Inactive printable tracking draft',jsonb_build_object('linkId',link,'branchId',target_branch));
  RETURN link;
END $$;
REVOKE ALL ON FUNCTION public.register_cafe_tracking_draft(uuid,uuid,uuid,bytea,integer,integer) FROM PUBLIC;
