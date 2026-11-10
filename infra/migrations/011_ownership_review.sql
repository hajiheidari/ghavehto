DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_ownership_review') THEN
    CREATE ROLE ghahvehto_ownership_review NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_ownership_review;
ALTER TABLE public.ownership_claims ADD COLUMN decision text CHECK (decision IN ('verified','rejected')),
  ADD CONSTRAINT ownership_claim_single_outcome CHECK (decision IS NULL OR withdrawn_at IS NULL);
CREATE VIEW public.ownership_review_queue WITH (security_barrier=true) AS
  SELECT id,cafe_id,branch_id,user_id,created_at FROM public.ownership_claims
  WHERE withdrawn_at IS NULL AND decision IS NULL;
REVOKE ALL ON public.ownership_review_queue FROM PUBLIC;
GRANT SELECT ON public.ownership_review_queue TO ghahvehto_ownership_review;

DROP INDEX public.ownership_claims_one_open;
CREATE UNIQUE INDEX ownership_claims_one_open ON public.ownership_claims(user_id,cafe_id)
  WHERE withdrawn_at IS NULL AND decision IS DISTINCT FROM 'rejected';

CREATE OR REPLACE FUNCTION public.submit_ownership_claim(target_branch uuid)
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
    WHERE user_id=actor AND cafe_id=target_cafe AND withdrawn_at IS NULL AND decision IS DISTINCT FROM 'rejected';
  IF FOUND THEN RETURN claim_id; END IF;
  IF (SELECT count(*) FROM public.ownership_claims WHERE user_id=actor AND withdrawn_at IS NULL AND decision IS NULL) >= 3 OR
     (SELECT count(*) FROM public.ownership_claims WHERE user_id=actor AND created_at>clock_timestamp()-interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Claim intake limit' USING ERRCODE='54000';
  END IF;
  INSERT INTO public.ownership_claims(user_id,cafe_id,branch_id) VALUES(actor,target_cafe,target_branch)
    RETURNING id INTO claim_id;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(actor,target_cafe,'ownership.claim_submitted','Claim intake only',jsonb_build_object('claimId',claim_id));
  RETURN claim_id;
END $$;

-- The reviewer attests to an evidence case in an approved private system.
-- Only its opaque reference is retained here; this never grants café access.
CREATE FUNCTION public.review_ownership_claim(target_claim uuid, verdict text, evidence_case uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  claim public.ownership_claims%ROWTYPE;
BEGIN
  IF verdict IS NULL OR verdict NOT IN ('verified','rejected') OR evidence_case IS NULL THEN
    RAISE EXCEPTION 'Invalid ownership review' USING ERRCODE='22023';
  END IF;
  SELECT * INTO claim FROM public.ownership_claims WHERE id=target_claim FOR UPDATE;
  IF NOT FOUND OR claim.withdrawn_at IS NOT NULL OR claim.decision IS NOT NULL THEN
    RAISE EXCEPTION 'Claim is not open' USING ERRCODE='40001';
  END IF;
  IF verdict='verified' THEN
    PERFORM 1 FROM public.users WHERE id=claim.user_id AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.public_directory WHERE id=claim.branch_id) THEN
      RAISE EXCEPTION 'Claim is no longer eligible' USING ERRCODE='22023';
    END IF;
  END IF;
  UPDATE public.ownership_claims SET decision=verdict WHERE id=target_claim;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(NULL,claim.cafe_id,'ownership.claim_reviewed','Manual evidence review',jsonb_build_object(
      'reviewer',session_user,'claimId',target_claim,'evidenceCaseId',evidence_case,'decision',verdict));
  RETURN verdict;
END $$;
REVOKE ALL ON FUNCTION public.review_ownership_claim(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_ownership_claim(uuid,text,uuid) TO ghahvehto_ownership_review;

CREATE OR REPLACE FUNCTION public.withdraw_ownership_claim(target_claim uuid)
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
    WHERE id=target_claim AND user_id=actor AND withdrawn_at IS NULL AND decision IS NULL RETURNING cafe_id INTO target_cafe;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(actor,target_cafe,'ownership.claim_withdrawn','Claimant withdrew request',jsonb_build_object('claimId',target_claim));
  RETURN true;
END $$;
