-- Restricted to maintenance; the caller generates a cryptographically random code.
CREATE FUNCTION public.register_referral_link(inviter uuid,hashed_code bytea,lifetime_seconds integer)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  link_id uuid;
BEGIN
  IF inviter IS NULL OR hashed_code IS NULL OR octet_length(hashed_code)<>32
    OR lifetime_seconds IS NULL OR lifetime_seconds NOT BETWEEN 1 AND 2592000 THEN
    RAISE EXCEPTION 'Invalid referral link' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.users WHERE id=inviter AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referral inviter unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO public.referral_links(inviter_id,code_hash,expires_at)
    VALUES(inviter,hashed_code,clock_timestamp()+make_interval(secs=>lifetime_seconds)) RETURNING id INTO link_id;
  RETURN link_id;
END $$;
REVOKE ALL ON FUNCTION public.register_referral_link(uuid,bytea,integer) FROM PUBLIC;

CREATE FUNCTION public.revoke_referral_link(inviter uuid,target_link uuid)
RETURNS boolean LANGUAGE sql SET search_path=pg_catalog,pg_temp AS $$
  WITH changed AS (
    UPDATE public.referral_links SET revoked_at=clock_timestamp()
    WHERE id=target_link AND inviter_id=inviter AND revoked_at IS NULL RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM changed);
$$;
REVOKE ALL ON FUNCTION public.revoke_referral_link(uuid,uuid) FROM PUBLIC;
