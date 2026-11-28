-- Configurable maintenance cleanup for old touches that have no identity/fact chain.
-- Existing linked facts and all three loyalty journals remain outside this routine.
CREATE TABLE public.cafe_tracking_retired_operations (
  operation_id uuid PRIMARY KEY,
  retired_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.cafe_tracking_archived_counts (
  link_id uuid NOT NULL REFERENCES public.cafe_tracking_links(id),
  kind text NOT NULL CHECK(kind IN ('qr_scan','store_click')),
  total bigint NOT NULL CHECK(total>0),
  PRIMARY KEY(link_id,kind)
);
ALTER TABLE public.cafe_tracking_retired_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_tracking_archived_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cafe_tracking_retired_operations,public.cafe_tracking_archived_counts FROM PUBLIC;
CREATE TRIGGER cafe_tracking_retired_operations_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cafe_tracking_retired_operations
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
CREATE INDEX cafe_tracking_touches_retention ON public.cafe_tracking_touches(recorded_at,id);

CREATE FUNCTION public.protect_tracking_retention_history()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' AND current_setting('ghahvehto.tracking_retention',true)='active'
    AND EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=TG_RELID AND pg_has_role(current_user,c.relowner,'USAGE')) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'Tracking history is immutable outside maintenance retention' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.protect_tracking_retention_history() FROM PUBLIC;
DROP TRIGGER cafe_tracking_touches_immutable ON public.cafe_tracking_touches;
CREATE TRIGGER cafe_tracking_touches_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cafe_tracking_touches
  FOR EACH STATEMENT EXECUTE FUNCTION public.protect_tracking_retention_history();
DROP TRIGGER cafe_tracking_consents_immutable ON public.cafe_tracking_consents;
CREATE TRIGGER cafe_tracking_consents_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cafe_tracking_consents
  FOR EACH STATEMENT EXECUTE FUNCTION public.protect_tracking_retention_history();

CREATE FUNCTION public.prune_unattributed_tracking(cutoff timestamptz)
RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE item record; removed integer:=0; previous_flag text:=coalesce(current_setting('ghahvehto.tracking_retention',true),'');
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Tracking retention requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF cutoff IS NULL OR NOT isfinite(cutoff) OR cutoff>clock_timestamp()-interval '24 hours' THEN
    RAISE EXCEPTION 'Retention cutoff must be at least 24 hours old' USING ERRCODE='22023';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('tracking-retention-maintenance',0)) THEN RETURN 0; END IF;
  PERFORM set_config('ghahvehto.tracking_retention','active',true);
  FOR item IN
    SELECT t.id,t.operation_id,t.link_id,t.kind
    FROM public.cafe_tracking_touches t JOIN public.cafe_tracking_links l ON l.id=t.link_id
    WHERE t.recorded_at<cutoff
      AND t.recorded_at+l.attribution_window_seconds*interval '1 second'<=clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM public.cafe_tracking_identity_facts f WHERE f.touch_id=t.id)
    ORDER BY t.recorded_at,t.id LIMIT 1000 FOR UPDATE OF t SKIP LOCKED
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('cafe-tracking-touch:'||item.operation_id::text,0));
    IF EXISTS(SELECT 1 FROM public.cafe_tracking_identity_facts f WHERE f.touch_id=item.id) THEN CONTINUE; END IF;
    INSERT INTO public.cafe_tracking_retired_operations(operation_id) VALUES(item.operation_id);
    INSERT INTO public.cafe_tracking_archived_counts(link_id,kind,total) VALUES(item.link_id,item.kind,1)
      ON CONFLICT(link_id,kind) DO UPDATE SET total=cafe_tracking_archived_counts.total+1;
    DELETE FROM public.cafe_tracking_consents WHERE operation_id=item.operation_id;
    DELETE FROM public.cafe_tracking_touches WHERE id=item.id;
    removed:=removed+1;
  END LOOP;
  PERFORM set_config('ghahvehto.tracking_retention',previous_flag,true);
  IF removed>0 THEN
    INSERT INTO public.audit_events(action,reason,metadata)
      VALUES('tracking.unattributed_pruned','Configured retention for expired unattributed touches',jsonb_build_object('removed',removed));
  END IF;
  RETURN removed;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('ghahvehto.tracking_retention',previous_flag,true);
  RAISE;
END $$;
REVOKE ALL ON FUNCTION public.prune_unattributed_tracking(timestamptz) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.record_cafe_tracking_touch(hashed_code bytea,event_kind text,operation uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  link public.cafe_tracking_links%ROWTYPE;
  prior public.cafe_tracking_touches%ROWTYPE;
  touch uuid;
  checked_at timestamptz;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Tracking requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF hashed_code IS NULL OR octet_length(hashed_code)<>32 OR event_kind IS NULL
    OR event_kind NOT IN ('qr_scan','store_click') OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid tracking touch' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cafe-tracking-touch:'||operation::text,0));
  IF EXISTS(SELECT 1 FROM public.cafe_tracking_retired_operations WHERE operation_id=operation) THEN
    RAISE EXCEPTION 'Tracking operation has expired' USING ERRCODE='22023';
  END IF;
  SELECT * INTO link FROM public.cafe_tracking_links WHERE code_hash=hashed_code FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking link unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO prior FROM public.cafe_tracking_touches WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.link_id=link.id AND prior.kind=event_kind THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Tracking operation already used' USING ERRCODE='23505';
  END IF;
  PERFORM 1 FROM public.cafes WHERE id=link.cafe_id AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking cafe unavailable' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.users u JOIN public.cafe_memberships m ON m.user_id=u.id AND m.role='owner'
    WHERE m.cafe_id=link.cafe_id FOR SHARE OF u;
  IF NOT link.active OR NOT EXISTS(
    SELECT 1 FROM public.ownership_access_grants g JOIN public.ownership_claims c ON c.id=g.claim_id AND c.cafe_id=g.cafe_id
      JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.cafe_id=g.cafe_id AND m.user_id=c.user_id AND m.role='owner'
      JOIN public.users u ON u.id=m.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
      WHERE g.cafe_id=link.cafe_id AND g.revoked_at IS NULL AND c.decision='verified') THEN
    RAISE EXCEPTION 'Tracking link unavailable' USING ERRCODE='22023';
  END IF;
  IF link.experience_id IS NOT NULL THEN
    PERFORM 1 FROM public.experiences WHERE id=link.experience_id AND cafe_id=link.cafe_id AND active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tracking experience unavailable' USING ERRCODE='22023'; END IF;
  END IF;
  checked_at:=clock_timestamp();
  IF link.expires_at<=checked_at THEN RAISE EXCEPTION 'Tracking link expired' USING ERRCODE='22023'; END IF;
  INSERT INTO public.cafe_tracking_touches(link_id,operation_id,kind,recorded_at) VALUES(link.id,operation,event_kind,checked_at) RETURNING id INTO touch;
  RETURN touch;
END $$;

CREATE OR REPLACE FUNCTION public.inspect_cafe_tracking_metrics(target_link uuid)
RETURNS TABLE(qr_scans bigint,store_clicks bigint,registrations bigint,phone_verifications bigint,confirmed_interactions bigint)
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT (SELECT count(*) FROM public.cafe_tracking_touches t WHERE t.link_id=l.id AND t.kind='qr_scan')+coalesce((SELECT a.total FROM public.cafe_tracking_archived_counts a WHERE a.link_id=l.id AND a.kind='qr_scan'),0),
    (SELECT count(*) FROM public.cafe_tracking_touches t WHERE t.link_id=l.id AND t.kind='store_click')+coalesce((SELECT a.total FROM public.cafe_tracking_archived_counts a WHERE a.link_id=l.id AND a.kind='store_click'),0),
    (SELECT count(*) FROM public.cafe_tracking_identity_facts f JOIN public.cafe_tracking_touches t ON t.id=f.touch_id WHERE t.link_id=l.id AND f.fact='registration'),
    (SELECT count(*) FROM public.cafe_tracking_identity_facts f JOIN public.cafe_tracking_touches t ON t.id=f.touch_id WHERE t.link_id=l.id AND f.fact='phone_verified'),
    (SELECT count(*) FROM public.cafe_tracking_interactions f JOIN public.cafe_tracking_touches t ON t.id=f.touch_id WHERE t.link_id=l.id)
    FROM public.cafe_tracking_links l WHERE l.id=target_link;
$$;
