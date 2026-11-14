DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_identity') THEN
    CREATE ROLE ghahvehto_identity NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_identity;
GRANT SELECT,INSERT ON users,sessions,otp_challenges,otp_verification_limits TO ghahvehto_identity;
GRANT UPDATE(phone_ciphertext,phone_verified_at) ON users TO ghahvehto_identity;
GRANT UPDATE(revoked_at,replaced_by) ON sessions TO ghahvehto_identity;
GRANT UPDATE(status,attempts,consumed_at) ON otp_challenges TO ghahvehto_identity;
GRANT UPDATE(window_started_at,attempts) ON otp_verification_limits TO ghahvehto_identity;
GRANT INSERT(actor_id,action,reason,metadata) ON audit_events TO ghahvehto_identity;
CREATE POLICY identity_user_read ON users FOR SELECT TO ghahvehto_identity USING(true);
CREATE POLICY identity_user_create ON users FOR INSERT TO ghahvehto_identity
  WITH CHECK(phone_verified_at IS NOT NULL AND deleted_at IS NULL);
CREATE POLICY identity_user_verify ON users FOR UPDATE TO ghahvehto_identity
  USING(true) WITH CHECK(deleted_at IS NULL);
CREATE POLICY identity_sessions ON sessions TO ghahvehto_identity USING(true) WITH CHECK(true);
CREATE POLICY identity_otp ON otp_challenges TO ghahvehto_identity USING(true) WITH CHECK(true);
CREATE POLICY identity_verify_limits ON otp_verification_limits TO ghahvehto_identity USING(true) WITH CHECK(true);
CREATE POLICY identity_audit_append ON audit_events FOR INSERT TO ghahvehto_identity
  WITH CHECK(action IN ('identity.created','identity.verified','identity.deleted_denied',
    'session.issued','session.rotated','session.revoked','session.family_revoked'));
-- No identity-role grants on cafés, branches, memberships or commercial data.
