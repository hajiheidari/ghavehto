CREATE FUNCTION public.read_private_agent_controls(token_hash bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM public.private_operations_admin(token_hash);
  RETURN (
    SELECT jsonb_build_object('items',jsonb_agg(jsonb_build_object(
      'kind',k.kind,'configured',c.kind IS NOT NULL,'paused',coalesce(c.paused,true),
      'attemptLimit',coalesce(c.attempt_limit,3)) ORDER BY k.kind))
    FROM (VALUES('research'),('content'),('discovery'),('outreach')) k(kind)
    LEFT JOIN public.agent_controls c ON c.kind=k.kind
  );
END $$;
REVOKE ALL ON FUNCTION public.read_private_agent_controls(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_private_agent_controls(bytea) TO ghahvehto_editorial;
