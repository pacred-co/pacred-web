-- ════════════════════════════════════════════════════════════
-- 0252 · MOMO packing-list upload HISTORY + preview (ภูม 2026-07-14)
-- ════════════════════════════════════════════════════════════
-- Owner brief (พี่ป๊อป via ภูม): "ตอนนี้อัพไฟล์ packing list ได้แล้ว แต่
-- ยังไม่มีประวัติที่เก็บ packing list ที่อัพไป อยากให้มีด้วย + กดพรีวิวดูได้
-- เพื่อเช็คซ้ำ เพราะบางแทร็กในระบบ MOMO ก็ไม่มี แต่ดันมามีใน Packing list"
--
-- Today `applyMomoPacking` parses the .xlsx server-side and DISCARDS the file
-- (no record, no re-preview, no reverse-check). This table records every upload:
--   • the ORIGINAL file (stored in the `csv-imports` bucket · re-download/preview)
--   • a PARSED SNAPSHOT (jsonb) so preview/compare never re-parses the 30MB file
--   • which container it covers + totals
--   • the REVERSE-CHECK result (trackings in the packing list that are NOT in the
--     MOMO API staging `momo_import_tracks`) — the exact gap พี่ป๊อป wants surfaced
--
-- 🔒 ISOLATION: additive REFERENCE table. Does NOT touch tb_forwarder / money /
--    the apply logic (momo-packing-reconcile.ts). Written by a SEPARATE action file
--    (momo-packing-history.ts). Service-role only (RLS). Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.momo_packing_upload (
  id                bigint generated always as identity primary key,
  -- the stored original file
  file_path         text,                    -- storage path in `csv-imports` (null if store failed)
  file_name         text,                    -- original filename as uploaded
  file_size         integer,                 -- bytes
  -- what the packing list is for (from the parse)
  container_no      text,                    -- parsed container (e.g. GZS260703-1)
  container_code    text,                    -- secondary container code from the sheet
  transport_hint    text,                    -- 'SEA' | 'EK' | null
  -- parsed totals (for the history row summary — no re-parse needed)
  row_count         integer   default 0,     -- number of aggregated base-tracking rows
  tracking_count    integer,                 -- from the packing-list totals header
  total_weight      numeric(14,3),
  total_cbm         numeric(14,6),
  -- the full preview snapshot (rows + rawGrid + totals) → re-preview instantly
  parsed_snapshot   jsonb     not null default '{}'::jsonb,
  -- reverse-check: trackings present in the packing list but MISSING from the
  -- MOMO API staging (momo_import_tracks) — {missing:[...], present:N, checked:N}
  reverse_check     jsonb     not null default '{}'::jsonb,
  -- audit
  uploaded_by       text,                    -- adminId (string form, ≤20)
  uploaded_at       timestamptz not null default now(),
  applied_at        timestamptz,             -- stamped if this upload was later applied
  status            text      not null default 'uploaded'  -- 'uploaded' | 'applied'
);

comment on table public.momo_packing_upload is
  'History of MOMO packing-list .xlsx uploads: original file + parsed snapshot + reverse-check (packing-vs-API-staging). Reference/audit only — no money, no tb_forwarder write.';

-- history queries: newest-first, and per-container lookup
create index if not exists momo_packing_upload_uploaded_idx
  on public.momo_packing_upload (uploaded_at desc);
create index if not exists momo_packing_upload_container_idx
  on public.momo_packing_upload (container_no, uploaded_at desc)
  where container_no is not null;

-- Service-role only (mirrors momo_import_tracks · 0116). No RLS policy = deny to
-- anon/authenticated; the admin service-role client bypasses RLS.
alter table public.momo_packing_upload enable row level security;

-- ════════════════════════════════════════════════════════════
-- Verify (SQL editor after apply):
--   SELECT id, container_no, row_count, status, uploaded_at
--     FROM momo_packing_upload ORDER BY uploaded_at DESC LIMIT 20;
-- ════════════════════════════════════════════════════════════
