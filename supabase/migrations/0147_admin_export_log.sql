-- ════════════════════════════════════════════════════════════
-- 0147 · admin_export_log — audit trail for admin CSV exports
-- ════════════════════════════════════════════════════════════
-- Owner directive (2026-06-07): the admin CSV exports can now dump the FULL
-- filtered result set (not just the 50-row page) — most sensitively the
-- /admin/leads cold-list (6,936 callable customer phones) + the customer
-- contact lists, which sales hands to external VAs. To prevent a silent PII
-- walk-off, every FULL export writes one row here: who exported what segment,
-- with which filters, how many rows, when. Per-page (paginated) exports are
-- NOT logged — only the "export all filtered" path.
--
-- ⚠️ ISOLATION RULES (per project safety constraints · same as 0133/0131/0116):
--   ✅ สร้าง table ใหม่ 1 table เท่านั้น (audit log)
--   ✅ ห้าม FK ไป table เดิม (tb_*, profiles, auth.users) — admin_id/admin_code
--      เป็น plain text เก็บ profile uuid / legacy-admin-code เฉยๆ (no FK).
--   ✅ RLS = service_role only (admin client) — anon/authenticated reject.
--   ❌ ห้าม ALTER / DROP / RENAME / TRUNCATE / DELETE table เดิม.
--
-- Idempotent (safe to re-run): create … if not exists.
-- ════════════════════════════════════════════════════════════

create table if not exists public.admin_export_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    text,                  -- exporting admin (profile uuid · NO FK)
  admin_code  text,                  -- exporting admin's member/employee code (NO FK)
  dataset     text not null,         -- 'leads' | 'customers' | 'forwarders' | …
  filters     jsonb not null default '{}'::jsonb,  -- the active filter set (segment/status/q/group/date…)
  row_count   integer not null default 0,          -- rows in the exported file
  truncated   boolean not null default false,      -- true if the export hit the safety cap
  created_at  timestamptz not null default now()
);

alter table public.admin_export_log enable row level security;

comment on table public.admin_export_log is
  'Audit trail for admin FULL-filtered CSV exports (owner directive 2026-06-07). One row per "export all" click, keyed by admin_id/admin_code (NO FK). Admin-only via service_role. Paginated per-page exports are not logged.';
comment on column public.admin_export_log.admin_id is
  'Exporting admin profile uuid. plain text, no FK.';
comment on column public.admin_export_log.admin_code is
  'Exporting admin member/employee code. plain text, no FK.';
comment on column public.admin_export_log.dataset is
  'The exported dataset key (leads | customers | forwarders | refunds | …).';
comment on column public.admin_export_log.filters is
  'The active filter set at export time (segment/status/q/group/type/date-window/…) as jsonb.';

-- Audit reads: "who exported the lead list", "all exports this week".
create index if not exists admin_export_log_created_at_idx
  on public.admin_export_log (created_at desc);
create index if not exists admin_export_log_dataset_idx
  on public.admin_export_log (dataset, created_at desc);
create index if not exists admin_export_log_admin_idx
  on public.admin_export_log (admin_id, created_at desc);

-- ── RLS — service_role only ───────────────────────────────────
-- ใช้ผ่าน admin client (service_role) เท่านั้น. service_role bypass RLS
-- by default → ไม่ต้องเขียน policy ALLOW; ไม่มี policy ALLOW = anon/
-- authenticated reject ทุก request (default-deny). Pattern เดียวกับ
-- lead_call_log (0133) · momo_* (0116) · line_* (0131).
