-- ════════════════════════════════════════════════════════════
-- 0112 · tb_notify_sheet_{mx,mk,sang} — Gap #1 foundation
-- ════════════════════════════════════════════════════════════
-- The Phase-A schema (`0081_pcs_legacy_schema.sql`) only ported
-- `tb_notify_sheet_ctt` — the dedupe cursor for the CTT warehouse
-- Google Sheet pull. The legacy system actually runs FOUR sheet pulls:
--
--   `pcs-admin/api-sheets-ctt.php`         → tb_notify_sheet_ctt        ✅ already exists
--   `pcs-admin/api-sheets-mx.php`          → tb_notify_sheet_mx         ⬇️ created here
--   `pcs-admin/api-sheets-mk.php`          → tb_notify_sheet_mk         ⬇️ created here
--   `pcs-admin/api-sheets-sang-2023.php`   → tb_notify_sheet_sang       ⬇️ created here
--
-- Per d1-deep-audit-2026-05-24 Gap #1 + `docs/audit/php-pcscargo-
-- integrations.md` §8. Each table is 1 row (the latest cursor) — the
-- adapter reads `numrow`, processes sheet rows > numrow, then updates
-- `numrow` to the new max. Mirrors the legacy 3-column shape exactly.
--
-- All four cursor tables are RLS-locked to `service_role` only — they
-- are operational state, not customer-facing. Matches the `tb_notify_
-- sheet_ctt` baseline from migration 0081.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- ── tb_notify_sheet_mx ─────────────────────────────────────
create table if not exists public.tb_notify_sheet_mx (
  id     bigserial primary key,
  date   timestamp without time zone,
  numrow integer not null default 0
);
alter table public.tb_notify_sheet_mx enable row level security;
comment on table public.tb_notify_sheet_mx is
  'Dedupe cursor for the MX warehouse Google Sheet pull (Gap #1, legacy api-sheets-mx.php). Mirrors tb_notify_sheet_ctt.';
comment on column public.tb_notify_sheet_mx.numrow is
  'Highest 1-based sheet row number already processed. The adapter pushes notifications for rows > numrow then updates this cursor.';

-- ── tb_notify_sheet_mk ─────────────────────────────────────
create table if not exists public.tb_notify_sheet_mk (
  id     bigserial primary key,
  date   timestamp without time zone,
  numrow integer not null default 0
);
alter table public.tb_notify_sheet_mk enable row level security;
comment on table public.tb_notify_sheet_mk is
  'Dedupe cursor for the MK warehouse Google Sheet pull (Gap #1, legacy api-sheets-mk.php). Mirrors tb_notify_sheet_ctt.';
comment on column public.tb_notify_sheet_mk.numrow is
  'Highest 1-based sheet row number already processed. The adapter pushes notifications for rows > numrow then updates this cursor.';

-- ── tb_notify_sheet_sang ───────────────────────────────────
create table if not exists public.tb_notify_sheet_sang (
  id     bigserial primary key,
  date   timestamp without time zone,
  numrow integer not null default 0
);
alter table public.tb_notify_sheet_sang enable row level security;
comment on table public.tb_notify_sheet_sang is
  'Dedupe cursor for the Sang warehouse Google Sheet pull (Gap #1, legacy api-sheets-sang-2023.php). Mirrors tb_notify_sheet_ctt.';
comment on column public.tb_notify_sheet_sang.numrow is
  'Highest 1-based sheet row number already processed. The adapter pushes notifications for rows > numrow then updates this cursor.';
