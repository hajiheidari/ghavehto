-- Storage only: no runtime role may award or spend units yet.
CREATE TABLE public.stamp_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  UNIQUE (id,cafe_id)
);
CREATE TABLE public.stamp_program_versions (
  program_id uuid NOT NULL,
  cafe_id uuid NOT NULL,
  version integer NOT NULL CHECK (version>0),
  stamps_required integer NOT NULL CHECK (stamps_required>0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (program_id,cafe_id,version),
  FOREIGN KEY (program_id,cafe_id) REFERENCES public.stamp_programs(id,cafe_id)
);
CREATE FUNCTION public.reject_loyalty_history_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Loyalty history is append-only' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.reject_loyalty_history_change() FROM PUBLIC;

CREATE TABLE public.stamp_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  cafe_id uuid NOT NULL,
  program_id uuid NOT NULL,
  program_version integer NOT NULL,
  operation_id uuid NOT NULL UNIQUE,
  units integer NOT NULL CHECK (units BETWEEN -1000000000 AND 1000000000 AND units<>0),
  kind text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 240),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  effective_at timestamptz NOT NULL,
  expires_at timestamptz CHECK (expires_at IS NULL OR (kind='award' AND expires_at>effective_at)),
  reversal_of uuid UNIQUE CHECK (reversal_of<>id),
  original_units integer GENERATED ALWAYS AS (-units) STORED,
  reversible boolean GENERATED ALWAYS AS (kind<>'reversal') STORED,
  original_reversible boolean GENERATED ALWAYS AS (true) STORED,
  CHECK ((kind='award' AND units>0) OR (kind IN ('spend','expire') AND units<0)
    OR kind='reversal'),
  CHECK ((kind='reversal')=(reversal_of IS NOT NULL)),
  FOREIGN KEY (program_id,cafe_id,program_version) REFERENCES public.stamp_program_versions(program_id,cafe_id,version),
  UNIQUE (id,user_id,cafe_id,program_id,program_version,units,reversible),
  FOREIGN KEY (reversal_of,user_id,cafe_id,program_id,program_version,original_units,original_reversible)
    REFERENCES public.stamp_entries(id,user_id,cafe_id,program_id,program_version,units,reversible)
);
CREATE INDEX stamp_entries_scope_idx ON public.stamp_entries(user_id,cafe_id,program_id,program_version,effective_at,id);
CREATE TRIGGER stamp_entries_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.stamp_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.stamp_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stamp_entries FROM PUBLIC;

CREATE TABLE public.star_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  operation_id uuid NOT NULL UNIQUE,
  units integer NOT NULL CHECK (units BETWEEN -1000000000 AND 1000000000 AND units<>0),
  kind text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 240),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  effective_at timestamptz NOT NULL,
  expires_at timestamptz CHECK (expires_at IS NULL OR (kind='award' AND expires_at>effective_at)),
  reversal_of uuid UNIQUE CHECK (reversal_of<>id),
  original_units integer GENERATED ALWAYS AS (-units) STORED,
  reversible boolean GENERATED ALWAYS AS (kind<>'reversal') STORED,
  original_reversible boolean GENERATED ALWAYS AS (true) STORED,
  CHECK ((kind='award' AND units>0) OR (kind IN ('spend','expire') AND units<0)
    OR kind='reversal'),
  CHECK ((kind='reversal')=(reversal_of IS NOT NULL)),
  UNIQUE (id,user_id,units,reversible),
  FOREIGN KEY (reversal_of,user_id,original_units,original_reversible)
    REFERENCES public.star_entries(id,user_id,units,reversible)
);
CREATE INDEX star_entries_scope_idx ON public.star_entries(user_id,effective_at,id);
CREATE TRIGGER star_entries_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.star_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.star_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.star_entries FROM PUBLIC;

CREATE TABLE public.tier_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  qualification_year integer NOT NULL CHECK (qualification_year BETWEEN 2000 AND 9999),
  operation_id uuid NOT NULL UNIQUE,
  units integer NOT NULL CHECK (units BETWEEN -1000000000 AND 1000000000 AND units<>0),
  kind text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 240),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  effective_at timestamptz NOT NULL,
  reversal_of uuid UNIQUE CHECK (reversal_of<>id),
  original_units integer GENERATED ALWAYS AS (-units) STORED,
  reversible boolean GENERATED ALWAYS AS (kind<>'reversal') STORED,
  original_reversible boolean GENERATED ALWAYS AS (true) STORED,
  CHECK ((kind='award' AND units>0)
    OR kind='reversal'),
  CHECK ((kind='reversal')=(reversal_of IS NOT NULL)),
  UNIQUE (id,user_id,qualification_year,units,reversible),
  FOREIGN KEY (reversal_of,user_id,qualification_year,original_units,original_reversible)
    REFERENCES public.tier_entries(id,user_id,qualification_year,units,reversible)
);
CREATE INDEX tier_entries_scope_idx ON public.tier_entries(user_id,qualification_year,effective_at,id);
CREATE TRIGGER tier_entries_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tier_entries
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.tier_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_entries FROM PUBLIC;

CREATE TRIGGER stamp_program_versions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.stamp_program_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.stamp_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_program_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stamp_programs,public.stamp_program_versions FROM PUBLIC;
