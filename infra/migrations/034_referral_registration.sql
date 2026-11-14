-- The runtime may supply an optional hash for an INSERT, never for an existing user.
CREATE FUNCTION public.attach_referral_at_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  supplied text:=current_setting('ghahvehto.registration_referral',true);
BEGIN
  IF NEW.phone_verified_at IS NULL OR NEW.deleted_at IS NOT NULL OR supplied IS NULL
    OR supplied !~ '^[0-9a-f]{64}$' THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.attribute_verified_referral(NEW.id,decode(supplied,'hex'));
  EXCEPTION WHEN SQLSTATE '22023' THEN
    -- An expired, revoked or unknown link must not block registration.
    NULL;
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.attach_referral_at_registration() FROM PUBLIC;
CREATE TRIGGER attach_referral_at_registration AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.attach_referral_at_registration();
