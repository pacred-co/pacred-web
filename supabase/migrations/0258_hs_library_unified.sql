-- ════════════════════════════════════════════════════════════
-- 0258 · คลัง HS CODE LIBRARY — one code-grain library, one page
-- ════════════════════════════════════════════════════════════
-- Owner 2026-07-16: "ยุบทิ้ง ให้มารวมกันอยู่ทีเดียว และหน้าเดียวกัน ·
-- ใช้ docbot เป็นพื้นฐาน แล้วต่อยอดเป็น คลัง HS CODE LIBRARY ตัวเต็ม"
--
-- 🔴 ANCHOR = hs_codes, NOT doc_bot_hs_codes. This INVERTS the naive reading
-- of "ใช้ docbot เป็นพื้นฐาน" (= use it as the BASE). Verified from source:
--   1. 5 FKs point at hs_codes(code) ON DELETE RESTRICT (container_hs_lines ·
--      freight_shipments · freight_invoices · freight_invoice_lines ·
--      customs_declaration_lines) → hs_codes cannot be retired or replaced by
--      a view, and the FK is a live WRITE gate (23503 on a ใบขน line insert).
--   2. doc_bot_hs_codes has ZERO duty consumers (one read-only browse action);
--      ALL duty/money consumers read hs_codes. Anchoring on doc_bot would mean
--      repointing every money path onto a table with no FK integrity.
--   3. doc_bot is PRODUCT-grain (5,335 rows / 1,530 codes / 2,771 products).
--      Code-level duty on it = ~4x duplication + an update anomaly that is
--      ALREADY REAL: 94 codes have rows that disagree with each other on อากร.
-- "docbot เป็นพื้นฐาน" is honoured in CONTENT: doc-bot supplies 1,318 of the
-- 1,718 unified codes (77% of the backbone; curated hs_codes = 133 = 8%), and
-- doc_bot stays intact as the product→code alias child. ONE page joins both.
--
-- Additive + idempotent. No data moves here (that is the merge script).
-- Apply to BOTH prod + dev.
-- ════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

-- ── 1. hs_codes → the unified code-grain library ─────────────
alter table public.hs_codes
  add column if not exists source          text,          -- doc_bot | ไฟล์:nnb | ใบขน | curated
  add column if not exists provenance      text,          -- curated_0224 | dummy_0030 | doc_bot | decl
  add column if not exists is_canonical    boolean not null default false,
  -- 🔴 duty trust: default_duty_pct is NOT NULL DEFAULT 0, and 0 reads as
  -- "ยกเว้น/exempt" to every consumer. An imported code whose duty we do NOT
  -- know would silently present as 0% exempt on a column that gets snapshotted
  -- into container_hs_lines.duty_pct_used and persisted as duty_thb/vat_thb.
  -- duty_confirmed separates a confirmed 0% from an unknown.
  add column if not exists duty_confirmed  boolean not null default false,
  -- ── ใบขน-observed reality (comparison only — never the duty a doc reads) ──
  add column if not exists decl_count      integer not null default 0,   -- DISTINCT ref_no
  add column if not exists decl_duty_pct   numeric,        -- modal @ priv='000' (อากรปกติ)
  add column if not exists decl_form_e_pct numeric,        -- modal @ priv='ACN' (Form-E)
  add column if not exists decl_duty_stable boolean,       -- false = >1 duty within priv=000
  add column if not exists decl_last_used  text,
  add column if not exists updated_by      text;

-- Mark the existing 133 so the merge's precedence ladder has a ground truth to
-- arbitrate against. The 9 codes below are mig 0030's literal seed — its own
-- comment reads "seed a few common HS codes so the picker isn't empty" = they
-- are placeholder GUESSES, not curated data, and the ใบขน prove 2 of them wrong
-- (8504.40.90 canon 5% vs 10% observed · 9503.00.99 canon 0% vs 10% observed).
update public.hs_codes set
  is_canonical = true,
  source       = coalesce(source, 'curated'),
  provenance   = coalesce(provenance,
                   case when code in ('8517.12.00','8504.40.90','6109.10.00',
                                      '6204.62.00','9503.00.99','3924.10.00',
                                      '6403.99.00','8473.30.20','9999.99.99')
                        then 'dummy_0030' else 'curated_0224' end),
  duty_confirmed = case when code in ('8517.12.00','8504.40.90','6109.10.00',
                                      '6204.62.00','9503.00.99','3924.10.00',
                                      '6403.99.00','8473.30.20','9999.99.99')
                        then false else true end
where provenance is null;

-- ── 2. the join key — GENERATED so it can never drift ────────
-- SOURCE-AWARE by necessity, not preference. Measured on prod:
--   ใบขน tariff_hs : 12 digits on 10435/10435 lines, 4-zero-padded on
--                    10435/10435 → the real HS8 is the RIGHT 8.
--   hs_codes code  : 6-digit x16 · 8-digit x18 · 10-digit x99 → LEFT 8.
--   doc_bot hs_code: 8-digit x4870 dominant (+4/5/6/7/9/10/12/16 + 125 keyless).
-- Join hit-rates proving the branch is required (hs∩bot · hs∩dec · bot∩dec):
--   right(8) everywhere → —      · 20/133 ✗ · 579/936
--   left(8)  everywhere → 74/133 ·  0/936 ✗ ·   0/936 ✗
--   SOURCE-AWARE        → 74/133 · 67/936   · 579/936 ✓   (unified = 1,718)
-- A single strip/pad rule mis-joins hs_codes (2508.10.00.00 → '08100000',
-- a different tariff entirely).
alter table public.hs_codes
  add column if not exists hs8_key text generated always as (
    case
      when regexp_replace(code,'[^0-9]','','g') = '' then null
      when length(regexp_replace(code,'[^0-9]','','g')) = 12
       and left(regexp_replace(code,'[^0-9]','','g'),4) = '0000'
        then right(regexp_replace(code,'[^0-9]','','g'),8)
      else rpad(left(regexp_replace(code,'[^0-9]','','g'),8),8,'0')
    end
  ) stored,
  -- Marks a key produced by zero-padding a <8-digit heading (the flagged
  -- assumption below) so the UI can badge it and the merge can refuse to let a
  -- padded row overwrite an exact-8 duty.
  add column if not exists hs8_is_padded boolean generated always as (
    length(regexp_replace(code,'[^0-9]','','g')) between 1 and 7
  ) stored;

alter table public.doc_bot_hs_codes
  add column if not exists hs8_key text generated always as (
    case
      when coalesce(hs_code,'') = '' then null
      when regexp_replace(hs_code,'[^0-9]','','g') = '' then null
      else rpad(left(regexp_replace(hs_code,'[^0-9]','','g'),8),8,'0')
    end
  ) stored;

create index if not exists hs_codes_hs8_key_idx         on public.hs_codes (hs8_key);
create index if not exists doc_bot_hs_codes_hs8_key_idx on public.doc_bot_hs_codes (hs8_key);
create index if not exists hs_codes_source_idx          on public.hs_codes (source);
create index if not exists hs_codes_decl_count_idx      on public.hs_codes (decl_count desc) where decl_count > 0;

-- search (the library becomes ~1,718 rows and the page searches code/TH/EN)
create index if not exists hs_codes_desc_trgm_idx       on public.hs_codes using gin (description gin_trgm_ops);
create index if not exists hs_codes_desc_en_trgm_idx    on public.hs_codes using gin (description_en gin_trgm_ops);
create index if not exists doc_bot_hs_codes_th_trgm_idx on public.doc_bot_hs_codes using gin (th gin_trgm_ops);

-- ── 3. RLS — hold the CURRENT posture, do not widen by accident ──
-- hs_codes today: SELECT to authenticated (0031) + is_admin() write (0030).
-- The library gains ~1,585 rows of the SAME KIND of reference data (HS codes +
-- duty), so the existing posture still fits and is deliberately left untouched.
-- doc_bot_hs_codes + doc_bot_hs_overrides: RLS ENABLED with ZERO policies =
-- service-role only. They stay that way — the unified page reads them through a
-- role-gated server action (createAdminClient), so no policy is added here;
-- adding one would silently widen exposure for no gain.

comment on column public.hs_codes.hs8_key is
  'Source-aware 8-digit join key. ใบขน tariff_hs = 12-digit 0000-padded → right(8); hs_codes/doc_bot → left(8) rpad. Join key only — `code` stays the display + FK value.';
comment on column public.hs_codes.decl_duty_pct is
  'อากรที่ใช้จริงบนใบขน — modal @ priv=000. COMPARISON ONLY. Never overwrites default_duty_pct on a curated row.';
comment on column public.hs_codes.decl_form_e_pct is
  'Form-E ที่ใช้จริง — modal @ priv=ACN (ASEAN-China). priv=000 and priv=ACN are DIFFERENT duties (measured: 000 avg 10.209% vs ACN avg 0.274%, 96% zero); a modal across both blends 10% with 0% and yields a wrong library duty.';
comment on column public.hs_codes.decl_duty_stable is
  'false = >1 distinct duty observed within priv=000 (14 codes) → the modal is a pick, badge it. Ignoring priv, 214/936 look unstable; the priv split explains 200 of those.';
comment on column public.hs_codes.duty_confirmed is
  'false = default_duty_pct is an unconfirmed placeholder (0 = unknown, NOT exempt). Consumers that snapshot/persist duty or VAT must surface this.';
comment on column public.hs_codes.hs8_is_padded is
  'true = hs8_key came from zero-padding a <8-digit heading (assumption: the .00 subheading). 3 known collisions with an exact-8 doc_bot code: 4202.29 · 8414.10 · 9505.90. Owner/Doc to confirm.';
comment on column public.hs_codes.is_canonical is
  'true = the row existed in the curated 133 before the 2026-07-16 unification.';
comment on column public.hs_codes.provenance is
  'curated_0224 (Doc-team curated) | dummy_0030 (mig 0030 placeholder seed — "so the picker isnt empty") | doc_bot | decl (observed on a real ใบขน).';
