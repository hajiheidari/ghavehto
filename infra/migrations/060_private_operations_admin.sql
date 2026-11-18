-- Admins delegate editor/operator roles and configure internal draft controls.
-- Admin provisioning stays with maintenance; there is no session-facing admin grant.
CREATE FUNCTION public.private_operations_admin(token_hash bytea)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid;
BEGIN
  actor := public.editorial_session_actor(token_hash);
  PERFORM 1 FROM public.operations_access WHERE user_id=actor AND role='admin' FOR SHARE;
  IF NOT public.operations_authorized(actor,'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
  END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.private_operations_admin(bytea) FROM PUBLIC;

CREATE FUNCTION public.set_private_operations_role(token_hash bytea, target uuid, assigned_role text,
  enabled boolean, explanation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid;
BEGIN
  actor := public.private_operations_admin(token_hash);
  IF target IS NULL OR assigned_role IS NULL OR assigned_role NOT IN ('editor','operator') OR enabled IS NULL
    OR explanation IS NULL OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid role change' USING ERRCODE='22023';
  END IF;
  IF enabled THEN
    PERFORM 1 FROM public.users WHERE id=target AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active verified target required' USING ERRCODE='22023'; END IF;
    INSERT INTO public.operations_access AS access(user_id,role) VALUES(target,assigned_role)
      ON CONFLICT(user_id,role) DO UPDATE SET revoked_at=NULL WHERE access.revoked_at IS NOT NULL;
  ELSE
    UPDATE public.operations_access SET revoked_at=clock_timestamp()
      WHERE user_id=target AND role=assigned_role AND revoked_at IS NULL;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.audit_events(actor_id,action,reason,metadata)
    VALUES(actor,'operations.role_changed',btrim(explanation),
      jsonb_build_object('userId',target,'role',assigned_role,'enabled',enabled));
  RETURN true;
END $$;

CREATE FUNCTION public.set_private_draft_control(token_hash bytea, job_kind text, should_pause boolean,
  attempts integer, explanation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid;
BEGIN
  actor := public.private_operations_admin(token_hash);
  IF job_kind IS NULL OR job_kind NOT IN ('research','content') OR should_pause IS NULL
    OR attempts IS NULL OR attempts NOT BETWEEN 1 AND 10
    OR explanation IS NULL OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid internal draft control' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.agent_controls AS control(kind,paused,attempt_limit) VALUES(job_kind,should_pause,attempts)
    ON CONFLICT(kind) DO UPDATE SET paused=excluded.paused,attempt_limit=excluded.attempt_limit
    WHERE (control.paused,control.attempt_limit) IS DISTINCT FROM (excluded.paused,excluded.attempt_limit);
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.audit_events(actor_id,action,reason,metadata)
    VALUES(actor,'agent.control_changed',btrim(explanation),
      jsonb_build_object('kind',job_kind,'paused',should_pause,'attemptLimit',attempts));
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.set_private_operations_role(bytea,uuid,text,boolean,text),
  public.set_private_draft_control(bytea,text,boolean,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_private_operations_role(bytea,uuid,text,boolean,text),
  public.set_private_draft_control(bytea,text,boolean,integer,text) TO ghahvehto_editorial;
