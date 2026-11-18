CREATE FUNCTION public.can_record_experience_fulfillment(staff uuid,claim public.experience_claims)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.users WHERE id=staff AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR staff=claim.user_id THEN RETURN false; END IF;
  PERFORM 1 FROM public.cafes WHERE id=claim.cafe_id AND active FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(
    SELECT 1 FROM public.ownership_access_grants g
    JOIN public.ownership_claims c ON c.id=g.claim_id AND c.cafe_id=g.cafe_id
    JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.cafe_id=g.cafe_id AND m.user_id=c.user_id AND m.role='owner'
    JOIN public.users u ON u.id=m.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
    WHERE g.cafe_id=claim.cafe_id AND g.revoked_at IS NULL AND c.decision='verified'
  ) THEN RETURN false; END IF;
  PERFORM 1 FROM public.cafe_memberships WHERE user_id=staff AND cafe_id=claim.cafe_id
    AND (branch_id IS NULL AND role='owner' OR branch_id=claim.branch_id AND role IN ('manager','staff')) FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.can_record_experience_fulfillment(uuid,public.experience_claims) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.record_experience_fulfillment(staff uuid,target_claim uuid,operation uuid,explanation text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  claim public.experience_claims%ROWTYPE;
  prior public.experience_fulfillments%ROWTYPE;
  receipt uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Experience fulfillment requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF staff IS NULL OR target_claim IS NULL OR operation IS NULL OR explanation IS NULL
    OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid experience fulfillment' USING ERRCODE='22023';
  END IF;
  SELECT * INTO claim FROM public.experience_claims WHERE id=target_claim;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience claim unavailable' USING ERRCODE='22023'; END IF;
  IF NOT public.can_record_experience_fulfillment(staff,claim) THEN
    RAISE EXCEPTION 'Fulfillment staff required' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('experience-fulfillment:'||operation::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('experience-member:'||claim.user_id::text||':'||claim.cafe_id::text,0));
  SELECT * INTO prior FROM public.experience_fulfillments WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.claim_id=target_claim AND prior.recorded_by=staff AND prior.reason=btrim(explanation) THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Experience fulfillment operation already used' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.experience_cancellations WHERE claim_id=target_claim)
    OR EXISTS(SELECT 1 FROM public.experience_fulfillments WHERE claim_id=target_claim) THEN
    RAISE EXCEPTION 'Experience claim already closed' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.experience_fulfillments(claim_id,operation_id,recorded_by,reason)
    VALUES(target_claim,operation,staff,btrim(explanation)) RETURNING id INTO receipt;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(staff,claim.cafe_id,'experience.fulfilled',btrim(explanation),jsonb_build_object('claimId',target_claim,'fulfillmentId',receipt));
  RETURN receipt;
END $$;
CREATE FUNCTION public.read_private_fulfillment_claim(token_hash bytea, target_claim uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; claim public.experience_claims%ROWTYPE;
BEGIN
  actor := public.editorial_session_actor(token_hash);
  SELECT * INTO claim FROM public.experience_claims WHERE id=target_claim;
  IF NOT FOUND OR NOT public.can_record_experience_fulfillment(actor,claim) THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object('claimId',claim.id,'title',e.title,'branchName',b.name,
      'state',CASE WHEN x.id IS NOT NULL THEN 'cancelled' WHEN f.id IS NOT NULL THEN 'fulfilled' ELSE 'reserved' END)
    FROM public.experiences e JOIN public.branches b ON b.id=claim.branch_id AND b.cafe_id=e.cafe_id
    LEFT JOIN public.experience_cancellations x ON x.claim_id=claim.id
    LEFT JOIN public.experience_fulfillments f ON f.claim_id=claim.id
    WHERE e.id=claim.experience_id AND e.cafe_id=claim.cafe_id
  );
END $$;
REVOKE ALL ON FUNCTION public.read_private_fulfillment_claim(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_fulfillment_claim(bytea,uuid) TO ghahvehto_participation;
