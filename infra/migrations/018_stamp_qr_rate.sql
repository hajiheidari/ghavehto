ALTER TABLE public.stamp_qr_tokens ADD COLUMN issued_at timestamptz;
UPDATE public.stamp_qr_tokens SET issued_at=expires_at-interval '90 seconds';
ALTER TABLE public.stamp_qr_tokens ALTER COLUMN issued_at SET NOT NULL;
CREATE INDEX stamp_qr_recipient_issued_idx ON public.stamp_qr_tokens(recipient_id,issued_at DESC);

-- Serialize issuance per recipient across cafés and branches.
CREATE OR REPLACE FUNCTION public.issue_stamp_qr(recipient uuid,target_cafe uuid,target_branch uuid,target_program uuid,target_version integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE
  raw_token text;
  issued timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'QR issuance requires read committed isolation' USING ERRCODE='25000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=recipient AND phone_verified_at IS NOT NULL AND deleted_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.cafes c JOIN public.branches b ON b.cafe_id=c.id
      WHERE c.id=target_cafe AND c.active AND b.id=target_branch)
    OR NOT EXISTS (SELECT 1 FROM public.stamp_program_versions WHERE cafe_id=target_cafe AND program_id=target_program AND version=target_version) THEN
    RAISE EXCEPTION 'QR scope unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('stamp-qr-issue:'||recipient::text,0));
  issued:=clock_timestamp();
  IF EXISTS (SELECT 1 FROM public.stamp_qr_tokens
    WHERE recipient_id=recipient AND issued_at>issued-interval '60 seconds'
    ORDER BY issued_at DESC OFFSET 4 LIMIT 1) THEN
    RAISE EXCEPTION 'QR issuance limit reached' USING ERRCODE='54000';
  END IF;
  raw_token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  INSERT INTO public.stamp_qr_tokens(token_hash,recipient_id,cafe_id,branch_id,program_id,program_version,issued_at,expires_at)
    VALUES(sha256(convert_to(raw_token,'UTF8')),recipient,target_cafe,target_branch,target_program,target_version,issued,issued+interval '90 seconds');
  RETURN raw_token;
END $$;
REVOKE ALL ON FUNCTION public.issue_stamp_qr(uuid,uuid,uuid,uuid,integer) FROM PUBLIC;
