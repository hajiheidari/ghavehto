-- Private configurable founder cohorts; no default cohort, public badge or benefits rollout.
CREATE TABLE public.founder_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK(audience IN ('member','cafe')),
  active boolean NOT NULL DEFAULT false,
  UNIQUE(id,audience)
);
CREATE TABLE public.founder_program_versions (
  program_id uuid NOT NULL,
  audience text NOT NULL,
  version integer NOT NULL CHECK(version>0),
  qualification_starts_at timestamptz NOT NULL CHECK(isfinite(qualification_starts_at)),
  qualification_ends_at timestamptz NOT NULL CHECK(isfinite(qualification_ends_at) AND qualification_ends_at>qualification_starts_at),
  enrollment_starts_at timestamptz NOT NULL CHECK(isfinite(enrollment_starts_at)),
  enrollment_ends_at timestamptz NOT NULL CHECK(isfinite(enrollment_ends_at) AND enrollment_ends_at>enrollment_starts_at),
  benefits_ends_at timestamptz NOT NULL CHECK(isfinite(benefits_ends_at) AND benefits_ends_at>=enrollment_ends_at),
  PRIMARY KEY(program_id,audience,version),
  FOREIGN KEY(program_id,audience) REFERENCES public.founder_programs(id,audience)
);
CREATE TRIGGER founder_program_versions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.founder_program_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.founder_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.founder_program_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.founder_programs,public.founder_program_versions FROM PUBLIC;

CREATE TABLE public.member_founder_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  program_id uuid NOT NULL,
  audience text NOT NULL DEFAULT 'member' CHECK(audience='member'),
  version integer NOT NULL,
  operation_id uuid NOT NULL UNIQUE,
  granted_at timestamptz NOT NULL,
  UNIQUE(program_id,user_id),
  FOREIGN KEY(program_id,audience,version) REFERENCES public.founder_program_versions(program_id,audience,version)
);
CREATE TRIGGER member_founder_badges_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.member_founder_badges
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.member_founder_badges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_founder_badges FROM PUBLIC;

CREATE FUNCTION public.enroll_member_founder(subject uuid,target_program uuid,target_version integer,operation uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.member_founder_badges%ROWTYPE;
  policy public.founder_program_versions%ROWTYPE;
  qualified_at timestamptz;
  checked_at timestamptz;
  badge uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Founder enrollment requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF subject IS NULL OR target_program IS NULL OR target_version IS NULL OR target_version<1 OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid founder enrollment' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('founder-member-operation:'||operation::text,0));
  SELECT phone_verified_at INTO qualified_at FROM public.users
    WHERE id=subject AND phone_verified_at IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified founder member unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM public.member_founder_badges WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.user_id=subject AND prior.program_id=target_program AND prior.version=target_version THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Founder operation already used' USING ERRCODE='23505';
  END IF;
  PERFORM 1 FROM public.founder_programs WHERE id=target_program AND audience='member' AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Founder program unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO policy FROM public.founder_program_versions WHERE program_id=target_program AND audience='member' AND version=target_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Founder policy unavailable' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('founder-member-subject:'||target_program::text||':'||subject::text,0));
  IF EXISTS(SELECT 1 FROM public.member_founder_badges WHERE program_id=target_program AND user_id=subject) THEN
    RAISE EXCEPTION 'Founder badge already granted' USING ERRCODE='23505';
  END IF;
  checked_at:=clock_timestamp();
  IF qualified_at<policy.qualification_starts_at OR qualified_at>=policy.qualification_ends_at
    OR checked_at<policy.enrollment_starts_at OR checked_at>=policy.enrollment_ends_at THEN
    RAISE EXCEPTION 'Founder window unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.member_founder_badges(user_id,program_id,version,operation_id,granted_at)
    VALUES(subject,target_program,target_version,operation,checked_at) RETURNING id INTO badge;
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('founder.member_enrolled','Verified founder cohort enrollment',
      jsonb_build_object('badgeId',badge,'programId',target_program,'version',target_version));
  RETURN badge;
END $$;
REVOKE ALL ON FUNCTION public.enroll_member_founder(uuid,uuid,integer,uuid) FROM PUBLIC;

CREATE FUNCTION public.inspect_member_founder(subject uuid,target_program uuid,as_of timestamptz)
RETURNS TABLE(badge boolean,benefits boolean) LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT b.granted_at<=as_of,b.granted_at<=as_of AND as_of<v.benefits_ends_at AND p.active
    AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=b.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL)
    FROM public.member_founder_badges b JOIN public.founder_program_versions v
      ON v.program_id=b.program_id AND v.audience=b.audience AND v.version=b.version
      JOIN public.founder_programs p ON p.id=b.program_id
    WHERE b.user_id=subject AND b.program_id=target_program AND as_of IS NOT NULL AND isfinite(as_of);
$$;
REVOKE ALL ON FUNCTION public.inspect_member_founder(uuid,uuid,timestamptz) FROM PUBLIC;

CREATE TABLE public.cafe_founder_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  program_id uuid NOT NULL,
  audience text NOT NULL DEFAULT 'cafe' CHECK(audience='cafe'),
  version integer NOT NULL,
  operation_id uuid NOT NULL UNIQUE,
  granted_at timestamptz NOT NULL,
  UNIQUE(program_id,cafe_id),
  FOREIGN KEY(program_id,audience,version) REFERENCES public.founder_program_versions(program_id,audience,version)
);
CREATE TRIGGER cafe_founder_badges_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cafe_founder_badges
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.cafe_founder_badges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cafe_founder_badges FROM PUBLIC;

CREATE FUNCTION public.enroll_cafe_founder(subject uuid,target_program uuid,target_version integer,operation uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  prior public.cafe_founder_badges%ROWTYPE;
  policy public.founder_program_versions%ROWTYPE;
  qualified_at timestamptz;
  checked_at timestamptz;
  badge uuid;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Founder enrollment requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF subject IS NULL OR target_program IS NULL OR target_version IS NULL OR target_version<1 OR operation IS NULL THEN
    RAISE EXCEPTION 'Invalid founder enrollment' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('founder-cafe-operation:'||operation::text,0));
  PERFORM 1 FROM public.cafes WHERE id=subject AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified founder cafe unavailable' USING ERRCODE='42501'; END IF;
  SELECT g.granted_at INTO qualified_at FROM public.ownership_access_grants g
    JOIN public.ownership_claims c ON c.id=g.claim_id AND c.cafe_id=g.cafe_id AND c.decision='verified'
    JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.cafe_id=g.cafe_id AND m.user_id=c.user_id AND m.role='owner'
    JOIN public.users u ON u.id=m.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
    WHERE g.cafe_id=subject AND g.revoked_at IS NULL FOR SHARE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified founder cafe unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO prior FROM public.cafe_founder_badges WHERE operation_id=operation;
  IF FOUND THEN
    IF prior.cafe_id=subject AND prior.program_id=target_program AND prior.version=target_version THEN RETURN prior.id; END IF;
    RAISE EXCEPTION 'Founder operation already used' USING ERRCODE='23505';
  END IF;
  PERFORM 1 FROM public.founder_programs WHERE id=target_program AND audience='cafe' AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Founder program unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO policy FROM public.founder_program_versions WHERE program_id=target_program AND audience='cafe' AND version=target_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Founder policy unavailable' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('founder-cafe-subject:'||target_program::text||':'||subject::text,0));
  IF EXISTS(SELECT 1 FROM public.cafe_founder_badges WHERE program_id=target_program AND cafe_id=subject) THEN
    RAISE EXCEPTION 'Founder badge already granted' USING ERRCODE='23505';
  END IF;
  checked_at:=clock_timestamp();
  IF qualified_at<policy.qualification_starts_at OR qualified_at>=policy.qualification_ends_at
    OR checked_at<policy.enrollment_starts_at OR checked_at>=policy.enrollment_ends_at THEN
    RAISE EXCEPTION 'Founder window unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.cafe_founder_badges(cafe_id,program_id,version,operation_id,granted_at)
    VALUES(subject,target_program,target_version,operation,checked_at) RETURNING id INTO badge;
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('founder.cafe_enrolled','Verified founder cohort enrollment',
      jsonb_build_object('badgeId',badge,'programId',target_program,'version',target_version));
  RETURN badge;
END $$;
REVOKE ALL ON FUNCTION public.enroll_cafe_founder(uuid,uuid,integer,uuid) FROM PUBLIC;

CREATE FUNCTION public.inspect_cafe_founder(subject uuid,target_program uuid,as_of timestamptz)
RETURNS TABLE(badge boolean,benefits boolean) LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT b.granted_at<=as_of,b.granted_at<=as_of AND as_of<v.benefits_ends_at AND p.active
    AND EXISTS(SELECT 1 FROM public.cafes c JOIN public.ownership_access_grants g ON g.cafe_id=c.id AND g.revoked_at IS NULL
      JOIN public.ownership_claims q ON q.id=g.claim_id AND q.decision='verified' AND q.cafe_id=c.id
      JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.cafe_id=c.id AND m.user_id=q.user_id AND m.role='owner'
      JOIN public.users u ON u.id=m.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
      WHERE c.id=b.cafe_id AND c.active)
    FROM public.cafe_founder_badges b JOIN public.founder_program_versions v
      ON v.program_id=b.program_id AND v.audience=b.audience AND v.version=b.version
      JOIN public.founder_programs p ON p.id=b.program_id
    WHERE b.cafe_id=subject AND b.program_id=target_program AND as_of IS NOT NULL AND isfinite(as_of);
$$;
REVOKE ALL ON FUNCTION public.inspect_cafe_founder(uuid,uuid,timestamptz) FROM PUBLIC;
