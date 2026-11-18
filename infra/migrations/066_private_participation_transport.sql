DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_participation') THEN
    CREATE ROLE ghahvehto_participation NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_participation;

CREATE FUNCTION public.reserve_private_experience(token_hash bytea, experience uuid, version_number integer, branch uuid, operation uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.claim_experience(public.editorial_session_actor(token_hash),experience,version_number,branch,operation);
$$;
CREATE FUNCTION public.read_private_experience_reservation(token_hash bytea, operation uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.recover_experience_claim(public.editorial_session_actor(token_hash),operation);
$$;
CREATE FUNCTION public.cancel_private_experience(token_hash bytea, claim uuid, operation uuid, explanation text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.cancel_experience_claim(public.editorial_session_actor(token_hash),claim,operation,explanation);
$$;
CREATE FUNCTION public.fulfill_private_experience(token_hash bytea, claim uuid, operation uuid, explanation text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.record_experience_fulfillment(public.editorial_session_actor(token_hash),claim,operation,explanation);
$$;
REVOKE ALL ON FUNCTION public.reserve_private_experience(bytea,uuid,integer,uuid,uuid),
  public.read_private_experience_reservation(bytea,uuid),public.cancel_private_experience(bytea,uuid,uuid,text),
  public.fulfill_private_experience(bytea,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_private_experience(bytea,uuid,integer,uuid,uuid),
  public.read_private_experience_reservation(bytea,uuid),public.cancel_private_experience(bytea,uuid,uuid,text),
  public.fulfill_private_experience(bytea,uuid,uuid,text) TO ghahvehto_participation;
