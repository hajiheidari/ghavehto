-- Internal identity storage; no public login/provider is enabled by this migration.
CREATE TABLE otp_challenges (
  id uuid PRIMARY KEY,
  phone_hash bytea NOT NULL CHECK (octet_length(phone_hash) = 32),
  ip_hash bytea NOT NULL CHECK (octet_length(ip_hash) = 32),
  code_digest bytea NOT NULL CHECK (octet_length(code_digest) = 32),
  status text NOT NULL CHECK (status IN ('pending','sent','failed','superseded','consumed')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  consumed_at timestamptz,
  CHECK ((status = 'consumed') = (consumed_at IS NOT NULL))
);
CREATE INDEX otp_phone_window_idx ON otp_challenges(phone_hash,created_at DESC);
CREATE INDEX otp_ip_window_idx ON otp_challenges(ip_hash,created_at DESC);
CREATE UNIQUE INDEX otp_one_active_phone_idx ON otp_challenges(phone_hash)
  WHERE status IN ('pending','sent');

CREATE TABLE otp_verification_limits (
  ip_hash bytea PRIMARY KEY CHECK (octet_length(ip_hash) = 32),
  window_started_at timestamptz NOT NULL,
  attempts smallint NOT NULL CHECK (attempts BETWEEN 1 AND 20)
);
ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verification_limits ENABLE ROW LEVEL SECURITY;
-- No grants/policies for the café application role: identity credentials stay private.
