GRANT INSERT(actor_id,cafe_id,action,reason) ON audit_events TO ghahvehto_app;
CREATE POLICY cafe_owner_audit_append ON audit_events FOR INSERT TO ghahvehto_app
  WITH CHECK(actor_id=nullif(current_setting('app.user_id',true),'')::uuid
    AND action='cafe.profile_updated'
    AND EXISTS(SELECT 1 FROM cafe_memberships m WHERE m.cafe_id=audit_events.cafe_id AND m.role='owner' AND m.branch_id IS NULL));
