-- Internal reservation of participation, not external reward fulfillment or payment.
CREATE FUNCTION public.claim_experience(recipient uuid,target_experience uuid,target_version integer,target_branch uuid,operation uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.experience_claims%ROWTYPE;
  target_cafe uuid;
  policy public.experience_versions%ROWTYPE;
  checked_at timestamptz;
  receipt uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Experience claims require read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR target_experience IS NULL OR target_version IS NULL OR target_version<1
    OR target_branch IS NULL OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid experience claim' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('experience-claim:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience account unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM public.experience_claims WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.user_id=recipient AND prior.experience_id=target_experience AND prior.version=target_version
      AND prior.branch_id=target_branch THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Experience operation already used' USING ERRCODE='23505';
  END IF;
  SELECT cafe_id INTO target_cafe FROM public.experiences WHERE id=target_experience FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience unavailable' USING ERRCODE='22023'; END IF;
  -- Ownership revocation uses the same café row before changing the active grant.
  PERFORM 1 FROM public.cafes WHERE id=target_cafe FOR SHARE;
  PERFORM 1 FROM public.users u JOIN public.cafe_memberships m ON m.user_id=u.id AND m.role='owner'
    WHERE m.cafe_id=target_cafe ORDER BY u.id FOR SHARE OF u;
  SELECT * INTO policy FROM public.experience_versions
    WHERE experience_id=target_experience AND cafe_id=target_cafe AND version=target_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience unavailable' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.experience_capacity WHERE experience_id=target_experience AND cafe_id=target_cafe
    AND version=target_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience capacity unavailable' USING ERRCODE='22023'; END IF;
  -- Serialize a member across campaigns and versions, not just within one stock row.
  PERFORM pg_advisory_xact_lock(hashtextextended('experience-member:'||recipient::text||':'||target_cafe::text,0));
  checked_at:=clock_timestamp();
  IF public.inspect_experience_eligibility(recipient,target_experience,target_version,target_branch,checked_at) IS DISTINCT FROM 'eligible' THEN
    RAISE EXCEPTION 'Experience eligibility unavailable' USING ERRCODE='22023';
  END IF;
  UPDATE public.experience_capacity SET remaining_stock=remaining_stock-1,
    remaining_budget_units=remaining_budget_units-policy.budget_units_per_claim
    WHERE experience_id=target_experience AND cafe_id=target_cafe AND version=target_version
      AND remaining_stock>0 AND remaining_budget_units>=policy.budget_units_per_claim;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience capacity unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.experience_claims(operation_id,user_id,cafe_id,branch_id,experience_id,version,budget_units,claimed_at)
    VALUES(operation,recipient,target_cafe,target_branch,target_experience,target_version,policy.budget_units_per_claim,checked_at)
    RETURNING id INTO receipt;
  IF policy.first_recorded_visit_only THEN
    INSERT INTO public.experience_first_visits(user_id,cafe_id,claim_id) VALUES(recipient,target_cafe,receipt);
  END IF;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(recipient,target_cafe,'experience.claimed','Internal experience participation',
      jsonb_build_object('claimId',receipt,'experienceId',target_experience,'version',target_version));
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.claim_experience(uuid,uuid,integer,uuid,uuid) FROM PUBLIC;
