-- Private attribution evidence. A touch is never an installation or verified identity.
CREATE TABLE public.cafe_tracking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  experience_id uuid,
  code_hash bytea NOT NULL UNIQUE CHECK(octet_length(code_hash)=32),
  active boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
  attribution_window_seconds integer NOT NULL CHECK(attribution_window_seconds BETWEEN 1 AND 31536000),
  FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),
  FOREIGN KEY(experience_id,cafe_id) REFERENCES public.experiences(id,cafe_id)
);
CREATE TABLE public.cafe_tracking_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.cafe_tracking_links(id),
  operation_id uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK(kind IN ('qr_scan','store_click')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.cafe_tracking_identity_facts (
  user_id uuid NOT NULL REFERENCES public.users(id),
  touch_id uuid NOT NULL REFERENCES public.cafe_tracking_touches(id),
  fact text NOT NULL CHECK(fact IN ('registration','phone_verified')),
  fact_at timestamptz NOT NULL,
  PRIMARY KEY(user_id,fact),
  UNIQUE(user_id,fact,touch_id)
);
CREATE TABLE public.cafe_tracking_interactions (
  entry_id uuid PRIMARY KEY REFERENCES public.stamp_entries(id),
  user_id uuid NOT NULL,
  touch_id uuid NOT NULL,
  required_fact text NOT NULL DEFAULT 'phone_verified' CHECK(required_fact='phone_verified'),
  confirmed_at timestamptz NOT NULL,
  FOREIGN KEY(user_id,required_fact,touch_id) REFERENCES public.cafe_tracking_identity_facts(user_id,fact,touch_id)
);
CREATE TRIGGER cafe_tracking_touches_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cafe_tracking_touches
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
CREATE TRIGGER cafe_tracking_identity_facts_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cafe_tracking_identity_facts
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
CREATE TRIGGER cafe_tracking_interactions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cafe_tracking_interactions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.cafe_tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_tracking_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_tracking_identity_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_tracking_interactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cafe_tracking_links,public.cafe_tracking_touches,public.cafe_tracking_identity_facts,public.cafe_tracking_interactions FROM PUBLIC;

CREATE FUNCTION public.record_cafe_tracking_touch(hashed_code bytea,event_kind text,operation uuid)
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
REVOKE ALL ON FUNCTION public.record_cafe_tracking_touch(bytea,text,uuid) FROM PUBLIC;

CREATE FUNCTION public.attribute_cafe_tracking_registration(recipient uuid,target_touch uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  member public.users%ROWTYPE;
  touch public.cafe_tracking_touches%ROWTYPE;
  window_seconds integer;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Tracking attribution requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR target_touch IS NULL THEN RAISE EXCEPTION 'Invalid tracking attribution' USING ERRCODE='22023'; END IF;
  SELECT * INTO member FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified tracking account unavailable' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cafe-tracking-identity:'||recipient::text,0));
  IF EXISTS(SELECT 1 FROM public.cafe_tracking_identity_facts WHERE user_id=recipient) THEN
    IF (SELECT count(*) FROM public.cafe_tracking_identity_facts WHERE user_id=recipient AND touch_id=target_touch)=2 THEN RETURN; END IF;
    RAISE EXCEPTION 'Tracking identity already attributed' USING ERRCODE='23505';
  END IF;
  SELECT * INTO touch FROM public.cafe_tracking_touches WHERE id=target_touch;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking touch unavailable' USING ERRCODE='22023'; END IF;
  SELECT attribution_window_seconds INTO window_seconds FROM public.cafe_tracking_links WHERE id=touch.link_id;
  IF member.created_at<touch.recorded_at OR member.phone_verified_at<member.created_at
    OR member.phone_verified_at>touch.recorded_at+window_seconds*interval '1 second'
    OR member.created_at>clock_timestamp() OR member.phone_verified_at>clock_timestamp() THEN
    RAISE EXCEPTION 'Tracking registration outside window' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.cafe_tracking_identity_facts(user_id,touch_id,fact,fact_at)
    VALUES(recipient,target_touch,'registration',member.created_at),(recipient,target_touch,'phone_verified',member.phone_verified_at);
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('tracking.registration_attributed','Stored registration and verification facts',jsonb_build_object('touchId',target_touch));
END $$;
REVOKE ALL ON FUNCTION public.attribute_cafe_tracking_registration(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION public.attribute_cafe_tracking_interaction(recipient uuid,interaction uuid)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  source_touch uuid;
  confirmed timestamptz;
  prior public.cafe_tracking_interactions%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Tracking attribution requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR interaction IS NULL THEN RAISE EXCEPTION 'Invalid tracking interaction' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified tracking account unavailable' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cafe-tracking-interaction:'||interaction::text,0));
  SELECT * INTO prior FROM public.cafe_tracking_interactions WHERE entry_id=interaction;
  IF FOUND THEN
    IF prior.user_id=recipient THEN RETURN; END IF;
    RAISE EXCEPTION 'Tracking interaction already attributed' USING ERRCODE='23505';
  END IF;
  SELECT f.touch_id,q.consumed_at INTO source_touch,confirmed FROM public.cafe_tracking_identity_facts f
    JOIN public.cafe_tracking_touches t ON t.id=f.touch_id JOIN public.cafe_tracking_links l ON l.id=t.link_id
    JOIN public.stamp_qr_tokens q ON q.entry_id=interaction AND q.recipient_id=f.user_id AND q.cafe_id=l.cafe_id AND q.branch_id=l.branch_id
    JOIN public.stamp_entries e ON e.id=q.entry_id AND e.user_id=f.user_id AND e.kind='award' AND e.units=1
    WHERE f.user_id=recipient AND f.fact='phone_verified' AND q.consumed_at>=f.fact_at
      AND q.consumed_at<=t.recorded_at+l.attribution_window_seconds*interval '1 second'
      AND NOT EXISTS(SELECT 1 FROM public.stamp_entries r WHERE r.reversal_of=e.id) FOR SHARE OF q;
  IF NOT FOUND THEN RAISE EXCEPTION 'Confirmed tracking interaction unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.cafe_tracking_interactions(entry_id,user_id,touch_id,confirmed_at) VALUES(interaction,recipient,source_touch,confirmed);
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('tracking.interaction_attributed','Confirmed QR interaction only',jsonb_build_object('touchId',source_touch,'entryId',interaction));
END $$;
REVOKE ALL ON FUNCTION public.attribute_cafe_tracking_interaction(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION public.inspect_cafe_tracking_metrics(target_link uuid)
RETURNS TABLE(qr_scans bigint,store_clicks bigint,registrations bigint,phone_verifications bigint,confirmed_interactions bigint)
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT (SELECT count(*) FROM public.cafe_tracking_touches t WHERE t.link_id=l.id AND t.kind='qr_scan'),
    (SELECT count(*) FROM public.cafe_tracking_touches t WHERE t.link_id=l.id AND t.kind='store_click'),
    (SELECT count(*) FROM public.cafe_tracking_identity_facts f JOIN public.cafe_tracking_touches t ON t.id=f.touch_id WHERE t.link_id=l.id AND f.fact='registration'),
    (SELECT count(*) FROM public.cafe_tracking_identity_facts f JOIN public.cafe_tracking_touches t ON t.id=f.touch_id WHERE t.link_id=l.id AND f.fact='phone_verified'),
    (SELECT count(*) FROM public.cafe_tracking_interactions f JOIN public.cafe_tracking_touches t ON t.id=f.touch_id WHERE t.link_id=l.id)
    FROM public.cafe_tracking_links l WHERE l.id=target_link;
$$;
REVOKE ALL ON FUNCTION public.inspect_cafe_tracking_metrics(uuid) FROM PUBLIC;

CREATE FUNCTION public.protect_cafe_tracking_link_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.cafe_id IS DISTINCT FROM OLD.cafe_id
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.experience_id IS DISTINCT FROM OLD.experience_id
    OR NEW.code_hash IS DISTINCT FROM OLD.code_hash OR NEW.attribution_window_seconds IS DISTINCT FROM OLD.attribution_window_seconds THEN
    RAISE EXCEPTION 'Tracking link scope is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_cafe_tracking_link_scope() FROM PUBLIC;
CREATE TRIGGER cafe_tracking_link_scope_immutable BEFORE UPDATE ON public.cafe_tracking_links
  FOR EACH ROW EXECUTE FUNCTION public.protect_cafe_tracking_link_scope();
