-- ════════════════════════════════════════════════════════════
-- P-19 · Admin CSV bulk import — staging table + storage bucket
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-19 (เดฟ assigned 2026-05-14): port the
-- legacy admin tools `import-excel.php` + `single-code-text-converter.php`.
--
-- Workflow:
--   1. Admin uploads CSV via /admin/csv-imports/upload — file goes to
--      Supabase Storage `csv-imports/<admin_uuid>/<timestamp>.csv` and
--      a row is created in csv_imports with status='uploaded'.
--   2. Admin opens detail → server parses with papaparse, captures
--      first 5 rows into preview_rows jsonb, status flips to 'previewed'.
--   3. Admin reviews preview → clicks "Import" → server parses full file
--      and inserts into target_table. status flips 'importing' → 'imported'
--      or 'failed' on error (error_message captured).
--
-- Start scope (per spec): target_table='forwarders' only — most common
-- use case. Future: extend CHECK to add other targets (cart_items,
-- yuan_payments, etc.).
--
-- DECISION (ภูม, per §6): migration number 0029 (spec wrote 0028
-- but 0028 was claimed by P-18 forwarder_driver this morning).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.csv_imports (
  id              uuid primary key default gen_random_uuid(),
  uploader_id     uuid not null references public.profiles(id) on delete restrict,
  filename        text not null,
  storage_path    text not null,                                       -- relative path in csv-imports bucket
  target_table    text not null check (target_table in ('forwarders')),
  status          text not null default 'uploaded'
                    check (status in ('uploaded','previewed','importing','imported','failed')),
  row_count       integer not null default 0,                          -- total parsed rows (excl header)
  imported_count  integer not null default 0,                          -- successfully written rows
  preview_rows    jsonb,                                               -- first ~5 rows for the preview UI
  error_message   text,
  size_bytes      integer,
  mime_type       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  imported_at     timestamptz
);

create index if not exists csv_imports_uploader_idx
  on public.csv_imports(uploader_id, created_at desc);
create index if not exists csv_imports_status_idx
  on public.csv_imports(status, created_at desc);

drop trigger if exists csv_imports_updated_at_trigger on public.csv_imports;
create trigger csv_imports_updated_at_trigger
  before update on public.csv_imports
  for each row execute function public.set_updated_at();

-- ── RLS — admin-only ──
alter table public.csv_imports enable row level security;

drop policy if exists csv_imports_admin_all on public.csv_imports;
create policy csv_imports_admin_all
  on public.csv_imports for all
  using (public.is_admin())
  with check (public.is_admin());

-- ════════════════════════════════════════════════════════════
-- Storage — 'csv-imports' bucket for CSV uploads
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('csv-imports', 'csv-imports', false)
on conflict (id) do nothing;

-- Admin-only access (any of the 4 admin roles via is_admin()).
-- Folder convention: <admin_uuid>/<timestamp>.csv — but since the
-- whole bucket is admin-gated we don't need per-folder enforcement.

drop policy if exists "csv_imports_admin_select" on storage.objects;
create policy "csv_imports_admin_select" on storage.objects
  for select using (bucket_id = 'csv-imports' and public.is_admin());

drop policy if exists "csv_imports_admin_insert" on storage.objects;
create policy "csv_imports_admin_insert" on storage.objects
  for insert with check (bucket_id = 'csv-imports' and public.is_admin());

drop policy if exists "csv_imports_admin_update" on storage.objects;
create policy "csv_imports_admin_update" on storage.objects
  for update using (bucket_id = 'csv-imports' and public.is_admin());

drop policy if exists "csv_imports_admin_delete" on storage.objects;
create policy "csv_imports_admin_delete" on storage.objects
  for delete using (bucket_id = 'csv-imports' and public.is_admin());

comment on table public.csv_imports is
  'Admin staging table for CSV bulk imports. Each row tracks one upload through upload→preview→import lifecycle. Mirror of legacy tb_csvimport.';
