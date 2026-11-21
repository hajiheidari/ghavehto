DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ghahvehto_stamp_qr') THEN
    CREATE ROLE ghahvehto_stamp_qr NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO ghahvehto_stamp_qr;

CREATE TABLE public.stamp_qr_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
  recipient_id uuid NOT NULL REFERENCES public.users(id),
  cafe_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  program_id uuid NOT NULL,
  program_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  entry_id uuid UNIQUE REFERENCES public.stamp_entries(id),
  CHECK ((consumed_at IS NULL)=(entry_id IS NULL)),
  FOREIGN KEY (branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),
  FOREIGN KEY (program_id,cafe_id,program_version) REFERENCES public.stamp_program_versions(program_id,cafe_id,version)
);
ALTER TABLE public.stamp_qr_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stamp_qr_tokens FROM PUBLIC;

-- A trusted future server supplies the recipient from its verified session.
CREATE FUNCTION public.issue_stamp_qr(recipient uuid,target_cafe uuid,target_branch uuid,target_program uuid,target_version integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  raw_token text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.cafes c JOIN public.branches b ON b.cafe_id=c.id
      WHERE c.id=target_cafe AND c.active AND b.id=target_branch)
    OR NOT EXISTS (SELECT 1 FROM public.stamp_program_versions WHERE cafe_id=target_cafe AND program_id=target_program AND version=target_version) THEN
    RAISE EXCEPTION 'QR scope unavailable' USING ERRCODE='42501';
  END IF;
  raw_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  INSERT INTO public.stamp_qr_tokens(token_hash,recipient_id,cafe_id,branch_id,program_id,program_version,expires_at)
    VALUES(sha256(convert_to(raw_token,'UTF8')),recipient,target_cafe,target_branch,target_program,target_version,clock_timestamp()+interval '90 seconds');
  RETURN raw_token;
END $$;

-- The row lock serializes consumption. Failure leaves both the token and journal unchanged.
CREATE FUNCTION public.consume_stamp_qr(actor uuid,target_branch uuid,raw_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  token public.stamp_qr_tokens%ROWTYPE;
  receipt uuid;
  finished_at timestamptz;
BEGIN
  IF actor IS NULL OR target_branch IS NULL OR raw_token IS NULL OR raw_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'QR unavailable' USING ERRCODE='22023';
  END IF;
  SELECT * INTO token FROM public.stamp_qr_tokens WHERE token_hash=sha256(convert_to(raw_token,'UTF8')) FOR UPDATE;
  IF NOT FOUND OR token.branch_id<>target_branch OR token.consumed_at IS NOT NULL OR token.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'QR unavailable' USING ERRCODE='22023';
  END IF;
  receipt:=public.award_branch_stamp(actor,token.recipient_id,token.cafe_id,token.branch_id,
    token.program_id,token.program_version,token.id);
  finished_at:=clock_timestamp();
  IF token.expires_at<=finished_at THEN RAISE EXCEPTION 'QR unavailable' USING ERRCODE='22023'; END IF;
  UPDATE public.stamp_qr_tokens SET consumed_at=finished_at,entry_id=receipt WHERE id=token.id;
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.issue_stamp_qr(uuid,uuid,uuid,uuid,integer),public.consume_stamp_qr(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_stamp_qr(uuid,uuid,uuid,uuid,integer),public.consume_stamp_qr(uuid,uuid,text) TO ghahvehto_stamp_qr;
