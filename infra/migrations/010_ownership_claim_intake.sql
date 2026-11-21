CREATE TABLE public.ownership_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  withdrawn_at timestamptz,
  FOREIGN KEY (branch_id,cafe_id) REFERENCES public.branches(id,cafe_id)
);
CREATE UNIQUE INDEX ownership_claims_one_open ON public.ownership_claims(user_id,cafe_id) WHERE withdrawn_at IS NULL;
CREATE INDEX ownership_claims_recent ON public.ownership_claims(user_id,created_at DESC,id);
ALTER TABLE public.ownership_claims ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ownership_claims TO ghahvehto_app;
CREATE POLICY ownership_claim_self_read ON public.ownership_claims FOR SELECT TO ghahvehto_app
  USING (user_id=nullif(current_setting('app.user_id',true),'')::uuid);

CREATE FUNCTION public.submit_ownership_claim(target_branch uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
  target_cafe uuid;
  claim_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=actor AND phone_verified_at IS NOT NULL AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Verified actor required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ownership-claim:'||actor::text,0));
  SELECT d.cafe_id INTO target_cafe FROM public.public_directory p
    JOIN public.directory_listings d ON d.branch_id=p.id WHERE p.id=target_branch;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id INTO claim_id FROM public.ownership_claims
    WHERE user_id=actor AND cafe_id=target_cafe AND withdrawn_at IS NULL;
  IF FOUND THEN RETURN claim_id; END IF;
  IF (SELECT count(*) FROM public.ownership_claims WHERE user_id=actor AND withdrawn_at IS NULL) >= 3 OR
     (SELECT count(*) FROM public.ownership_claims WHERE user_id=actor AND created_at>clock_timestamp()-interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Claim intake limit' USING ERRCODE='54000';
  END IF;
  INSERT INTO public.ownership_claims(user_id,cafe_id,branch_id) VALUES(actor,target_cafe,target_branch)
    RETURNING id INTO claim_id;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(actor,target_cafe,'ownership.claim_submitted','Claim intake only',jsonb_build_object('claimId',claim_id));
  RETURN claim_id;
END $$;

CREATE FUNCTION public.withdraw_ownership_claim(target_claim uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
  target_cafe uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=actor AND phone_verified_at IS NOT NULL AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Verified actor required' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ownership-claim:'||actor::text,0));
  UPDATE public.ownership_claims SET withdrawn_at=clock_timestamp()
    WHERE id=target_claim AND user_id=actor AND withdrawn_at IS NULL RETURNING cafe_id INTO target_cafe;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(actor,target_cafe,'ownership.claim_withdrawn','Claimant withdrew request',jsonb_build_object('claimId',target_claim));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.submit_ownership_claim(uuid),public.withdraw_ownership_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_ownership_claim(uuid),public.withdraw_ownership_claim(uuid) TO ghahvehto_app;
