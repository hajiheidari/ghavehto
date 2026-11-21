-- A tenant may mutate only staff membership at a branch it owns.
CREATE FUNCTION public.change_branch_staff(target_cafe uuid,target_branch uuid,target_user uuid,enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
  changed_id uuid;
BEGIN
  IF enabled IS NULL OR target_user IS NULL OR target_user=actor THEN RETURN false; END IF;
  -- Same lock order as operator owner changes; recheck authority after locking.
  IF NOT EXISTS (SELECT 1 FROM public.cafe_memberships
    WHERE cafe_id=target_cafe AND user_id=actor AND role='owner' AND branch_id IS NULL) THEN RETURN false; END IF;
  PERFORM 1 FROM public.cafes WHERE id=target_cafe AND active FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.cafe_memberships
    WHERE cafe_id=target_cafe AND user_id=actor AND role='owner' AND branch_id IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.branches WHERE id=target_branch AND cafe_id=target_cafe FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF enabled THEN
    PERFORM 1 FROM public.users WHERE id=target_user AND deleted_at IS NULL AND phone_verified_at IS NOT NULL FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO public.cafe_memberships(user_id,cafe_id,branch_id,role)
      VALUES(target_user,target_cafe,target_branch,'staff') ON CONFLICT DO NOTHING RETURNING id INTO changed_id;
  ELSE
    DELETE FROM public.cafe_memberships
      WHERE user_id=target_user AND cafe_id=target_cafe AND branch_id=target_branch AND role='staff'
      RETURNING id INTO changed_id;
  END IF;

  IF changed_id IS NOT NULL THEN
    INSERT INTO public.audit_events(actor_id,cafe_id,action,reason,metadata)
      VALUES(actor,target_cafe,CASE WHEN enabled THEN 'branch.staff_granted' ELSE 'branch.staff_revoked' END,
        'Owner changed branch staff access',jsonb_build_object('branchId',target_branch,'memberId',target_user,'membershipId',changed_id));
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.change_branch_staff(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_branch_staff(uuid,uuid,uuid,boolean) TO ghahvehto_app;
