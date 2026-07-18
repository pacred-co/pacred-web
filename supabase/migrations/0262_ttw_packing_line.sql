-- ════════════════════════════════════════════════════════════
-- 0262 · ttw_packing_line — per-tracking TTW/อี้อู (Yiwu) packing-list STAGING store
-- ════════════════════════════════════════════════════════════
-- Owner (2026-07-18): *"ไฟล์ excel ที่ส่งให้ คือ แพคกิ้งลิสจากทางโกดัง อี้อู … ถ้ามา
--   จากทาง อี้อู ตอนนี้เราใช้ TTW ไม่ใช่ MOMO … เอาแทรคกิ้งและ data เข้าระบบไปก่อน ·
--   อันไหนยังไม่เจอ PR เดี๋ยวไปกรุ๊ปรวมกันในระบบ · ให้ CS มาช่วยกันใส่ PR เอาใบส่งของ
--   มาจับคู่"*.
--
-- WHAT THIS IS:
--   A STAGING/REFERENCE table for the TTW-freight / อี้อู-warehouse packing lists.
--   The warehouse's own tracking = 单号 (X-numbers · e.g. X9002777), NOT a Pacred
--   tb_forwarder.ftrackingchn — so these rows have NO customer/PR yet (会员 = "YY").
--   CS matches the shipping mark (唛头 · e.g. MG/TOOL/SEA · sometimes literally
--   PR032/SEA) → a real PR via the delivery notes, THEN the row can be committed to
--   a billable tb_forwarder row (stamped fwarehousename='9' TTW · fwarehousechina='2'
--   อี้อู). Mirror of the MOMO staging→commit pattern (momo_import_tracks).
--
--   One row per (container, base tracking). A 单号 can span several box-detail rows
--   in the file with different dims; the Yiwu parser (lib/admin/yiwu-packing-xlsx-
--   parser.ts) aggregates them to the base tracking (boxes/wt/cbm = the warehouse's
--   own footer grand-total · proven Σ-matches the file footer) — so a multi-box
--   shipment is stored ONCE.
--
-- WHAT THIS IS NOT:
--   - NOT a money table. NO FK to tb_forwarder / any billing/wallet table (§0e
--     isolation · mirrors taem_packing_line / momo_import_tracks). committed_forwarder_id
--     is a soft link (bigint, no FK) set only when CS commits the row to a billable row.
--   - NOT a write into the SELL/price flow. Nothing here feeds a customer price until
--     CS assigns a PR + commits (a separate, gated, audited path).
--   - Writers: scripts/ingest-ttw-packing-2026-07-18.ts (idempotent upsert on the
--     UNIQUE key · never clobbers a CS-assigned member_code or a committed row) + the
--     CS assign/commit action (member_code / committed_* only). Admin reads via the
--     service-role admin client.
--
-- Additive + idempotent (create … if not exists). Safe to re-run. Next free = 0263.
-- DO NOT apply here — the integrator (เดฟ) applies migrations to prod+dev.
-- ════════════════════════════════════════════════════════════

create table if not exists public.ttw_packing_line (
  id             uuid primary key default gen_random_uuid(),
  -- The CONTAINER = the packing-list FILENAME (= the eventual fcabinetnumber),
  -- e.g. GZS260614-1T … YWS260717-8T. The "-NT" suffix = the Nth TTW container
  -- (owner: "6T = ตู้ที่ 6 ของ TTW"). NOTE: the parser's in-cell container guess is
  -- unreliable (grabs an internal YWYY/GZYY packing serial) → the ingest uses the
  -- FILENAME here.
  container_no   text not null,
  -- 单号 (the warehouse tracking · X-numbers). NOT a tb_forwarder.ftrackingchn.
  base_tracking  text not null,
  shipping_mark  text,            -- 唛头 (customer mark · MG/TOOL/SEA · sometimes PR###/SEA).
  member_code    text,            -- 会员 → the matched PR. null until CS (or a PR### mark) assigns it.
  pr_source      text,            -- 'mark' (auto from a PR### 唛头) · 'cs' (CS-assigned) · null.
  warehouse      text not null default 'TTW',   -- freight OPERATOR (→ tb_forwarder.fwarehousename '9').
  origin         text not null default 'อี้อู',  -- origin CITY (→ tb_forwarder.fwarehousechina '2').
  transport_mode text,            -- '1' รถ · '2' เรือ · '3' อากาศ (from the container code · YWS/GZS = เรือ).
  boxes          integer,         -- 件数 (aggregated to the warehouse footer total).
  weight_kg      numeric(14,3),   -- 总重量 (kg).
  cbm            numeric(14,6),   -- 材积 (m³ · 6dp · matches 0192).
  product_name   text,            -- 品名/英文.
  item_type      text,            -- 类别+材质 (reference).
  sm_date        text,            -- 日期 (as written in the file).
  -- Soft link (NO FK · §0e isolation) to the billable row once CS commits it.
  committed_forwarder_id bigint,
  committed_at   timestamptz,
  committed_by   text,
  source_file    text,            -- the xlsx filename this row was ingested from.
  ingested_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Idempotent upsert key: re-ingesting a container updates its base rows in place.
  constraint ttw_packing_line_container_base_uniq unique (container_no, base_tracking)
);

create index if not exists ttw_packing_line_container_idx  on public.ttw_packing_line (container_no);
create index if not exists ttw_packing_line_member_idx     on public.ttw_packing_line (member_code);
create index if not exists ttw_packing_line_uncommitted_idx on public.ttw_packing_line (committed_forwarder_id) where committed_forwarder_id is null;

alter table public.ttw_packing_line enable row level security;

-- Admin read-only via authenticated (service_role bypasses RLS for the ingest write
-- + the CS assign/commit + the admin-client reads). No insert/update/delete policy for
-- non-service roles → the only writers are the service-role ingest script + the gated
-- CS action (mirrors taem_packing_line / taem_container_etd_eta).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ttw_packing_line'
      and policyname = 'ttw_packing_line_admin_read'
  ) then
    create policy ttw_packing_line_admin_read
      on public.ttw_packing_line
      for select
      to authenticated
      using (public.is_admin());
  end if;
end $$;

comment on table public.ttw_packing_line is
  'Per-tracking TTW/อี้อู (Yiwu) packing-list STAGING store — de-duped to base tracking. Rows have no PR yet (会员=YY); CS matches the 唛头 mark → PR then commits to a billable tb_forwarder row (fwarehousename=9 TTW · fwarehousechina=2 อี้อู). NO FK to money tables (§0e isolation). Writers = scripts/ingest-ttw-packing-2026-07-18.ts + the gated CS assign/commit action. Created 2026-07-18.';
comment on column public.ttw_packing_line.container_no is 'Container = the packing-list FILENAME (= the eventual fcabinetnumber · e.g. GZS260614-1T / YWS260717-8T · -NT = the Nth TTW container).';
comment on column public.ttw_packing_line.base_tracking is 'The warehouse tracking (单号 · X-numbers). NOT a tb_forwarder.ftrackingchn.';
comment on column public.ttw_packing_line.member_code is 'The matched PR (会员). null until CS assigns it (or a PR### 唛头 auto-fills it).';
comment on column public.ttw_packing_line.committed_forwarder_id is 'Soft link (NO FK) to the billable tb_forwarder row once CS commits this staged line. null = still staged.';
