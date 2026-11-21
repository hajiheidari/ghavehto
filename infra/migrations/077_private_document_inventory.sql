CREATE FUNCTION public.list_private_content_documents(token_hash bytea,after_document uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; result jsonb;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  PERFORM 1 FROM public.operations_access WHERE user_id=actor ORDER BY role FOR SHARE;
  IF NOT public.operations_authorized(actor,'editor') THEN
    RAISE EXCEPTION 'Editor required' USING ERRCODE='42501';
  END IF;
  IF after_document IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.content_documents WHERE id=after_document) THEN
    RAISE EXCEPTION 'Invalid document cursor' USING ERRCODE='22023';
  END IF;
  WITH candidates AS (
    SELECT id,slug FROM public.content_documents WHERE after_document IS NULL OR id>after_document
    ORDER BY id LIMIT 21
  ), numbered AS (
    SELECT *,row_number() OVER(ORDER BY id) AS position FROM candidates
  )
  SELECT jsonb_build_object('items',coalesce(jsonb_agg(
    jsonb_build_object('documentId',d.id,'slug',d.slug,'revisionId',r.id,'revision',coalesce(r.revision,0),'title',r.title)
    ORDER BY d.id) FILTER(WHERE d.position<=20),'[]'::jsonb),
    'nextCursor',CASE WHEN count(*)>20 THEN (array_agg(d.id) FILTER(WHERE d.position=20))[1] END)
    INTO result FROM numbered d
    LEFT JOIN LATERAL (
      SELECT id,revision,title FROM public.content_revisions WHERE document_id=d.id ORDER BY revision DESC LIMIT 1
    ) r ON true;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.list_private_content_documents(bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_private_content_documents(bytea,uuid) TO ghahvehto_editorial;
