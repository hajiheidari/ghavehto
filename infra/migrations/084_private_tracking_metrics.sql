CREATE INDEX cafe_tracking_touches_link_kind ON public.cafe_tracking_touches(link_id,kind);
CREATE INDEX cafe_tracking_identity_facts_touch ON public.cafe_tracking_identity_facts(touch_id,fact);
CREATE INDEX cafe_tracking_interactions_touch ON public.cafe_tracking_interactions(touch_id);

CREATE FUNCTION public.read_private_tracking_metrics(token_hash bytea,target_cafe uuid,target_link uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; result jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  PERFORM 1 FROM public.cafes WHERE id=target_cafe FOR SHARE;
  PERFORM 1 FROM public.ownership_access_grants g
    JOIN public.ownership_claims c ON c.id=g.claim_id AND c.cafe_id=g.cafe_id AND c.decision='verified'
    JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.cafe_id=g.cafe_id AND m.user_id=c.user_id AND m.role='owner'
    WHERE g.cafe_id=target_cafe AND g.revoked_at IS NULL AND m.user_id=actor
    FOR SHARE OF g,c,m;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.cafe_tracking_links WHERE id=target_link AND cafe_id=target_cafe) THEN
    RAISE EXCEPTION 'Tracking metrics unavailable' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object('linkId',target_link,'qrScans',qr_scans::text,'storeClicks',store_clicks::text,
    'registrations',registrations::text,'phoneVerifications',phone_verifications::text,
    'confirmedInteractions',confirmed_interactions::text)
    INTO result FROM public.inspect_cafe_tracking_metrics(target_link);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_private_tracking_metrics(bytea,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_tracking_metrics(bytea,uuid,uuid) TO ghahvehto_tracking_owner;
