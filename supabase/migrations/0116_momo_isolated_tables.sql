-- ════════════════════════════════════════════════════════════
-- 0116 · momo_* isolated tables — Admin MOMO Status Sync
-- ════════════════════════════════════════════════════════════
-- Brief: ปอน 2026-05-28 — สร้าง table ใหม่ของ MOMO ให้ Admin กดดึง
-- สถานะ MOMO Cargo API ได้เอง โดย "ห้ามแก้ table เดิมเด็ดขาด ห้าม
-- upsert ลง table เดิม"
--
-- ⚠️ ISOLATION RULES (per brief 2026-05-28):
--   ✅ สร้าง table ใหม่เฉพาะ MOMO เท่านั้น
--   ✅ ห้าม FK ไป legacy table (cargo_*, tb_*) ลดความเสี่ยง
--   ✅ RLS = service_role only (admin client) — ลูกค้า anon ห้ามเห็น
--   ✅ Migration นี้แตะเฉพาะ 4 table ใหม่ของ MOMO เท่านั้น
--   ❌ ห้าม ALTER TABLE table เดิม / ห้าม DROP / ห้าม RENAME
--   ❌ ห้าม ALTER TYPE enum เดิม / ห้ามแก้ trigger เดิม / function เดิม
--   ❌ ห้าม UPDATE / DELETE / TRUNCATE table เดิม
--
-- Tables created (4):
--   momo_import_tracks     ← payload จาก /api/func/get/import/track/{date}
--   momo_container_closed  ← payload จาก /api/func/get/container/closed/{date}
--   momo_sack_infos        ← payload จาก /api/sack/get/info/{sackNo}
--   momo_sync_logs         ← bookkeeping ของแต่ละครั้งที่ admin sync
--
-- Existing MOMO infrastructure preserved (NOT touched):
--   - lib/integrations/momo-jmf/* (cron writes to cargo_* spine — ยังทำงาน)
--   - actions/admin/momo-sync.ts
--   - app/api/cron/momo-sync/route.ts
--   - /admin/api-forwarder-momo/manual + /admin/momo-lcl
--
-- Idempotent (safe to re-run).
-- ════════════════════════════════════════════════════════════

-- ── 1. momo_import_tracks ─────────────────────────────────────
-- เก็บผลจาก GET /api/func/get/import/track/{date}
-- รายการ tracking / shipment import ระดับ tracking number ต่อชิ้น
create table if not exists public.momo_import_tracks (
  id                  uuid primary key default gen_random_uuid(),
  momo_tracking_no    text,
  momo_sack_no        text,
  momo_container_no   text,
  date_from           date,
  date_to             date,
  phase               text,
  shipment_status     text,
  billing_status      text,
  job_status          text,
  issue_status        text,
  admin_status_text   text,
  current_location    text,
  etd                 timestamptz,
  eta                 timestamptz,
  momo_updated_at     timestamptz,
  raw                 jsonb not null,
  last_synced_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.momo_import_tracks enable row level security;
comment on table public.momo_import_tracks is
  'MOMO Import Track API payload (per-tracking). Admin-only via service_role. NO FK to legacy cargo_* / tb_*. Created 2026-05-28.';
comment on column public.momo_import_tracks.raw is
  'Full original MOMO response object per record — preserve for debug + remap when status enum evolves.';
create index if not exists momo_import_tracks_tracking_idx  on public.momo_import_tracks (momo_tracking_no);
create index if not exists momo_import_tracks_container_idx on public.momo_import_tracks (momo_container_no);
create index if not exists momo_import_tracks_sack_idx      on public.momo_import_tracks (momo_sack_no);
create index if not exists momo_import_tracks_synced_idx    on public.momo_import_tracks (last_synced_at desc);
create index if not exists momo_import_tracks_date_idx      on public.momo_import_tracks (date_from);
-- Dedupe key for upsert — one tracking number per record
create unique index if not exists momo_import_tracks_tracking_unique
  on public.momo_import_tracks (momo_tracking_no)
  where momo_tracking_no is not null;


-- ── 2. momo_container_closed ──────────────────────────────────
-- เก็บผลจาก GET /api/func/get/container/closed/{date}
-- รายการตู้/รอบรถที่ MOMO ปิดตามช่วงวันที่
create table if not exists public.momo_container_closed (
  id                  uuid primary key default gen_random_uuid(),
  momo_container_no   text,
  momo_sack_no        text,
  date_from           date,
  date_to             date,
  closed_at           timestamptz,
  phase               text,
  shipment_status     text,
  admin_status_text   text,
  raw                 jsonb not null,
  last_synced_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.momo_container_closed enable row level security;
comment on table public.momo_container_closed is
  'MOMO Container Closed API payload. Admin-only via service_role. NO FK to legacy. Created 2026-05-28.';
create index if not exists momo_container_closed_container_idx on public.momo_container_closed (momo_container_no);
create index if not exists momo_container_closed_sack_idx      on public.momo_container_closed (momo_sack_no);
create index if not exists momo_container_closed_synced_idx    on public.momo_container_closed (last_synced_at desc);
create index if not exists momo_container_closed_date_idx      on public.momo_container_closed (date_from);
-- Dedupe key — one container per record
create unique index if not exists momo_container_closed_container_unique
  on public.momo_container_closed (momo_container_no)
  where momo_container_no is not null;


-- ── 3. momo_sack_infos ────────────────────────────────────────
-- เก็บผลจาก GET /api/sack/get/info/{sackNo}
-- รายละเอียด sack ต่อ sack (มี outside weight/CBM ระดับ sack)
create table if not exists public.momo_sack_infos (
  id                  uuid primary key default gen_random_uuid(),
  momo_sack_no        text not null,
  momo_tracking_no    text,
  momo_container_no   text,
  phase               text,
  shipment_status     text,
  billing_status      text,
  job_status          text,
  issue_status        text,
  admin_status_text   text,
  current_location    text,
  etd                 timestamptz,
  eta                 timestamptz,
  momo_updated_at     timestamptz,
  raw                 jsonb not null,
  last_synced_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint momo_sack_infos_sack_unique unique (momo_sack_no)
);
alter table public.momo_sack_infos enable row level security;
comment on table public.momo_sack_infos is
  'MOMO Sack Info API payload (per-sack reconciliation surface). Admin-only via service_role. NO FK to legacy. Created 2026-05-28.';
create index if not exists momo_sack_infos_tracking_idx  on public.momo_sack_infos (momo_tracking_no);
create index if not exists momo_sack_infos_container_idx on public.momo_sack_infos (momo_container_no);
create index if not exists momo_sack_infos_synced_idx    on public.momo_sack_infos (last_synced_at desc);


-- ── 4. momo_sync_logs ─────────────────────────────────────────
-- บันทึกการกด sync ของ Admin ทุกครั้ง (preview ก็เก็บ)
-- ใช้ debug + audit ว่าใครกดอะไรเมื่อไหร่ มี error อะไร
create table if not exists public.momo_sync_logs (
  id                       uuid primary key default gen_random_uuid(),
  sync_type                text not null,                  -- 'import_track' | 'container_closed' | 'sack_info' | 'preview' | 'sync'
  date_from                date,
  date_to                  date,
  sack_no                  text,
  status                   text not null,                  -- 'success' | 'partial' | 'failed' | 'preview'
  import_track_count       integer not null default 0,
  container_closed_count   integer not null default 0,
  sack_info_count          integer not null default 0,
  mapped_count             integer not null default 0,
  unmapped_count           integer not null default 0,
  upserted_count           integer not null default 0,
  failed_count             integer not null default 0,
  errors                   jsonb not null default '[]'::jsonb,
  created_by               uuid,                            -- auth.uid() ของ admin (ไม่ FK เพื่อ isolation)
  created_at               timestamptz not null default now()
);
alter table public.momo_sync_logs enable row level security;
comment on table public.momo_sync_logs is
  'Audit log of every Admin MOMO sync (preview + real). Admin-only via service_role. NO FK to auth.users (isolation). Created 2026-05-28.';
create index if not exists momo_sync_logs_created_idx     on public.momo_sync_logs (created_at desc);
create index if not exists momo_sync_logs_sync_type_idx   on public.momo_sync_logs (sync_type);
create index if not exists momo_sync_logs_status_idx      on public.momo_sync_logs (status);
create index if not exists momo_sync_logs_created_by_idx  on public.momo_sync_logs (created_by);


-- ── 5. RLS policies — service_role only ───────────────────────
-- ทั้ง 4 table นี้ใช้ผ่าน admin client (service_role) เท่านั้น
-- ลูกค้า anon / authenticated ไม่มี policy → reject ทุก request
-- (default-deny เมื่อ RLS เปิดและไม่มี policy = reject)
--
-- service_role bypass RLS by default (Supabase built-in) — เลย
-- ไม่ต้องเขียน policy แยกสำหรับมัน ก็เข้าได้ครบ.
--
-- ใส่ policy "block anon/authenticated explicitly" เป็น belt-and-
-- suspenders เผื่อ migration อนาคตเปิด policy อื่นมา. Pattern เดียวกับ
-- ที่ tb_notify_sheet_* ใช้ (migration 0112).
--
-- (ไม่มี policy ALLOW อะไรเลย → ทุก non-service-role request reject.)

-- ════════════════════════════════════════════════════════════
-- DONE 0116.
--
-- Verification queries (run by hand after migration):
--   SELECT count(*) FROM momo_import_tracks;     -- 0
--   SELECT count(*) FROM momo_container_closed;  -- 0
--   SELECT count(*) FROM momo_sack_infos;        -- 0
--   SELECT count(*) FROM momo_sync_logs;         -- 0
--
-- Confirm legacy untouched:
--   SELECT count(*) FROM cargo_containers;       -- (unchanged)
--   SELECT count(*) FROM cargo_shipments;        -- (unchanged)
--   SELECT count(*) FROM tb_forwarder;           -- (unchanged)
-- ════════════════════════════════════════════════════════════
