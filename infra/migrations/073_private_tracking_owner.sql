-- A separate private capability can only stop links as the authenticated owner.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_tracking_owner') THEN
    CREATE ROLE ghahvehto_tracking_owner NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_tracking_owner;
CREATE FUNCTION public.stop_private_tracking_link(token_hash bytea,target_link uuid,explanation text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.stop_cafe_tracking_link(public.editorial_session_actor(token_hash),target_link,explanation);
$$;
REVOKE ALL ON FUNCTION public.stop_private_tracking_link(bytea,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stop_private_tracking_link(bytea,uuid,text) TO ghahvehto_tracking_owner;
