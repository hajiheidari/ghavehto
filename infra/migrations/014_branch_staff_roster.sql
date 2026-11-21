CREATE INDEX branch_staff_roster_idx ON public.cafe_memberships(cafe_id,branch_id,user_id) WHERE role='staff';

-- Keep the ordinary membership policy self-only; expose just branch staff IDs
-- to the café owner through this bounded read.
CREATE FUNCTION public.read_branch_staff(target_cafe uuid,target_branch uuid,after_user uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.cafe_memberships owner
    JOIN public.cafes c ON c.id=owner.cafe_id AND c.active
    JOIN public.branches b ON b.id=target_branch AND b.cafe_id=c.id
    WHERE owner.cafe_id=target_cafe AND owner.role='owner' AND owner.branch_id IS NULL
      AND owner.user_id=nullif(current_setting('app.user_id',true),'')::uuid
  ) THEN ARRAY(
    SELECT m.user_id FROM public.cafe_memberships m
    WHERE m.cafe_id=target_cafe AND m.branch_id=target_branch AND m.role='staff'
      AND (after_user IS NULL OR m.user_id>after_user)
    ORDER BY m.user_id LIMIT 51
  ) ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.read_branch_staff(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_branch_staff(uuid,uuid,uuid) TO ghahvehto_app;
