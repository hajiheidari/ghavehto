-- Cancellation recovers internal reservation capacity only. No fulfillment exists.
-- Recorded participation and first-recorded-visit history are deliberately retained.
CREATE TABLE public.experience_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE REFERENCES public.experience_claims(id),
  operation_id uuid NOT NULL UNIQUE,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 240),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER experience_cancellations_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.experience_cancellations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.experience_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experience_cancellations FROM PUBLIC;

CREATE FUNCTION public.cancel_experience_claim(recipient uuid,target_claim uuid,operation uuid,explanation text)
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
REVOKE ALL ON FUNCTION public.cancel_experience_claim(uuid,uuid,uuid,text) FROM PUBLIC;

CREATE FUNCTION public.recover_experience_claim(recipient uuid,operation uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT jsonb_build_object('claimId',c.id,'experienceId',c.experience_id,'version',c.version,
    'branchId',c.branch_id,'budgetUnits',c.budget_units::text,
    'state',CASE WHEN x.id IS NULL THEN 'reserved' ELSE 'cancelled' END,'cancellationId',x.id)
  FROM public.experience_claims c LEFT JOIN public.experience_cancellations x ON x.claim_id=c.id
    JOIN public.users u ON u.id=c.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
  WHERE c.user_id=recipient AND c.operation_id=operation;
$$;
REVOKE ALL ON FUNCTION public.recover_experience_claim(uuid,uuid) FROM PUBLIC;
