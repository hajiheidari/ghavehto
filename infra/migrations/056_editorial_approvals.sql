-- Explicit internal assignments only. No seeded admin/editor or public grants.
CREATE TABLE public.operations_access (
  user_id uuid NOT NULL REFERENCES public.users(id),
  role text NOT NULL CHECK(role IN ('admin','editor','operator')),
  revoked_at timestamptz,
  PRIMARY KEY(user_id,role)
);
CREATE TABLE public.content_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{0,119}$')
);
CREATE TABLE public.content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.content_documents(id),
  revision integer NOT NULL CHECK(revision>0),
  operation_id uuid NOT NULL UNIQUE,
  author_id uuid NOT NULL REFERENCES public.users(id),
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
  body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 50000),
  source_evidence jsonb NOT NULL CHECK(jsonb_typeof(source_evidence)='array' AND jsonb_array_length(source_evidence) BETWEEN 1 AND 50 AND octet_length(source_evidence::text)<=65536),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(document_id,revision)
);
CREATE TABLE public.operation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  job_id uuid UNIQUE REFERENCES public.agent_jobs(id),
  revision_id uuid UNIQUE REFERENCES public.content_revisions(id),
  reviewer_id uuid NOT NULL REFERENCES public.users(id),
  decision text NOT NULL CHECK(decision IN ('approved','rejected')),
  lifetime_seconds integer NOT NULL CHECK(lifetime_seconds BETWEEN 1 AND 604800),
  payload_hash bytea NOT NULL CHECK(octet_length(payload_hash)=32),
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL CHECK(isfinite(expires_at) AND expires_at>created_at),
  CHECK((job_id IS NULL)<>(revision_id IS NULL))
);
CREATE TRIGGER content_revisions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.content_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
CREATE TRIGGER operation_reviews_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.operation_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.operations_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operations_access,public.content_documents,public.content_revisions,public.operation_reviews FROM PUBLIC;

CREATE FUNCTION public.operations_authorized(actor uuid,required_role text)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT required_role IN ('admin','editor','operator') AND EXISTS(
    SELECT 1 FROM public.users u JOIN public.operations_access a ON a.user_id=u.id
    WHERE u.id=actor AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL AND a.revoked_at IS NULL
      AND a.role IN (required_role,'admin'));
$$;
REVOKE ALL ON FUNCTION public.operations_authorized(uuid,text) FROM PUBLIC;

CREATE FUNCTION public.save_content_revision(actor uuid,document uuid,expected_revision integer,operation uuid,
  heading text,content text,evidence jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior public.content_revisions%ROWTYPE; previous integer; result uuid; source jsonb;
BEGIN
  PERFORM 1 FROM public.users WHERE id=actor FOR SHARE;
  PERFORM 1 FROM public.operations_access WHERE user_id=actor ORDER BY role FOR SHARE;
  IF NOT public.operations_authorized(actor,'editor') THEN RAISE EXCEPTION 'Editor required' USING ERRCODE='42501'; END IF;
  IF document IS NULL OR operation IS NULL OR expected_revision IS NULL OR expected_revision<0
    OR heading IS NULL OR length(btrim(heading)) NOT BETWEEN 1 AND 160
    OR content IS NULL OR length(btrim(content)) NOT BETWEEN 1 AND 50000
    OR jsonb_typeof(evidence) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid content revision' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(evidence) NOT BETWEEN 1 AND 50 OR octet_length(evidence::text)>65536 THEN
    RAISE EXCEPTION 'Source evidence required' USING ERRCODE='22023'; END IF;
  FOR source IN SELECT value FROM jsonb_array_elements(evidence) LOOP
    IF jsonb_typeof(source) IS DISTINCT FROM 'object' OR coalesce(source->>'rights','') NOT IN ('original','permitted')
      OR (source->>'rights'='permitted' AND coalesce(source->>'url','') !~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$') THEN
      RAISE EXCEPTION 'Reviewed source rights evidence required' USING ERRCODE='22023'; END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('content-revision:'||operation::text,0));
  SELECT * INTO prior FROM public.content_revisions WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.document_id=document AND prior.author_id=actor AND prior.revision=expected_revision+1
      AND prior.title=btrim(heading) AND prior.body=content AND prior.source_evidence=evidence THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Content operation already used' USING ERRCODE='23505';
  END IF;
  PERFORM 1 FROM public.content_documents WHERE id=document FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Content document unavailable' USING ERRCODE='22023'; END IF;
  SELECT coalesce(max(revision),0) INTO previous FROM public.content_revisions WHERE document_id=document;
  IF previous<>expected_revision THEN RAISE EXCEPTION 'Content revision changed' USING ERRCODE='40001'; END IF;
  INSERT INTO public.content_revisions(document_id,revision,operation_id,author_id,title,body,source_evidence)
    VALUES(document,previous+1,operation,actor,btrim(heading),content,evidence) RETURNING id INTO result;
  INSERT INTO public.audit_events(actor_id,action,reason,metadata)
    VALUES(actor,'content.revised','Private original content draft',jsonb_build_object('revisionId',result));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_content_revision(uuid,uuid,integer,uuid,text,text,jsonb) FROM PUBLIC;

CREATE FUNCTION public.operation_subject_hash(subject_job uuid,subject_revision uuid)
RETURNS bytea LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT CASE WHEN subject_job IS NOT NULL AND subject_revision IS NULL THEN (
    SELECT sha256(convert_to(jsonb_build_object('jobId',j.id,'kind',j.kind,'payload',j.payload,'result',j.result)::text,'UTF8'))
    FROM public.agent_jobs j WHERE j.id=subject_job AND j.state='awaiting_review')
  WHEN subject_job IS NULL AND subject_revision IS NOT NULL THEN (
    SELECT sha256(convert_to(jsonb_build_object('revisionId',r.id,'documentId',r.document_id,'slug',d.slug,
      'revision',r.revision,'authorId',r.author_id,'title',r.title,'body',r.body,'sources',r.source_evidence)::text,'UTF8'))
    FROM public.content_revisions r JOIN public.content_documents d ON d.id=r.document_id WHERE r.id=subject_revision) END;
$$;
REVOKE ALL ON FUNCTION public.operation_subject_hash(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION public.review_operation(actor uuid,subject_job uuid,subject_revision uuid,operation uuid,verdict text,lifetime_seconds integer,explanation text)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior public.operation_reviews%ROWTYPE; payload bytea; result uuid; checked_at timestamptz;
BEGIN
  IF (subject_job IS NULL)=(subject_revision IS NULL) OR operation IS NULL OR verdict IS NULL OR verdict NOT IN ('approved','rejected')
    OR lifetime_seconds IS NULL OR lifetime_seconds NOT BETWEEN 1 AND 604800 OR explanation IS NULL OR length(btrim(explanation)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.users WHERE id=actor FOR SHARE;
  PERFORM 1 FROM public.operations_access WHERE user_id=actor ORDER BY role FOR SHARE;
  IF NOT public.operations_authorized(actor,CASE WHEN subject_job IS NULL THEN 'editor' ELSE 'admin' END) THEN
    RAISE EXCEPTION 'Reviewer access required' USING ERRCODE='42501'; END IF;
  IF subject_revision IS NOT NULL AND EXISTS(SELECT 1 FROM public.content_revisions WHERE id=subject_revision AND author_id=actor) THEN
    RAISE EXCEPTION 'Independent content reviewer required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('operation-review:'||operation::text,0));
  SELECT * INTO prior FROM public.operation_reviews WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.reviewer_id=actor AND prior.job_id IS NOT DISTINCT FROM subject_job AND prior.revision_id IS NOT DISTINCT FROM subject_revision
      AND prior.decision=verdict AND prior.reason=btrim(explanation) AND prior.lifetime_seconds=lifetime_seconds THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Review operation already used' USING ERRCODE='23505';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('review-subject:'||coalesce(subject_job,subject_revision)::text,0));
  IF subject_job IS NOT NULL THEN PERFORM 1 FROM public.agent_jobs WHERE id=subject_job FOR SHARE;
  ELSE
    PERFORM 1 FROM public.content_documents d JOIN public.content_revisions r ON r.document_id=d.id WHERE r.id=subject_revision FOR SHARE OF d;
  END IF;
  payload:=public.operation_subject_hash(subject_job,subject_revision);
  IF payload IS NULL THEN RAISE EXCEPTION 'Review subject unavailable' USING ERRCODE='22023'; END IF;
  checked_at:=clock_timestamp();
  INSERT INTO public.operation_reviews(operation_id,job_id,revision_id,reviewer_id,decision,lifetime_seconds,payload_hash,reason,created_at,expires_at)
    VALUES(operation,subject_job,subject_revision,actor,verdict,lifetime_seconds,payload,btrim(explanation),checked_at,checked_at+make_interval(secs=>lifetime_seconds)) RETURNING id INTO result;
  INSERT INTO public.audit_events(actor_id,action,reason,metadata)
    VALUES(actor,'operation.reviewed',btrim(explanation),jsonb_build_object('reviewId',result,'decision',verdict));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.review_operation(uuid,uuid,uuid,uuid,text,integer,text) FROM PUBLIC;

-- Read-only evidence, never an executor or permission to publish/send/spend.
CREATE FUNCTION public.operation_review_usable(review uuid,expected_payload_hash bytea)
RETURNS boolean LANGUAGE sql SET search_path=pg_catalog,pg_temp AS $$
  SELECT coalesce((SELECT r.decision='approved' AND r.expires_at>clock_timestamp()
    AND r.payload_hash=expected_payload_hash AND r.payload_hash=public.operation_subject_hash(r.job_id,r.revision_id)
    AND public.operations_authorized(r.reviewer_id,CASE WHEN r.job_id IS NULL THEN 'editor' ELSE 'admin' END)
    AND CASE WHEN r.job_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.agent_jobs j JOIN public.agent_controls c ON c.kind=j.kind
        WHERE j.id=r.job_id AND j.state='awaiting_review' AND NOT c.paused)
      ELSE EXISTS(SELECT 1 FROM public.content_revisions v WHERE v.id=r.revision_id AND v.revision=(
        SELECT max(latest.revision) FROM public.content_revisions latest WHERE latest.document_id=v.document_id)) END
    FROM public.operation_reviews r WHERE r.id=review),false);
$$;
REVOKE ALL ON FUNCTION public.operation_review_usable(uuid,bytea) FROM PUBLIC;

CREATE FUNCTION public.protect_agent_request() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.operation_id IS DISTINCT FROM OLD.operation_id OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.attempt_limit IS DISTINCT FROM OLD.attempt_limit OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result) THEN
    RAISE EXCEPTION 'Agent request and completed draft are immutable' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_agent_request() FROM PUBLIC;
CREATE TRIGGER agent_request_immutable BEFORE UPDATE ON public.agent_jobs FOR EACH ROW EXECUTE FUNCTION public.protect_agent_request();
