-- Existing maintenance-provisioned documents keep their original identity.
ALTER TABLE public.content_documents ADD COLUMN created_by uuid REFERENCES public.users(id);

CREATE FUNCTION public.create_private_content_document(token_hash bytea, document uuid, document_slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; inserted uuid;
BEGIN
  actor := public.editorial_session_actor(token_hash);
  PERFORM 1 FROM public.operations_access WHERE user_id=actor ORDER BY role FOR SHARE;
  IF NOT public.operations_authorized(actor,'editor') THEN
    RAISE EXCEPTION 'Editor required' USING ERRCODE='42501';
  END IF;
  IF document IS NULL OR document_slug IS NULL OR document_slug !~ '^[a-z0-9][a-z0-9-]{0,119}$' THEN
    RAISE EXCEPTION 'Invalid document' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.content_documents(id,slug,created_by) VALUES(document,document_slug,actor)
    ON CONFLICT DO NOTHING RETURNING id INTO inserted;
  IF inserted IS NOT NULL THEN
    INSERT INTO public.audit_events(actor_id,action,reason,metadata)
      VALUES(actor,'content.document_created','Private CMS document',jsonb_build_object('documentId',inserted));
  ELSIF NOT EXISTS(SELECT 1 FROM public.content_documents WHERE id=document AND slug=document_slug AND created_by=actor) THEN
    RAISE EXCEPTION 'Document already exists' USING ERRCODE='23505';
  END IF;
  RETURN document;
END $$;
REVOKE ALL ON FUNCTION public.create_private_content_document(bytea,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_private_content_document(bytea,uuid,text) TO ghahvehto_editorial;
