-- Private editorial writes authenticate the bearer inside the write transaction.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_editorial') THEN
    CREATE ROLE ghahvehto_editorial NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_editorial;

CREATE FUNCTION public.editorial_session_actor(token_hash bytea)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE family uuid; actor uuid;
BEGIN
  SELECT family_id INTO family FROM public.sessions WHERE access_token_hash=token_hash;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('session:'||family::text,0));
    SELECT u.id INTO actor FROM public.sessions s JOIN public.users u ON u.id=s.user_id
      WHERE s.family_id=family AND s.access_token_hash=token_hash AND s.revoked_at IS NULL
        AND s.replaced_by IS NULL AND s.access_expires_at>clock_timestamp()
        AND s.expires_at>clock_timestamp() AND u.phone_verified_at IS NOT NULL
        AND u.deleted_at IS NULL FOR SHARE OF u;
  END IF;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Valid session required' USING ERRCODE='28000';
  END IF;
  RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.editorial_session_actor(bytea) FROM PUBLIC;

CREATE FUNCTION public.save_private_content(token_hash bytea, document uuid, expected_revision integer,
  operation uuid, heading text, content text, evidence jsonb)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.save_content_revision(public.editorial_session_actor(token_hash),document,
    expected_revision,operation,heading,content,evidence);
$$;

CREATE FUNCTION public.review_private_operation(token_hash bytea, job uuid, revision uuid,
  operation uuid, verdict text, lifetime_seconds integer, explanation text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.review_operation(public.editorial_session_actor(token_hash),job,revision,operation,
    verdict,lifetime_seconds,explanation);
$$;

REVOKE ALL ON FUNCTION public.save_private_content(bytea,uuid,integer,uuid,text,text,jsonb),
  public.review_private_operation(bytea,uuid,uuid,uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_private_content(bytea,uuid,integer,uuid,text,text,jsonb),
  public.review_private_operation(bytea,uuid,uuid,uuid,text,integer,text) TO ghahvehto_editorial;
