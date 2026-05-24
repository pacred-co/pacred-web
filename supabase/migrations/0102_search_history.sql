-- ════════════════════════════════════════════════════════════
-- G8 · Search history tracking (D1 customer-backend gap #8)
-- ════════════════════════════════════════════════════════════
-- Per d1-customer-backend-gap-2026-05-24.md §5 #8 — "save search
-- history" handler. Mirrors the legacy `tb_history_key` table
-- (search.php → 0081 PCS legacy schema L2749-2767) but adapted to
-- Pacred conventions:
--
--   Legacy tb_history_key (MySQL):
--     id bigint PK, date timestamp, keyword text,
--     userid varchar(10), type varchar(1), apierror varchar(1),
--     categoryname varchar(300)
--
--   Pacred public.tb_search_history (this migration):
--     id uuid PK, user_id uuid FK auth.users (nullable for anon),
--     query text NOT NULL, source text,
--     result_count int, created_at timestamptz default now()
--
-- Naming kept as `tb_search_history` per the gap-audit spec — the
-- `tb_*` prefix is reserved in pacred-web for legacy-port tables
-- (0081_pcs_legacy_schema) so this fits the convention.
--
-- The legacy search.php L370-372 INSERT (commented in
-- app/[locale]/(protected)/search/page.tsx as FLAGGED — deferred to
-- Server Action) is what writes a row here.
--
-- RLS posture:
--   - owner-only read (SELECT where user_id = auth.uid())
--   - owner-only write (INSERT where user_id = auth.uid())
--   - owner-only delete (for clearMySearchHistory action)
--   - admin (super/ops) may read every row for analytics
--     (mirrors legacy /pcs-admin/report-search.php which aggregates
--     across all userIDs).
--
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) tb_search_history ──────────────────────────────────────────────
create table if not exists public.tb_search_history (
  id            uuid primary key default gen_random_uuid(),

  -- Nullable so anonymous searches (if ever surfaced through a public
  -- search proxy) can still log without an auth.users FK; today every
  -- write site is auth-gated by `/api/china-search/route.ts` so this
  -- column is effectively always set.
  user_id       uuid references auth.users(id) on delete cascade,

  query         text not null check (char_length(query) between 1 and 500),

  -- Free-form provider/screen tag — examples in current code:
  --   'china-search.keyword' · 'china-search.url' · 'china-search.url-detail'
  -- The legacy `type` column (1=keyword/2=1688/3=taobao/4=tmall) maps
  -- to this — kept text instead of enum so new search surfaces can
  -- add tags without a migration.
  source        text,

  -- Best-effort — written when the caller knows how many hits the API
  -- returned. NULL for searches that don't have a meaningful count
  -- (e.g. url-detail = single product).
  result_count  int,

  created_at    timestamptz not null default now()
);

-- ── 2) Indexes ────────────────────────────────────────────────────────
-- The "my recents" lookup: by user, newest first, limit 10.
create index if not exists tb_search_history_user_recent_idx
  on public.tb_search_history(user_id, created_at desc)
  where user_id is not null;

-- Admin analytics: "top queries across all users" — a per-query scan
-- on the query column (case-insensitive lookup ready, but we keep this
-- as a btree on (query) since the admin aggregate is a COUNT(*) GROUP
-- BY query → btree is the right shape).
create index if not exists tb_search_history_query_idx
  on public.tb_search_history(query);

-- ── 3) RLS ────────────────────────────────────────────────────────────
alter table public.tb_search_history enable row level security;

-- Owner reads their own.
drop policy if exists tb_search_history_select_own on public.tb_search_history;
create policy tb_search_history_select_own
  on public.tb_search_history for select
  using (user_id = auth.uid());

-- Owner inserts only as themselves (defence-in-depth — the Server
-- Action also sets user_id from the session). Anonymous insert
-- (user_id = null) deliberately disallowed at the RLS layer; if we
-- ever surface a public search proxy that needs to log, the
-- saveSearchQuery() action will switch to the admin client for that
-- branch — explicit + auditable.
drop policy if exists tb_search_history_insert_own on public.tb_search_history;
create policy tb_search_history_insert_own
  on public.tb_search_history for insert
  with check (user_id = auth.uid());

-- Owner deletes their own (clearMySearchHistory).
drop policy if exists tb_search_history_delete_own on public.tb_search_history;
create policy tb_search_history_delete_own
  on public.tb_search_history for delete
  using (user_id = auth.uid());

-- Admin OR-branch (super/ops only — analytics surface).
drop policy if exists tb_search_history_admin_read on public.tb_search_history;
create policy tb_search_history_admin_read
  on public.tb_search_history for select
  using (public.is_admin(array['super','ops']));

-- ── 4) Grants ─────────────────────────────────────────────────────────
-- authenticated role gets SELECT / INSERT / DELETE — RLS narrows to
-- owner rows. (No UPDATE — search logs are append-only.)
grant select, insert, delete on public.tb_search_history to authenticated;

-- ── 5) Comments ───────────────────────────────────────────────────────
comment on table public.tb_search_history is
  'G8 (D1 customer-backend gap #8) — search-query log written by actions/search.ts:saveSearchQuery(). 1:1 spiritual port of legacy tb_history_key (search.php L370-372 INSERT, deferred from the SC render). Owner-only RLS + super/ops read for the legacy report-search.php aggregate.';

comment on column public.tb_search_history.user_id is
  'auth.users FK. Nullable for future anonymous-search proxy support; today every write site auth-gates so this is always set. ON DELETE CASCADE — when a customer is purged, their search log goes too.';

comment on column public.tb_search_history.query is
  'The raw search string the user typed (1-500 chars). For URL searches this is the pasted URL. No PII validation — admin analytics may see this text.';

comment on column public.tb_search_history.source is
  'Free-form provider/surface tag. Examples: china-search.keyword · china-search.url · china-search.url-detail. Maps to legacy tb_history_key.type (1=keyword/2=1688/3=taobao/4=tmall) but as text so new surfaces add tags without a migration.';

comment on column public.tb_search_history.result_count is
  'Number of hits the search returned, best-effort. NULL when the caller does not have a meaningful count (e.g. url-detail = single product).';
