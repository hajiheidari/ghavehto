-- Client-supplied evidence only qualifies if the landing recorded consent.
CREATE OR REPLACE FUNCTION public.attach_cafe_tracking_at_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  supplied_code text:=current_setting('ghahvehto.registration_tracking_code',true);
  supplied_touch text:=current_setting('ghahvehto.registration_tracking_touch',true);
  target_touch uuid;
BEGIN
  IF NEW.phone_verified_at IS NULL OR NEW.deleted_at IS NOT NULL
    OR supplied_code IS NULL OR supplied_code !~ '^[0-9a-f]{64}$'
    OR supplied_touch IS NULL OR supplied_touch !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN NEW; END IF;
  SELECT t.id INTO target_touch FROM public.cafe_tracking_touches t
    JOIN public.cafe_tracking_consents consent ON consent.operation_id=t.operation_id
    JOIN public.cafe_tracking_links l ON l.id=t.link_id
    JOIN public.cafes c ON c.id=l.cafe_id AND c.active
    WHERE t.id=supplied_touch::uuid AND l.code_hash=decode(supplied_code,'hex')
      AND l.active AND l.expires_at>clock_timestamp()
      AND (l.experience_id IS NULL OR EXISTS(SELECT 1 FROM public.experiences e WHERE e.id=l.experience_id AND e.cafe_id=l.cafe_id AND e.active))
      AND EXISTS(SELECT 1 FROM public.ownership_access_grants g
        JOIN public.ownership_claims oc ON oc.id=g.claim_id AND oc.cafe_id=g.cafe_id
        JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.cafe_id=g.cafe_id AND m.user_id=oc.user_id AND m.role='owner'
        JOIN public.users u ON u.id=m.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
        WHERE g.cafe_id=l.cafe_id AND g.revoked_at IS NULL AND oc.decision='verified');
  IF target_touch IS NULL THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.attribute_cafe_tracking_registration(NEW.id,target_touch);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    -- Stale optional evidence is ignored; unexpected storage failures roll back.
    NULL;
  END;
  RETURN NEW;
END $$;
