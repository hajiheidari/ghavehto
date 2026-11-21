-- Restricted storage for hashed referral codes and verified attribution.
CREATE TABLE public.referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES public.users(id),
  code_hash bytea NOT NULL UNIQUE CHECK (octet_length(code_hash)=32),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  revoked_at timestamptz,
  UNIQUE (id,inviter_id)
);
CREATE TABLE public.referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL,
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL UNIQUE REFERENCES public.users(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (inviter_id<>invitee_id),
  FOREIGN KEY (link_id,inviter_id) REFERENCES public.referral_links(id,inviter_id)
);
CREATE TRIGGER referral_attributions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.referral_attributions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_loyalty_history_change();
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_links,public.referral_attributions FROM PUBLIC;

-- Internal only. The future caller must bind the recipient to verified registration.
CREATE FUNCTION public.attribute_verified_referral(recipient uuid,hashed_code bytea)
RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  link public.referral_links%ROWTYPE;
  existing public.referral_attributions%ROWTYPE;
  verified_accounts integer;
BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Referral attribution requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF recipient IS NULL OR hashed_code IS NULL OR octet_length(hashed_code)<>32 THEN
    RAISE EXCEPTION 'Referral unavailable' USING ERRCODE='22023';
  END IF;
  SELECT * INTO link FROM public.referral_links WHERE code_hash=hashed_code FOR SHARE;
  IF NOT FOUND OR link.inviter_id=recipient THEN
    RAISE EXCEPTION 'Referral unavailable' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.users WHERE id IN (recipient,link.inviter_id)
    AND phone_verified_at IS NOT NULL AND deleted_at IS NULL ORDER BY id FOR SHARE;
  GET DIAGNOSTICS verified_accounts=ROW_COUNT;
  IF verified_accounts<>2 THEN RAISE EXCEPTION 'Referral unavailable' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('referral-invitee:'||recipient::text,0));
  SELECT * INTO existing FROM public.referral_attributions WHERE invitee_id=recipient;
  IF FOUND THEN
    IF existing.link_id=link.id THEN RETURN existing.id; END IF;
    RAISE EXCEPTION 'Referral already attributed' USING ERRCODE='23505';
  END IF;
  IF link.revoked_at IS NOT NULL OR link.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'Referral unavailable' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.referral_attributions(link_id,inviter_id,invitee_id)
    VALUES(link.id,link.inviter_id,recipient) RETURNING * INTO existing;
  INSERT INTO public.audit_events(action,reason,metadata)
    VALUES('loyalty.referral_attributed','Verified referral attribution',jsonb_build_object('attributionId',existing.id));
  RETURN existing.id;
END $$;
REVOKE ALL ON FUNCTION public.attribute_verified_referral(uuid,bytea) FROM PUBLIC;
