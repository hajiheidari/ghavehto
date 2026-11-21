-- Reservation cancellation must couple stock, receipt state and credit recovery.
-- Until that path exists, standalone accounting reversal must fail closed.
CREATE FUNCTION public.reject_reserved_star_spend_reversal()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.star_redemptions WHERE entry_id=NEW.spend_id) THEN
    RAISE EXCEPTION 'Reserved star spend requires reservation cancellation' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reject_reserved_star_spend_reversal() FROM PUBLIC;
CREATE TRIGGER reserved_star_spend_reversal_guard BEFORE INSERT ON public.star_spend_reversals
  FOR EACH ROW EXECUTE FUNCTION public.reject_reserved_star_spend_reversal();
