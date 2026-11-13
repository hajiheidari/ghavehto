-- Adapt the restricted QR primitives to the verified transaction actor.
-- Only the backend session transaction may set app.user_id.
CREATE FUNCTION public.issue_own_stamp_qr(target_cafe uuid,target_branch uuid,target_program uuid,target_version integer)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.issue_stamp_qr(nullif(current_setting('app.user_id',true),'')::uuid,
    target_cafe,target_branch,target_program,target_version);
$$;
CREATE FUNCTION public.consume_scoped_stamp_qr(target_branch uuid,raw_token text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT public.consume_stamp_qr(nullif(current_setting('app.user_id',true),'')::uuid,target_branch,raw_token);
$$;
REVOKE ALL ON FUNCTION public.issue_own_stamp_qr(uuid,uuid,uuid,integer),public.consume_scoped_stamp_qr(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_own_stamp_qr(uuid,uuid,uuid,integer),public.consume_scoped_stamp_qr(uuid,text) TO ghahvehto_app;
