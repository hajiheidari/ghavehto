CREATE FUNCTION public.read_private_content_review(token_hash bytea,target_revision uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; receipt jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  PERFORM 1 FROM public.operations_access WHERE user_id=actor ORDER BY role FOR SHARE;
  IF NOT public.operations_authorized(actor,'editor') THEN
    RAISE EXCEPTION 'Editor required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.content_revisions WHERE id=target_revision) THEN
    RAISE EXCEPTION 'Revision unavailable' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_build_object('reviewId',r.id,'decision',r.decision,'reason',r.reason,
    'createdAt',r.created_at,'expiresAt',r.expires_at,
    'usable',public.operation_review_usable(r.id,public.operation_subject_hash(NULL,target_revision)))
    INTO receipt FROM public.operation_reviews r WHERE r.revision_id=target_revision;
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.read_private_content_review(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_content_review(bytea,uuid) TO ghahvehto_editorial;
