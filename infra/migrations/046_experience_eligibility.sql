-- Private M4 foundations. No public offers, seeded campaigns or provider activation.
CREATE TABLE public.experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  active boolean NOT NULL DEFAULT false,
  UNIQUE(id,cafe_id)
);
CREATE TABLE public.experience_versions (
  experience_id uuid NOT NULL,
  cafe_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),
  branch_id uuid,
  starts_at timestamptz NOT NULL CHECK(isfinite(starts_at)),
  ends_at timestamptz NOT NULL CHECK(isfinite(ends_at) AND ends_at>starts_at),
  first_recorded_visit_only boolean NOT NULL,
  per_member_limit integer NOT NULL CHECK(per_member_limit BETWEEN 1 AND 1000000),
  budget_units_per_claim integer NOT NULL CHECK(budget_units_per_claim BETWEEN 0 AND 1000000000),
  PRIMARY KEY(experience_id,cafe_id,version),
  UNIQUE(experience_id,cafe_id,version,budget_units_per_claim),
  FOREIGN KEY(experience_id,cafe_id) REFERENCES public.experiences(id,cafe_id),
  FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id)
);
CREATE TABLE public.experience_capacity (
  experience_id uuid NOT NULL,
  cafe_id uuid NOT NULL,
  version integer NOT NULL,
  stocked_units integer NOT NULL CHECK(stocked_units BETWEEN 0 AND 1000000000),
  remaining_stock integer NOT NULL CHECK(remaining_stock BETWEEN 0 AND stocked_units),
  funded_budget_units bigint NOT NULL CHECK(funded_budget_units>=0),
  remaining_budget_units bigint NOT NULL CHECK(remaining_budget_units BETWEEN 0 AND funded_budget_units),
  PRIMARY KEY(experience_id,cafe_id,version),
  FOREIGN KEY(experience_id,cafe_id,version) REFERENCES public.experience_versions(experience_id,cafe_id,version)
);
CREATE TABLE public.experience_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  cafe_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  experience_id uuid NOT NULL,
  version integer NOT NULL,
  budget_units integer NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,user_id,cafe_id),
  FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),
  FOREIGN KEY(experience_id,cafe_id,version,budget_units)
    REFERENCES public.experience_versions(experience_id,cafe_id,version,budget_units_per_claim)
);
CREATE INDEX experience_claims_member ON public.experience_claims(user_id,cafe_id,experience_id,claimed_at);
CREATE TABLE public.experience_first_visits (
  user_id uuid NOT NULL,
  cafe_id uuid NOT NULL,
  claim_id uuid NOT NULL UNIQUE,
  PRIMARY KEY(user_id,cafe_id),
  FOREIGN KEY(claim_id,user_id,cafe_id) REFERENCES public.experience_claims(id,user_id,cafe_id)
);
CREATE TRIGGER experience_versions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.experience_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
CREATE TRIGGER experience_claims_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.experience_claims
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
CREATE TRIGGER experience_first_visits_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.experience_first_visits
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_first_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.experiences,public.experience_versions,public.experience_capacity,public.experience_claims,public.experience_first_visits FROM PUBLIC;

CREATE FUNCTION public.inspect_experience_eligibility(recipient uuid,target_experience uuid,target_version integer,target_branch uuid,as_of timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
  SELECT CASE
    WHEN NOT EXISTS(SELECT 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL)
      THEN 'account_unavailable'
    WHEN NOT x.active OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=x.cafe_id AND active)
      OR NOT EXISTS(SELECT 1 FROM public.branches WHERE id=target_branch AND cafe_id=x.cafe_id)
      OR (v.branch_id IS NOT NULL AND v.branch_id<>target_branch) THEN 'scope_unavailable'
    WHEN NOT EXISTS(SELECT 1 FROM public.ownership_access_grants g
      JOIN public.ownership_claims c ON c.id=g.claim_id AND c.cafe_id=g.cafe_id
      JOIN public.cafe_memberships m ON m.id=g.membership_id AND m.user_id=c.user_id AND m.cafe_id=g.cafe_id AND m.role='owner'
      JOIN public.users u ON u.id=m.user_id AND u.phone_verified_at IS NOT NULL AND u.deleted_at IS NULL
      WHERE g.cafe_id=x.cafe_id AND g.revoked_at IS NULL AND c.decision='verified') THEN 'ownership_unavailable'
    WHEN as_of<v.starts_at OR as_of>=v.ends_at THEN 'outside_window'
    WHEN b.remaining_stock<1 OR b.remaining_budget_units<v.budget_units_per_claim THEN 'capacity_unavailable'
    WHEN (SELECT count(*) FROM public.experience_claims c WHERE c.user_id=recipient
      AND c.experience_id=target_experience AND c.claimed_at<=as_of)>=v.per_member_limit THEN 'limit_reached'
    WHEN v.first_recorded_visit_only AND (
      EXISTS(SELECT 1 FROM public.stamp_qr_tokens q WHERE q.recipient_id=recipient AND q.cafe_id=x.cafe_id AND q.consumed_at<=as_of)
      OR EXISTS(SELECT 1 FROM public.experience_claims c WHERE c.user_id=recipient AND c.cafe_id=x.cafe_id AND c.claimed_at<=as_of)
    ) THEN 'prior_participation'
    ELSE 'eligible' END
  FROM public.experiences x JOIN public.experience_versions v ON v.experience_id=x.id AND v.cafe_id=x.cafe_id
    JOIN public.experience_capacity b ON b.experience_id=v.experience_id AND b.cafe_id=v.cafe_id AND b.version=v.version
  WHERE x.id=target_experience AND v.version=target_version AND recipient IS NOT NULL AND target_branch IS NOT NULL
    AND as_of IS NOT NULL AND isfinite(as_of);
$$;
REVOKE ALL ON FUNCTION public.inspect_experience_eligibility(uuid,uuid,integer,uuid,timestamptz) FROM PUBLIC;
