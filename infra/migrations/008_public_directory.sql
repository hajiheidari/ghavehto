-- Publication is an explicit, reviewed snapshot. Tenant profile edits do not
-- silently change public data. No runtime role can write to this table.
ALTER TABLE source_records ADD CONSTRAINT source_records_id_cafe_unique UNIQUE (id,cafe_id);
CREATE TABLE directory_listings (
  branch_id uuid PRIMARY KEY,
  cafe_id uuid NOT NULL,
  source_id uuid NOT NULL,
  cafe_name text NOT NULL CHECK (length(btrim(cafe_name)) BETWEEN 1 AND 120),
  branch_name text NOT NULL CHECK (length(btrim(branch_name)) BETWEEN 1 AND 120),
  province text NOT NULL CHECK (length(btrim(province)) BETWEEN 1 AND 80),
  city text NOT NULL CHECK (length(btrim(city)) BETWEEN 1 AND 80),
  neighborhood text NOT NULL DEFAULT '' CHECK (length(neighborhood) <= 100),
  reviewed_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  FOREIGN KEY (branch_id,cafe_id) REFERENCES branches(id,cafe_id),
  FOREIGN KEY (source_id,cafe_id) REFERENCES source_records(id,cafe_id)
);
ALTER TABLE directory_listings ENABLE ROW LEVEL SECURITY;
CREATE VIEW public_directory WITH (security_barrier = true) AS
  SELECT d.branch_id AS id, d.cafe_name, d.branch_name, d.province, d.city, d.neighborhood,
    regexp_replace(regexp_replace(lower(translate(normalize(concat_ws(' ',d.cafe_name,d.branch_name,d.province,d.city,d.neighborhood),NFKC),
      'يىك‌۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', 'ییک 01234567890123456789')), '[ً-ٰٟـ]', '', 'g'), '[[:space:]]+', ' ', 'g') AS search_text
  FROM directory_listings d
  JOIN cafes c ON c.id=d.cafe_id
  JOIN source_records s ON s.id=d.source_id AND s.cafe_id=d.cafe_id
  WHERE c.active AND d.withdrawn_at IS NULL AND s.rights_status='permitted';
REVOKE ALL ON directory_listings,public_directory FROM PUBLIC;
GRANT SELECT ON public_directory TO ghahvehto_identity;
