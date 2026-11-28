DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_directory_review') THEN
    CREATE ROLE ghahvehto_directory_review NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_directory_review;
ALTER TABLE public.directory_listings ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE VIEW public.directory_review_queue WITH (security_barrier=true) AS
  SELECT branch_id,cafe_id,source_id,cafe_name,branch_name,province,city,neighborhood,reviewed_at,withdrawn_at,revision
  FROM public.directory_listings;
REVOKE ALL ON public.directory_review_queue FROM PUBLIC;
GRANT SELECT ON public.directory_review_queue TO ghahvehto_directory_review;

-- Exactly one reviewed change and its audit event in the same transaction.
-- The operator's individual database login identifies the reviewer.
CREATE FUNCTION public.review_directory_listing(
  target_branch uuid, expected_revision integer, decision text, review_reason text,
  source uuid DEFAULT NULL, proposed jsonb DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  current_listing public.directory_listings%ROWTYPE;
  next_listing public.directory_listings%ROWTYPE;
  target_cafe uuid;
  rights text;
BEGIN
  IF expected_revision IS NULL OR expected_revision < 0 OR
    decision IS NULL OR decision NOT IN ('publish','withdraw') OR
    review_reason IS NULL OR length(btrim(review_reason)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Invalid review input' USING ERRCODE='22023';
  END IF;
  SELECT b.cafe_id INTO target_cafe FROM public.branches b WHERE b.id=target_branch FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown branch' USING ERRCODE='22023'; END IF;
  SELECT * INTO current_listing FROM public.directory_listings d WHERE d.branch_id=target_branch;
  IF coalesce(current_listing.revision,0) <> expected_revision THEN
    RAISE EXCEPTION 'Listing revision changed' USING ERRCODE='40001';
  END IF;
  IF decision='withdraw' THEN
    IF current_listing.revision IS NULL OR current_listing.withdrawn_at IS NOT NULL OR source IS NOT NULL OR proposed IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid withdrawal' USING ERRCODE='22023';
    END IF;
    UPDATE public.directory_listings SET withdrawn_at=clock_timestamp(), revision=revision+1
      WHERE branch_id=target_branch RETURNING * INTO next_listing;
  ELSE
    SELECT s.rights_status INTO rights FROM public.source_records s
      WHERE s.id=source AND s.cafe_id=target_cafe FOR SHARE;
    IF rights IS DISTINCT FROM 'permitted' OR jsonb_typeof(proposed) IS DISTINCT FROM 'object' OR
      jsonb_typeof(proposed->'cafeName') IS DISTINCT FROM 'string' OR
      jsonb_typeof(proposed->'branchName') IS DISTINCT FROM 'string' OR
      jsonb_typeof(proposed->'province') IS DISTINCT FROM 'string' OR
      jsonb_typeof(proposed->'city') IS DISTINCT FROM 'string' OR
      jsonb_typeof(proposed->'neighborhood') IS DISTINCT FROM 'string' OR
      proposed - ARRAY['cafeName','branchName','province','city','neighborhood'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Invalid publication or source' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.directory_listings(branch_id,cafe_id,source_id,cafe_name,branch_name,province,city,neighborhood,reviewed_at,revision)
      VALUES(target_branch,target_cafe,source,btrim(proposed->>'cafeName'),btrim(proposed->>'branchName'),
        btrim(proposed->>'province'),btrim(proposed->>'city'),btrim(proposed->>'neighborhood'),clock_timestamp(),expected_revision+1)
      ON CONFLICT (branch_id) DO UPDATE SET source_id=EXCLUDED.source_id,cafe_name=EXCLUDED.cafe_name,
        branch_name=EXCLUDED.branch_name,province=EXCLUDED.province,city=EXCLUDED.city,neighborhood=EXCLUDED.neighborhood,
        reviewed_at=EXCLUDED.reviewed_at,withdrawn_at=NULL,revision=EXCLUDED.revision
      RETURNING * INTO next_listing;
  END IF;
  INSERT INTO public.audit_events(cafe_id,action,reason,metadata)
    VALUES(target_cafe,'directory.'||decision,btrim(review_reason),jsonb_build_object(
      'reviewer',session_user,'branchId',target_branch,'revision',next_listing.revision,
      'previous',CASE WHEN current_listing.revision IS NOT NULL THEN to_jsonb(current_listing) END,
      'current',to_jsonb(next_listing)));
  RETURN next_listing.revision;
END $$;
REVOKE ALL ON FUNCTION public.review_directory_listing(uuid,integer,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_directory_listing(uuid,integer,text,text,uuid,jsonb) TO ghahvehto_directory_review;
