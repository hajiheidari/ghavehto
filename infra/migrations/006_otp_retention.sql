-- Fixed, bounded maintenance capability: identity logins never gain arbitrary DELETE.
CREATE FUNCTION public.prune_expired_otp()
RETURNS TABLE(challenges_deleted integer,verification_windows_deleted integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  challenges_deleted := 0;
  verification_windows_deleted := 0;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('ghahvehto:otp-cleanup',0)) THEN
    RETURN NEXT; RETURN;
  END IF;
  DELETE FROM public.otp_challenges WHERE id IN (
    SELECT id FROM public.otp_challenges
    WHERE created_at < clock_timestamp()-interval '24 hours' AND expires_at < clock_timestamp()
    ORDER BY created_at LIMIT 1000 FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS challenges_deleted = ROW_COUNT;
  DELETE FROM public.otp_verification_limits WHERE ip_hash IN (
    SELECT ip_hash FROM public.otp_verification_limits
    WHERE window_started_at < clock_timestamp()-interval '24 hours'
    ORDER BY window_started_at LIMIT 1000 FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS verification_windows_deleted = ROW_COUNT;
  INSERT INTO public.audit_events(action,reason,metadata) VALUES(
    'auth.otp_cleanup','Bounded expiry cleanup; no identity or session deletion',
    jsonb_build_object('challengesDeleted',challenges_deleted,'verificationWindowsDeleted',verification_windows_deleted));
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.prune_expired_otp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_expired_otp() TO ghahvehto_identity;
