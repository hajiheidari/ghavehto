DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_stamp_issuer') THEN
    CREATE ROLE ghahvehto_stamp_issuer NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_stamp_issuer;

ALTER TABLE public.stamp_entries
  ADD COLUMN award_branch_id uuid,
  ADD COLUMN award_actor_id uuid REFERENCES public.users(id),
  ADD FOREIGN KEY (award_branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),
  ADD CHECK ((award_branch_id IS NULL AND award_actor_id IS NULL) OR
    (award_branch_id IS NOT NULL AND award_actor_id IS NOT NULL AND kind='award' AND award_actor_id<>user_id));

-- Internal capability only. The future server caller must supply its verified actor;
-- never accept actor identity from a client payload or grant this to the web runtime.
CREATE FUNCTION public.award_branch_stamp(actor uuid, recipient uuid, target_cafe uuid, target_branch uuid,
  target_program uuid, target_version integer, operation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  previous public.stamp_entries%ROWTYPE;
  entry_id uuid;
  awarded_at timestamptz;
BEGIN
  IF actor IS NULL OR recipient IS NULL OR actor=recipient OR target_cafe IS NULL OR target_branch IS NULL OR
    target_program IS NULL OR target_version IS NULL OR target_version<1 OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid stamp award' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('stamp-award:'||operation::text,0));
  PERFORM 1 FROM public.cafes WHERE id=target_cafe AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stamp scope unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.branches WHERE id=target_branch AND cafe_id=target_cafe FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stamp scope unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cafe_memberships
    WHERE cafe_id=target_cafe AND user_id=actor AND
      ((role='owner' AND branch_id IS NULL) OR (role IN ('staff','manager') AND branch_id=target_branch))
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stamp scope unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.users WHERE id IN (actor,recipient) AND phone_verified_at IS NOT NULL AND deleted_at IS NULL
    ORDER BY id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=actor AND phone_verified_at IS NOT NULL AND deleted_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Stamp scope unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO previous FROM public.stamp_entries WHERE operation_id=operation;
  IF FOUND THEN
    IF previous.kind='award' AND previous.units=1 AND previous.user_id=recipient AND previous.cafe_id=target_cafe AND
      previous.program_id=target_program AND previous.program_version=target_version AND
      previous.award_actor_id=actor AND previous.award_branch_id=target_branch THEN RETURN previous.id; END IF;
    RAISE EXCEPTION 'Stamp operation already used' USING ERRCODE='23505';
  END IF;
  PERFORM 1 FROM public.stamp_program_versions
    WHERE program_id=target_program AND cafe_id=target_cafe AND version=target_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stamp program version unavailable' USING ERRCODE='22023'; END IF;
  awarded_at:=clock_timestamp();
  INSERT INTO public.stamp_entries(user_id,cafe_id,program_id,program_version,operation_id,units,kind,reason,effective_at,award_branch_id,award_actor_id)
    VALUES(recipient,target_cafe,target_program,target_version,operation,1,'award','Authorized branch award',awarded_at,target_branch,actor)
    RETURNING id INTO entry_id;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(actor,target_cafe,'loyalty.stamp_awarded','Authorized branch award',
      jsonb_build_object('branchId',target_branch,'entryId',entry_id,'operationId',operation));
  RETURN entry_id;
END $$;
REVOKE ALL ON FUNCTION public.award_branch_stamp(uuid,uuid,uuid,uuid,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_branch_stamp(uuid,uuid,uuid,uuid,uuid,integer,uuid) TO ghahvehto_stamp_issuer;
