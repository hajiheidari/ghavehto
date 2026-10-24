CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash bytea UNIQUE NOT NULL,
  phone_ciphertext bytea NOT NULL,
  phone_verified_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cafes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  normalized_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  ownership_status text NOT NULL DEFAULT 'unclaimed' CHECK (ownership_status IN ('unclaimed','pending','verified')),
  active boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cafes_search_idx ON cafes USING gin (normalized_name gin_trgm_ops);
CREATE TABLE branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES cafes(id),
  name text NOT NULL,
  province text NOT NULL,
  city text NOT NULL,
  neighborhood text,
  address text,
  location geography(Point,4326),
  public_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,cafe_id)
);
CREATE INDEX branches_location_idx ON branches USING gist(location);
CREATE INDEX branches_city_idx ON branches(city);
CREATE TABLE cafe_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  cafe_id uuid NOT NULL REFERENCES cafes(id),
  branch_id uuid,
  role text NOT NULL CHECK (role IN ('owner','manager','staff')),
  CHECK (role <> 'owner' OR branch_id IS NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(branch_id,cafe_id) REFERENCES branches(id,cafe_id),
  UNIQUE NULLS NOT DISTINCT(user_id,cafe_id,branch_id,role)
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  refresh_token_hash bytea UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES cafes(id),
  source_url text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  published_at timestamptz,
  rights_status text NOT NULL DEFAULT 'review_required' CHECK(rights_status IN ('review_required','permitted','denied')),
  field_provenance jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  cafe_id uuid REFERENCES cafes(id),
  action text NOT NULL,
  reason text NOT NULL CHECK(length(trim(reason)) > 0),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Dedicated non-owner role. Runtime authentication and tenant context are not yet enabled.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'ghahvehto_app') THEN
    CREATE ROLE ghahvehto_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_app;
GRANT SELECT ON cafes,branches,cafe_memberships,users TO ghahvehto_app;
GRANT UPDATE(name,normalized_name) ON cafes TO ghahvehto_app;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafes ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_user ON users TO ghahvehto_app
  USING(id = nullif(current_setting('app.user_id', true),'')::uuid);
CREATE POLICY own_membership ON cafe_memberships TO ghahvehto_app
  USING(user_id = nullif(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY member_cafe_read ON cafes FOR SELECT TO ghahvehto_app
  USING(EXISTS(SELECT 1 FROM cafe_memberships m WHERE m.cafe_id = cafes.id));
CREATE POLICY owner_cafe_edit ON cafes FOR UPDATE TO ghahvehto_app
  USING(EXISTS(SELECT 1 FROM cafe_memberships m WHERE m.cafe_id = cafes.id AND m.role = 'owner'))
  WITH CHECK(EXISTS(SELECT 1 FROM cafe_memberships m WHERE m.cafe_id = cafes.id AND m.role = 'owner'));
CREATE POLICY scoped_branch_read ON branches FOR SELECT TO ghahvehto_app
  USING(EXISTS(SELECT 1 FROM cafe_memberships m WHERE m.cafe_id = branches.cafe_id AND (m.branch_id IS NULL OR m.branch_id = branches.id)));

-- No general grants on sessions, audit or provenance; no reward counters exist.
