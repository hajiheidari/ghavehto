-- Read one exact review subject after checking the live session and internal role.
CREATE FUNCTION public.read_private_review_subject(token_hash bytea, subject_kind text, subject_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid; subject jsonb;
BEGIN
  actor := public.editorial_session_actor(token_hash);
  IF subject_kind IS NULL OR subject_kind NOT IN ('revision','job') THEN
    RAISE EXCEPTION 'Invalid review subject' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.operations_access WHERE user_id=actor ORDER BY role FOR SHARE;
  IF NOT public.operations_authorized(actor,CASE WHEN subject_kind='job' THEN 'admin' ELSE 'editor' END) THEN
    RAISE EXCEPTION 'Reviewer access required' USING ERRCODE='42501';
  END IF;

  IF subject_kind='job' THEN
    SELECT jsonb_build_object('jobId',j.id,'kind',j.kind,'payload',j.payload,'result',j.result)
      INTO subject FROM public.agent_jobs j WHERE j.id=subject_id AND j.state='awaiting_review';
  ELSE
    SELECT jsonb_build_object('revisionId',r.id,'documentId',r.document_id,'slug',d.slug,'revision',r.revision,
      'authorId',r.author_id,'title',r.title,'body',r.body,'sources',r.source_evidence)
      INTO subject FROM public.content_revisions r JOIN public.content_documents d ON d.id=r.document_id
      WHERE r.id=subject_id;
  END IF;
  RETURN subject || jsonb_build_object('payloadHash',encode(sha256(convert_to(subject::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION public.read_private_review_subject(bytea,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_review_subject(bytea,text,uuid) TO ghahvehto_editorial;
