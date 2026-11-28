CREATE INDEX ownership_claims_history_page_idx ON public.ownership_claims(user_id,created_at DESC,id DESC);
