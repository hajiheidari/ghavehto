ALTER TABLE sessions ADD COLUMN family_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sessions ADD COLUMN access_token_hash bytea UNIQUE;
ALTER TABLE sessions ADD COLUMN access_expires_at timestamptz;
ALTER TABLE sessions ADD COLUMN replaced_by uuid REFERENCES sessions(id);
CREATE INDEX sessions_family_idx ON sessions(family_id);
CREATE INDEX sessions_user_active_idx ON sessions(user_id) WHERE revoked_at IS NULL;
-- Existing sessions cannot acquire new access credentials through migration.
-- New sessions are created only by server identity services after verification.
