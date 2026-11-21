CREATE INDEX cafe_tracking_links_owner_page ON public.cafe_tracking_links(cafe_id,id);
CREATE FUNCTION public.list_private_tracking_links(token_hash bytea,target_cafe uuid,after_link uuid)
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking cafe unavailable' USING ERRCODE='42501'; END IF;
  IF after_link IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cafe_tracking_links WHERE id=after_link AND cafe_id=target_cafe) THEN
    RAISE EXCEPTION 'Invalid tracking cursor' USING ERRCODE='22023';
  END IF;
  WITH candidates AS (
    SELECT l.id,l.branch_id,l.active,l.expires_at FROM public.cafe_tracking_links l
    WHERE l.cafe_id=target_cafe AND (after_link IS NULL OR l.id>after_link) ORDER BY l.id LIMIT 21
  ), numbered AS (
    SELECT *,row_number() OVER(ORDER BY id) AS position FROM candidates
  )
  SELECT jsonb_build_object('items',coalesce(jsonb_agg(
    jsonb_build_object('linkId',id,'branchId',branch_id,'active',active,'expiresAt',expires_at)
    ORDER BY id) FILTER(WHERE position<=20),'[]'::jsonb),
    'nextCursor',CASE WHEN count(*)>20 THEN (array_agg(id) FILTER(WHERE position=20))[1] END)
    INTO result FROM numbered;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_private_tracking_links(bytea,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_private_tracking_links(bytea,uuid,uuid) TO ghahvehto_tracking_owner;
