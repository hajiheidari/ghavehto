DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_ownership_access') THEN
    CREATE ROLE ghahvehto_ownership_access NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_ownership_access;

CREATE TABLE public.ownership_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE REFERENCES public.ownership_claims(id),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  membership_id uuid REFERENCES public.cafe_memberships(id),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  CHECK ((membership_id IS NULL) = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX ownership_access_one_active ON public.ownership_access_grants(cafe_id) WHERE revoked_at IS NULL;
ALTER TABLE public.ownership_access_grants ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.change_ownership_access(target_claim uuid, operation text, explanation text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  claim public.ownership_claims%ROWTYPE;
  current_grant public.ownership_access_grants%ROWTYPE;
  new_membership uuid;
  grant_id uuid;
  cafe_active boolean;
BEGIN
  IF operation IS NULL OR operation NOT IN ('grant','revoke') OR explanation IS NULL OR
      length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid access decision' USING ERRCODE='22023';
  END IF;
  SELECT * INTO claim FROM public.ownership_claims WHERE id=target_claim FOR SHARE;
  IF NOT FOUND OR claim.decision IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Verified claim required' USING ERRCODE='22023';
  END IF;
  SELECT active INTO cafe_active FROM public.cafes WHERE id=claim.cafe_id FOR NO KEY UPDATE;
  SELECT * INTO current_grant FROM public.ownership_access_grants WHERE cafe_id=claim.cafe_id AND revoked_at IS NULL;

  IF operation='grant' THEN
    IF current_grant.claim_id=target_claim THEN RETURN current_grant.id; END IF;
    IF NOT cafe_active OR current_grant.id IS NOT NULL OR
       EXISTS (SELECT 1 FROM public.ownership_access_grants WHERE claim_id=target_claim) OR
       EXISTS (SELECT 1 FROM public.cafe_memberships WHERE cafe_id=claim.cafe_id AND role='owner') OR
       NOT EXISTS (SELECT 1 FROM public.public_directory WHERE id=claim.branch_id) THEN
      RAISE EXCEPTION 'Café access cannot be granted' USING ERRCODE='40001';
    END IF;
    PERFORM 1 FROM public.users WHERE id=claim.user_id AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Verified claimant required' USING ERRCODE='22023'; END IF;
    INSERT INTO public.cafe_memberships(user_id,cafe_id,role) VALUES(claim.user_id,claim.cafe_id,'owner')
      RETURNING id INTO new_membership;
    INSERT INTO public.ownership_access_grants(claim_id,cafe_id,membership_id)
      VALUES(target_claim,claim.cafe_id,new_membership) RETURNING id INTO grant_id;
  ELSE
    IF current_grant.claim_id IS DISTINCT FROM target_claim THEN
      RAISE EXCEPTION 'No matching active grant' USING ERRCODE='40001';
    END IF;
    grant_id := current_grant.id;
    UPDATE public.ownership_access_grants SET membership_id=NULL,revoked_at=clock_timestamp() WHERE id=grant_id;
    DELETE FROM public.cafe_memberships WHERE id=current_grant.membership_id
      AND user_id=claim.user_id AND cafe_id=claim.cafe_id AND role='owner' AND branch_id IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Grant membership mismatch' USING ERRCODE='40001'; END IF;
  END IF;

  INSERT INTO public.audit_events(cafe_id,action,reason,metadata)
    VALUES(claim.cafe_id,'ownership.access_'||operation,btrim(explanation),
      jsonb_build_object('operator',session_user,'claimId',target_claim,'grantId',grant_id));
  RETURN grant_id;
END $$;
REVOKE ALL ON FUNCTION public.change_ownership_access(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_ownership_access(uuid,text,text) TO ghahvehto_ownership_access;
