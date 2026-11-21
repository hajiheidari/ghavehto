-- Maintenance can record a verified owner's stop request for one link.
CREATE FUNCTION public.stop_cafe_tracking_link(actor uuid, target_link uuid, explanation text)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE link public.cafe_tracking_links%ROWTYPE;
BEGIN
  IF actor IS NULL OR target_link IS NULL OR explanation IS NULL
    OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid tracking stop request' USING ERRCODE='22023';
  END IF;
  SELECT * INTO link FROM public.cafe_tracking_links WHERE id=target_link FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking link unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cafes WHERE id=link.cafe_id FOR SHARE;
  PERFORM 1 FROM public.ownership_access_grants g
    JOIN public.ownership_claims c ON c.id=g.claim_id AND c.cafe_id=g.cafe_id AND c.decision='verified'
    JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.cafe_id=g.cafe_id AND m.user_id=c.user_id AND m.role='owner'
    JOIN public.users u ON u.id=m.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
    WHERE g.cafe_id=link.cafe_id AND g.revoked_at IS NULL AND u.id=actor
    FOR SHARE OF g,c,m,u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking link unavailable' USING ERRCODE='42501'; END IF;
  IF NOT link.active THEN RETURN false; END IF;
  UPDATE public.cafe_tracking_links SET active=false WHERE id=link.id;
  INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
    VALUES(actor,link.cafe_id,'tracking.link_stopped',btrim(explanation),jsonb_build_object('linkId',link.id));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.stop_cafe_tracking_link(uuid,uuid,text) FROM PUBLIC;
