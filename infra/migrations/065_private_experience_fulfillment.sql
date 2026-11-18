-- Record private fulfillment evidence without moving money or loyalty balances.
CREATE TABLE public.experience_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE REFERENCES public.experience_claims(id),
  operation_id uuid NOT NULL UNIQUE,
  recorded_by uuid NOT NULL REFERENCES public.users(id),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 240),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER experience_fulfillments_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.experience_fulfillments
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.experience_fulfillments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experience_fulfillments FROM PUBLIC;

CREATE FUNCTION public.record_experience_fulfillment(staff uuid,target_claim uuid,operation uuid,explanation text)
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
  PERFORM 1 FROM public.users WHERE id=staff AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR staff=claim.user_id THEN RAISE EXCEPTION 'Fulfillment staff required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cafes WHERE id=claim.cafe_id AND active FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(
    SELECT 1 FROM public.ownership_access_grants g
    JOIN public.ownership_claims c ON c.id=g.claim_id AND c.cafe_id=g.cafe_id
    JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.cafe_id=g.cafe_id AND m.user_id=c.user_id AND m.role='owner'
    JOIN public.users u ON u.id=m.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
    WHERE g.cafe_id=claim.cafe_id AND g.revoked_at IS NULL AND c.decision='verified'
  ) THEN RAISE EXCEPTION 'Verified cafe ownership required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cafe_memberships WHERE user_id=staff AND cafe_id=claim.cafe_id
    AND (branch_id IS NULL AND role='owner' OR branch_id=claim.branch_id AND role IN ('manager','staff')) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fulfillment staff required' USING ERRCODE='42501'; END IF;

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
REVOKE ALL ON FUNCTION public.record_experience_fulfillment(uuid,uuid,uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cancel_experience_claim(recipient uuid,target_claim uuid,operation uuid,explanation text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  receipt public.experience_claims%ROWTYPE;
  prior public.experience_cancellations%ROWTYPE;
  cancellation uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Experience recovery requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR target_claim IS NULL OR operation IS NULL OR explanation IS NULL
    OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid experience cancellation' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('experience-cancellation:'||operation::text,0));
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience account unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO receipt FROM public.experience_claims WHERE id=target_claim AND user_id=recipient;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience claim unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO prior FROM public.experience_cancellations WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.claim_id=target_claim AND prior.reason=btrim(explanation) THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Experience cancellation operation already used' USING ERRCODE='23505';
  END IF;
  -- Match claim lock order; cancellation also works after campaign/ownership pause.
  PERFORM 1 FROM public.experiences WHERE id=receipt.experience_id FOR SHARE;
  PERFORM 1 FROM public.cafes WHERE id=receipt.cafe_id FOR SHARE;
  PERFORM 1 FROM public.experience_capacity WHERE experience_id=receipt.experience_id
    AND cafe_id=receipt.cafe_id AND version=receipt.version FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('experience-member:'||recipient::text||':'||receipt.cafe_id::text,0));
  IF EXISTS(SELECT 1 FROM public.experience_cancellations WHERE claim_id=target_claim) THEN
    RAISE EXCEPTION 'Experience claim already cancelled' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.experience_fulfillments WHERE claim_id=target_claim) THEN
    RAISE EXCEPTION 'Experience claim already fulfilled' USING ERRCODE='22023';
  END IF;
  UPDATE public.experience_capacity SET remaining_stock=remaining_stock+1,
    remaining_budget_units=remaining_budget_units+receipt.budget_units
    WHERE experience_id=receipt.experience_id AND cafe_id=receipt.cafe_id AND version=receipt.version
      AND remaining_stock<stocked_units AND remaining_budget_units<=funded_budget_units-receipt.budget_units;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience recovery capacity unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.experience_cancellations(claim_id,operation_id,reason)
    VALUES(target_claim,operation,btrim(explanation)) RETURNING id INTO cancellation;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(recipient,receipt.cafe_id,'experience.cancelled',btrim(explanation),jsonb_build_object('claimId',target_claim,'cancellationId',cancellation));
  RETURN cancellation;
END $$;
CREATE OR REPLACE FUNCTION public.recover_experience_claim(recipient uuid,operation uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT jsonb_build_object('claimId',c.id,'experienceId',c.experience_id,'version',c.version,
    'branchId',c.branch_id,'budgetUnits',c.budget_units::text,
    'state',CASE WHEN x.id IS NOT NULL THEN 'cancelled' WHEN f.id IS NOT NULL THEN 'fulfilled' ELSE 'reserved' END,
    'cancellationId',x.id)
    || CASE WHEN f.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('fulfillmentId',f.id) END
  FROM public.experience_claims c LEFT JOIN public.experience_cancellations x ON x.claim_id=c.id
    LEFT JOIN public.experience_fulfillments f ON f.claim_id=c.id
    JOIN public.users u ON u.id=c.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
  WHERE c.user_id=recipient AND c.operation_id=operation;
$$;
