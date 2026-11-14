ALTER TABLE public.experiences ADD COLUMN title text CHECK(title IS NULL OR length(btrim(title)) BETWEEN 1 AND 120);
-- Narrow owner-only read. Participation, activation, raw claims and tracking remain private.
CREATE FUNCTION public.read_owner_experiences(target_cafe uuid,after_experience uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  actor uuid:=nullif(current_setting('app.user_id',true),'')::uuid;
  result jsonb;
BEGIN
  PERFORM 1 FROM public.users WHERE id=actor AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.cafes WHERE id=target_cafe AND active FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.cafe_memberships WHERE cafe_id=target_cafe AND user_id=actor
    AND role='owner' AND branch_id IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  WITH candidates AS (
    SELECT x.id,x.cafe_id,x.title,x.active,v.version,v.branch_id,branch.name AS branch_name,v.starts_at,v.ends_at,
      v.first_recorded_visit_only,v.per_member_limit,b.remaining_stock,b.remaining_budget_units
    FROM public.experiences x JOIN LATERAL (
      SELECT * FROM public.experience_versions v WHERE v.experience_id=x.id AND v.cafe_id=x.cafe_id ORDER BY v.version DESC LIMIT 1
    ) v ON true JOIN public.experience_capacity b ON b.experience_id=x.id AND b.cafe_id=x.cafe_id AND b.version=v.version
      LEFT JOIN public.branches branch ON branch.id=v.branch_id AND branch.cafe_id=x.cafe_id
    WHERE x.cafe_id=target_cafe AND (after_experience IS NULL OR x.id>after_experience) ORDER BY x.id LIMIT 51
  ), numbered AS (SELECT *,row_number() OVER(ORDER BY id) AS position FROM candidates)
  SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
    'experienceId',id,'cafeId',cafe_id,'title',title,'active',active,'version',version,'branchId',branch_id,'branchName',branch_name,
    'startsAt',to_char(starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'endsAt',to_char(ends_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'firstRecordedVisitOnly',first_recorded_visit_only,'perMemberLimit',per_member_limit,
    'remainingStock',remaining_stock,'remainingBudgetUnits',remaining_budget_units::text
  ) ORDER BY id) FILTER(WHERE position<=50),'[]'::jsonb),
    'nextCursor',CASE WHEN count(*)>50 THEN (SELECT id FROM numbered WHERE position=50) END)
    INTO result FROM numbered;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_owner_experiences(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_owner_experiences(uuid,uuid) TO ghahvehto_app;
