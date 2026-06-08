-- ============================================================
-- 0157 — trigram search index on tb_api_china_hs.namecategory
-- ============================================================
-- Theme: surface the dormant China product-search-demand goldmine
--        (2026-06-09 · goldmine-activation).
--
-- What tb_api_china_hs is:
--   ~77k rows recording every China product-search the legacy PCS members
--   ran — keyword searches (type=1) + pasted 1688/taobao/tmall product
--   links (type=2/3/4) — together with the resolved category name
--   (`namecategory`). It is pure read-only reference data: real customer
--   search demand + a China product-category dictionary. NOTHING in the
--   app read it until the new admin lookup tool (/admin/tools/china-category).
--
--   Columns (legacy schema, migration 0081):
--     id          bigint   PK
--     whsid       bigint   warehouse id the search ran under
--     url         text     keyword or 1688/taobao/tmall product URL
--     type        integer  1=keyword · 2=1688 link · 3=taobao · 4=tmall
--     status      integer  0=active · 1=inactive
--     namecategory varchar(200)  resolved China category name (searchable)
--
-- Why this index:
--   The lookup tool searches `namecategory` (and `url`) with ILIKE
--   '%term%'. On 77k rows a leading-wildcard ILIKE forces a sequential
--   scan. A pg_trgm GIN index makes substring/ILIKE matching index-assisted
--   so staff search stays sub-100ms as the table grows. The tool degrades
--   gracefully (still works, just seq-scans) if pg_trgm is unavailable.
--
-- Reach: read-only — zero rows mutated, zero behavioural change to any
--        existing flow. Pure additive index + extension.
--
-- Idempotent: CREATE EXTENSION / INDEX IF NOT EXISTS · safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on the category name (primary search column).
CREATE INDEX IF NOT EXISTS tb_api_china_hs_namecategory_trgm_idx
  ON public.tb_api_china_hs
  USING gin (namecategory public.gin_trgm_ops);

-- GIN trigram index on the url/keyword (secondary search column).
CREATE INDEX IF NOT EXISTS tb_api_china_hs_url_trgm_idx
  ON public.tb_api_china_hs
  USING gin (url public.gin_trgm_ops);

COMMENT ON INDEX public.tb_api_china_hs_namecategory_trgm_idx IS
  'Trigram index for ILIKE substring search on the China category name. Powers the admin read-only lookup /admin/tools/china-category (goldmine activation 2026-06-09). NULL behaviour change to existing flows.';

-- NEXT FREE = 0158
