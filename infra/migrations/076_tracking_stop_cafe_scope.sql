CREATE FUNCTION public.stop_private_cafe_tracking_link(token_hash bytea,target_cafe uuid,target_link uuid,explanation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid;
BEGIN
  actor:=public.editorial_session_actor(token_hash);
  PERFORM 1 FROM public.cafe_tracking_links WHERE id=target_link AND cafe_id=target_cafe FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking link unavailable' USING ERRCODE='42501'; END IF;
  RETURN public.stop_cafe_tracking_link(actor,target_link,explanation);
END $$;
REVOKE ALL ON FUNCTION public.stop_private_cafe_tracking_link(bytea,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stop_private_cafe_tracking_link(bytea,uuid,uuid,text) TO ghahvehto_tracking_owner;
