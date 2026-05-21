-- =====================================================================
-- Pacred — Pending migrations bundle (2026-05-21)
-- =====================================================================
-- 4 migrations queued for prod project yzljakczhwrpbxflnmco. Paste
-- this entire file ONCE into Supabase SQL editor (instead of pasting
-- 4 files separately).
--
-- Order:
--   0090 — DROP retired spine tables (cargo_containers + shipments + sacks)
--          Safe: 0 rows on prod (ภูม-verified) · all 14 consumers rewritten
--          to read tb_forwarder (Wave 3D cleanup commit 008e127 + a4cec6c).
--   0091 — ALTER admins.role CHECK to allow 16 new role values
--          (sales · qa · 13 freight_*). Additive · no data change.
--   0092 — Forwarder cost-reconfirm gate. Adds pending_reconfirm status
--          enum value + 5 columns + 1 RLS policy + seeds 1
--          business_config row (threshold 10%).
--   0093 — qa_inspections table + RLS for the rebuilt QA module.
--
-- All migrations are ADDITIVE or DROP-OF-EMPTY-TABLES. No data loss.
-- Idempotent: re-running is safe (uses IF NOT EXISTS / IF EXISTS).
--
-- Run procedure:
--   1. Open Supabase Dashboard → project yzljakczhwrpbxflnmco
--   2. SQL Editor → New query → paste this entire file → Run
--   3. Verify: SELECT migration_view in Database / Migrations
--
-- Rollback: each migration block has its own IF EXISTS guards. To undo
--   the DROP in 0090, restore from a Supabase snapshot.
-- =====================================================================

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0090_drop_spine_tables.sql                                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- 0090_drop_spine_tables.sql
--
-- D1 Option A — drop the pre-D1 "spine" tables (cargo_containers /
-- cargo_shipments / cargo_sacks) added by migrations 0033 + 0068.
--
-- Context: on 2026-05-20 ค่ำ ภูม audited /admin/warehouse/containers
-- (the spine page) against legacy member/pcs-admin/report-cnt.php
-- (2487 LOC). The spine model diverged completely from legacy:
-- different status enum, no 11-button audit menu, no money columns,
-- no ทำรายการจ่ายเงินตู้ flow. Per Option A (พี่เดฟ-confirmed:
-- "just match what พี่ป๊อป wants"), the canonical container list
-- moved to /admin/report-cnt reading tb_forwarder directly, and the
-- scan flow moved to /admin/barcode/* (faithful port of the legacy
-- barcode-c-*.php / barcode-d-*.php / gateway.php trio).
--
-- ภูม verified Supabase prod: cargo_containers, cargo_shipments,
-- cargo_sacks were EMPTY. No production data lost.
--
-- ────────────────────────────────────────────────────────────────────
-- 2026-05-21 — Wave 3D cleanup COMPLETE. Drop activated. ✅
-- ────────────────────────────────────────────────────────────────────
-- Agent Z rewrote all 14 cargo_* consumers (read tb_forwarder directly
-- now); residual mentions of cargo_containers/shipments/sacks are
-- JSDoc-only / history comments — verified by:
--   grep -rln "cargo_containers\|cargo_shipments\|cargo_sacks" \
--     --include="*.ts" --include="*.tsx" | grep -v lib/warehouse \
--     | xargs grep -v "//\|^\s*\*"  →  0 code lines
--
-- Safe to apply: cascading drop cleans up indexes + FKs from migrations
-- 0033/0068. The legacy tb_forwarder.fcabinetnumber is now the single
-- source of truth for container groupings.
--
-- See docs/runbook/faithful-port-plan.md for the full Option A
-- decision record + Wave 2/3 agent split.

-- Drop in dependency order: shipments + sacks reference containers
-- via FK; drop them first, then containers.
DROP TABLE IF EXISTS public.cargo_shipments CASCADE;
DROP TABLE IF EXISTS public.cargo_sacks CASCADE;
DROP TABLE IF EXISTS public.cargo_containers CASCADE;

-- Also drop the pre-spine container table from migration 0016
-- (the very first "phase H" container model — superseded by the
-- spine in 0033 and now itself retired). 0059 unified them onto
-- cargo_containers; drop the union shim too if it survives.
DROP TABLE IF EXISTS public.containers CASCADE;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0091_admin_role_freight_expansion.sql                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0091 — admins.role enum expansion · Freight roles + sales/qa
-- ════════════════════════════════════════════════════════════
-- Migration author: Agent ZZ (2026-05-20 ค่ำ · per ภูม brief
--   "port เลย ยึดตาม Owner ก่อน · แก้อะไรก็ให้แจ้ง พี่เดฟไว้ด้วย").
--
-- Companion to: lib/auth/require-admin.ts (TypeScript enum extension)
--               lib/admin/sidebar-menu.ts  (per-role menu definitions)
--
-- ─── What this migration does ─────────────────────────────────
-- Extends the `admins_role_check` CHECK constraint to accept the
-- new role keys added in the AdminRole enum. Migration 0015 created
-- the constraint with 4 roles; migrations 0033 + 0054 expanded it to 7.
-- This migration brings it to the full legacy PCS Cargo coverage:
--
--   ── before (after 0054) ──
--   super | ops | accounting | sales_admin | warehouse | driver | interpreter
--
--   ── after (this migration) ──
--   super | ops | accounting
--   | sales_admin   — Cargo Sales Manager  (legacy doc role #29)
--   | sales         — Cargo Sales Staff     (legacy doc role #30) ← NEW
--   | qa            — QA & QC staff         (legacy doc role #5)  ← NEW
--   | warehouse | driver | interpreter
--   | freight_sales_manager          (#16)  ← NEW
--   | freight_sales                  (#17)  ← NEW
--   | freight_export_manager         (#18)  ← NEW
--   | freight_export_cs              (#19)  ← NEW
--   | freight_export_doc             (#20)  ← NEW
--   | freight_export_clearance       (#21)  ← NEW
--   | freight_clearance_both         (#22)  ← NEW   (Import & Export · shared PHP file)
--   | freight_export_messenger       (#23)  ← NEW
--   | freight_import_manager         (#24)  ← NEW
--   | freight_import_cs              (#25)  ← NEW
--   | freight_import_doc             (#26)  ← NEW
--   | freight_import_clearance       (#27)  ← NEW
--   | freight_import_messenger       (#28)  ← NEW
--
-- ─── Why split `sales_admin` vs `sales` ───────────────────────
-- Legacy doc lines 780-788 (Cargo Sales Manager) and 792-870 (Cargo
-- Sales) describe two DISTINCT roles. The Manager file says:
--   "ไฟล์ว่าง — ใช้เมนูเหมือน Sales แต่มีสิทธิ์อนุมัติเพิ่ม"
--   (empty file — same menu as Sales but with extra approval rights)
-- Pacred's prior `sales_admin` fused Sales-Manager + Sales-Staff +
-- Sales-All under one bucket. We restore the legacy Mgr/Staff split:
--   - `sales_admin` (existing key, KEPT) = Cargo Sales MANAGER
--   - `sales`       (NEW key)            = Cargo Sales STAFF
-- The KEY NAMES stay backwards-compatible — every existing row in
-- `admins` keeps its `sales_admin` role (Manager tier). New hires
-- assigned only the staff seat get `sales`.
--
-- ─── Why add `qa` ─────────────────────────────────────────────
-- Legacy doc role #5 (QA & QC, lines 358-382) has 12 SLA-breach
-- queues + a sales-rep transfer tool. Pacred today exposes those
-- queues as the single Phase-2 leaf `itemQAAll`, visible only to
-- `super`. A dedicated QA staffer cannot login without `super`
-- (massive over-privilege). The `qa` role fixes this gap.
--
-- ─── Why add 13 Freight roles ─────────────────────────────────
-- Legacy CompanyType 2 (`Freight`) has 13 distinct PHP role files
-- (doc lines 588-772). The Freight side of the platform exists in
-- Pacred (forwarder-import dropdown has `freight` segments,
-- accounting block has a `freight` leaf) but no Freight-role users
-- can be assigned. This migration unblocks role assignment.
--
-- IMPORTANT: the menu CONTENT for these 13 roles is currently
-- STUBBED in `lib/admin/sidebar-menu.ts` because the legacy doc
-- enumerates only role NAMES + section headers — never the actual
-- per-role item trees ("[Full Export Operations Access]" placeholder).
-- Per ภูม "ห้ามเดา" rule, the stubs carry a TODO comment asking
-- พี่เดฟ to extend the doc with the per-Freight-role menu trees
-- (legacy `Freight/SalesManager.php` etc. are the ground truth).
--
-- ─── Idempotent · safe to re-run ──────────────────────────────
-- Uses `drop constraint if exists` before re-adding. Existing rows
-- in `admins` keep their values; no data migration required.

alter table public.admins drop constraint if exists admins_role_check;

alter table public.admins add  constraint admins_role_check
  check (role in (
    -- CargoAndFreight / Cargo (existing + 2 new)
    'super','ops','accounting',
    'sales_admin',          -- Cargo Sales Manager (#29) — Mgr tier, approval
    'sales',                -- Cargo Sales Staff   (#30) — Staff tier        ← NEW
    'qa',                   -- QA & QC staff       (#5)                       ← NEW
    'warehouse','driver','interpreter',
    -- Freight (13 new)
    'freight_sales_manager',     -- #16
    'freight_sales',             -- #17
    'freight_export_manager',    -- #18
    'freight_export_cs',         -- #19
    'freight_export_doc',        -- #20
    'freight_export_clearance',  -- #21
    'freight_clearance_both',    -- #22 — shared PHP file (Import & Export)
    'freight_export_messenger',  -- #23
    'freight_import_manager',    -- #24
    'freight_import_cs',         -- #25
    'freight_import_doc',        -- #26
    'freight_import_clearance',  -- #27
    'freight_import_messenger'   -- #28
  ));

comment on constraint admins_role_check on public.admins is
  '2026-05-20 (mig 0091): full legacy PCS Cargo role coverage — '
  '7 Cargo/super/ops roles + 13 Freight roles + qa + sales(Staff). '
  'Mgr-tier roles (sales_admin, freight_*_manager, warehouse Mgr) hold '
  'approval rights distinct from their Staff counterparts.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0092_forwarder_reconfirm_gate.sql                              ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0092 · Forwarder >10%-over-preview customer RE-CONFIRM gate
-- ════════════════════════════════════════════════════════════
-- Source:
--   docs/audit/pcs-business-flow-2026-05-20.md §3 (Priority 2 — 🔴)
--   BUSINESS_FLOW.md L85-87 (verbatim ops rule):
--     "[ถ้าราคาเพิ่มเกิน 10%] แจ้งลูกค้ายืนยัน"
--
-- ── The hole ────────────────────────────────────────────────
-- Pacred bills silently whenever admin adds a forwarder_cost_adjustments
-- row (0038) — surprise-billing the customer wallet without consent.
-- Per the legacy PCS rule, when ACTUAL forwarding cost (preview total +
-- cumulative adjustments) exceeds the PREVIEW total by >10%, the system
-- MUST pause the bill and force the customer to RE-CONFIRM before
-- debiting. This is the H6 hand-off in pcs-business-flow §4.
--
-- ── This migration ──────────────────────────────────────────
-- Additive extension of `forwarder_cost_adjustments` (0038):
--
--   1) status check now includes 'pending_reconfirm' — the new gated
--      state between 'unpaid' and 'paid'. Admin still inserts as 'unpaid'
--      by default; the application layer flips to 'pending_reconfirm'
--      atomically when the >10% gate trips. Customer decision moves
--      'pending_reconfirm' → 'unpaid' (accept → admin can then mark paid)
--      or stays 'pending_reconfirm' until ops opens a work_item dispute.
--
--   2) 5 new columns capture the gate context + customer decision:
--        preview_total_thb       — the forwarders.total_price snapshot
--                                  AT the time the gate fired (NOT a
--                                  live join — must survive a later
--                                  admin price_update)
--        cumulative_after_thb    — preview + all paid/unpaid/pending
--                                  adjustments after this row (the
--                                  "actual" the customer must accept)
--        reconfirm_required_at   — timestamp the gate fired
--        customer_decision       — null | 'accept' | 'dispute'
--                                  (when set, the customer has decided)
--        customer_decision_at    — timestamp the customer pressed
--
--   3) RLS — extend the existing customer-self-read policy with a
--      narrow UPDATE policy: customer may flip THEIR OWN row from
--      status='pending_reconfirm' → 'unpaid' (accept) only AND only
--      after setting customer_decision='accept' + decision_at. The
--      'dispute' decision goes through a Server Action (creates a
--      work_item + leaves the adjustment pending) so the customer's
--      direct write surface is minimised. NOTE: the customer write
--      path actually uses createAdminClient + assertOwnsRecord per
--      the W-1/S-2 pattern (see actions/forwarder.ts), so the RLS
--      UPDATE policy is defence-in-depth — not the primary gate.
--
--   4) business_config seed: `forwarder.reprice_threshold_pct` = 10
--      (admin can tune via /admin/settings/business-config without
--      a redeploy — same pattern as 0076's other admin constants).
--
-- ── Idempotent ──────────────────────────────────────────────
-- The whole file is re-runnable: ALTER ... DROP CONSTRAINT IF EXISTS;
-- ADD CONSTRAINT; ADD COLUMN IF NOT EXISTS; CREATE POLICY DROP-then-
-- CREATE; INSERT ... ON CONFLICT DO NOTHING.
-- ════════════════════════════════════════════════════════════

-- 1) Extend status enum: add 'pending_reconfirm' between 'unpaid' and
--    'paid'. Drop the old CHECK, recreate with the 4-value set.
alter table public.forwarder_cost_adjustments
  drop constraint if exists forwarder_cost_adjustments_status_check;

alter table public.forwarder_cost_adjustments
  add constraint forwarder_cost_adjustments_status_check
  check (status in ('unpaid','pending_reconfirm','paid','cancelled'));

comment on column public.forwarder_cost_adjustments.status is
  '0038 + 0092 — unpaid (default new) | pending_reconfirm (>10% gate triggered, waiting on customer) | paid (wallet debited) | cancelled. Customer decides via /service-import/[fNo]: accept → flip to unpaid (admin then bills); dispute → stays pending_reconfirm + ops work_item created.';

-- 2) Gate context columns (all nullable — only populated when the gate
--    fires; pre-existing rows stay all-NULL which is correct).
alter table public.forwarder_cost_adjustments
  add column if not exists preview_total_thb     numeric(12,2);
alter table public.forwarder_cost_adjustments
  add column if not exists cumulative_after_thb  numeric(12,2);
alter table public.forwarder_cost_adjustments
  add column if not exists reconfirm_required_at timestamptz;
alter table public.forwarder_cost_adjustments
  add column if not exists customer_decision     text;
alter table public.forwarder_cost_adjustments
  add column if not exists customer_decision_at  timestamptz;

comment on column public.forwarder_cost_adjustments.preview_total_thb is
  '0092 — snapshot of forwarders.total_price AT the moment the >10% reconfirm gate fired. NOT a live join — survives later admin price_update edits so the customer always sees the same "ราคาประเมินตอนสั่ง" they would expect.';
comment on column public.forwarder_cost_adjustments.cumulative_after_thb is
  '0092 — preview_total_thb + SUM(all non-cancelled adjustments up to AND INCLUDING this one). This is the "ราคาจริง" number shown to the customer.';
comment on column public.forwarder_cost_adjustments.reconfirm_required_at is
  '0092 — timestamp the >10% gate fired and put this row into pending_reconfirm.';
comment on column public.forwarder_cost_adjustments.customer_decision is
  '0092 — null while waiting | ''accept'' (customer approved billing — flips status to unpaid) | ''dispute'' (customer wants review — work_item opened for ops, row stays pending_reconfirm).';
comment on column public.forwarder_cost_adjustments.customer_decision_at is
  '0092 — timestamp the customer pressed accept or dispute.';

-- 3) Defensive check: customer_decision values + symmetry with timestamp
alter table public.forwarder_cost_adjustments
  drop constraint if exists fwd_cost_adj_decision_check;
alter table public.forwarder_cost_adjustments
  add constraint fwd_cost_adj_decision_check check (
    customer_decision is null
    or customer_decision in ('accept','dispute')
  );

alter table public.forwarder_cost_adjustments
  drop constraint if exists fwd_cost_adj_decision_timestamp_check;
alter table public.forwarder_cost_adjustments
  add constraint fwd_cost_adj_decision_timestamp_check check (
    (customer_decision is null and customer_decision_at is null)
    or (customer_decision is not null and customer_decision_at is not null)
  );

-- 4) Index to find pending_reconfirm rows fast on the customer detail
--    page (per-forwarder query) and on a future ops "stuck reconfirms"
--    dashboard (status partial index).
create index if not exists fwd_cost_adj_pending_reconfirm_idx
  on public.forwarder_cost_adjustments(forwarder_id, status)
  where status = 'pending_reconfirm';

-- 5) RLS — narrow customer UPDATE for the accept path (defence in depth;
--    the Server Action is the primary gate). Customer may update their
--    own row, but ONLY:
--     - when current status='pending_reconfirm'
--     - flipping it to status='unpaid' (accept) and stamping the decision
--     - touching only the customer_decision + decision_at + status fields
--   The "touch only" part is enforced at the action layer; RLS only
--   restricts WHO and WHICH ROWS.
drop policy if exists fwd_cost_adj_customer_decide on public.forwarder_cost_adjustments;
create policy fwd_cost_adj_customer_decide
  on public.forwarder_cost_adjustments for update
  using      (profile_id = auth.uid() and status = 'pending_reconfirm')
  with check (profile_id = auth.uid() and status in ('pending_reconfirm','unpaid'));

-- 6) Seed the tunable threshold in business_config (admin can change via
--    /admin/settings/business-config — 0076). 10% per BUSINESS_FLOW.md L85.
--    Idempotent — ON CONFLICT DO NOTHING leaves any admin-tuned value alone.
insert into public.business_config (key, value, value_type, category, description)
values (
  'forwarder.reprice_threshold_pct',
  to_jsonb(10),
  'percent',
  'forwarder',
  'Percent over preview total at which the actual cost forces a customer re-confirm (BUSINESS_FLOW.md L85 — legacy PCS rule). Default 10. Set to a higher number to relax the gate during a sprint; do not set below 5 or staff will be re-confirming every adjustment.'
)
on conflict (key) do nothing;

-- 7) Verify
do $$
declare
  status_check_def text;
  policy_count    int;
begin
  -- Status enum was extended
  select pg_get_constraintdef(c.oid) into status_check_def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'forwarder_cost_adjustments'
      and c.conname = 'forwarder_cost_adjustments_status_check';
  if status_check_def is null
     or position('pending_reconfirm' in status_check_def) = 0 then
    raise warning '0092 — status check did not extend with pending_reconfirm: %', status_check_def;
  else
    raise notice '0092 — status check extended OK: %', status_check_def;
  end if;

  -- Customer UPDATE policy installed
  select count(*) into policy_count
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'forwarder_cost_adjustments'
      and policyname = 'fwd_cost_adj_customer_decide';
  if policy_count <> 1 then
    raise warning '0092 — customer decide policy expected 1, found %', policy_count;
  else
    raise notice '0092 — customer decide RLS policy installed';
  end if;
end $$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0093_qa_inspections.sql                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- 0093_qa_inspections.sql
--
-- P0 #2 — QA inspection module rebuild on tb_forwarder spine.
--
-- Context: legacy table `freight_qa_inspections` (migration 0045) FK'd the
-- retired `cargo_shipments` spine; under D1 Option A (Wave 3D cleanup,
-- 2026-05-20 ค่ำ) the spine was dropped (0090). The legacy table either
-- broke FK or was never applied to prod — either way it cannot key the
-- QA workflow under faithful-port D1.
--
-- This migration introduces a brand-new `qa_inspections` table keyed by
-- `tb_forwarder.id (bigint)` — the actual living import-job table.
-- The verdict enum matches PCS_Cargo_Guidebook_TH.md L441-454 ("ของปลอม
-- → ห้ามส่งต่อ + Blacklist ร้านค้า"):
--   pass         — ตรวจผ่าน (สีถูก ไซส์ถูก ของแท้)
--   fail         — ตรวจไม่ผ่าน (สี/ไซส์ผิด · เสียหาย)
--   hold         — กักไว้รอลูกค้าตัดสินใจ (refund/replacement)
--   fake_product — สินค้าปลอม · ห้ามส่งต่อ
--
-- The QA gate stops fake-product shipments from being delivered to
-- customers (without it, fake-product incidents have no system support
-- → reputational + legal risk per Audit Z).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

-- 1) qa_inspections -------------------------------------------------
create table if not exists public.qa_inspections (
  id                  uuid primary key default gen_random_uuid(),

  -- The import job being inspected (tb_forwarder.id is bigint — see 0081 L1599).
  forwarder_id        bigint not null references public.tb_forwarder(id) on delete restrict,

  -- Who recorded the inspection (Pacred auth.uid via profiles).
  inspector_admin_id  uuid not null references public.profiles(id),

  inspected_at        timestamptz not null default now(),

  -- Verdict — matches PCS guidebook L451-454.
  --   pass         = ผ่าน (ส่งต่อได้)
  --   fail         = ตก (สี/ไซส์ผิด · ต้องคุยลูกค้า/supplier)
  --   hold         = กักไว้ (รอลูกค้าตัดสินใจ refund/replacement)
  --   fake_product = ของปลอม · ห้ามส่งต่อ · Blacklist
  verdict             text not null check (verdict in ('pass','fail','hold','fake_product')),

  notes               text,
  -- Storage paths in bucket 'member-docs' under qa-inspections/<id>/<file>.
  photo_urls          text[] not null default '{}',

  -- Set true when verdict='fake_product' → flag shop as blacklisted.
  -- (Shop integration is STUBBED — see comment below — until tb_shop exists.)
  blacklist_shop      boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A fake-product verdict implies blacklist_shop must be true
  -- (Guidebook L451-454 — "ของปลอม → Blacklist ร้านค้า"). The reverse
  -- is not required (admin may choose to blacklist on other grounds).
  constraint qa_inspections_fake_implies_blacklist check (
    verdict <> 'fake_product' or blacklist_shop = true
  )
);

-- Lookup indexes ----------------------------------------------------
create index if not exists qa_inspections_forwarder_idx
  on public.qa_inspections(forwarder_id);
create index if not exists qa_inspections_verdict_idx
  on public.qa_inspections(verdict);
create index if not exists qa_inspections_inspected_at_idx
  on public.qa_inspections(inspected_at desc);
create index if not exists qa_inspections_blacklist_idx
  on public.qa_inspections(blacklist_shop)
  where blacklist_shop = true;

-- updated_at auto-touch (uses existing set_updated_at() helper).
drop trigger if exists qa_inspections_updated_at_trigger on public.qa_inspections;
create trigger qa_inspections_updated_at_trigger
  before update on public.qa_inspections
  for each row execute function public.set_updated_at();

-- 2) RLS ------------------------------------------------------------
alter table public.qa_inspections enable row level security;

-- Admin (super/ops/warehouse/qa) full access.
drop policy if exists qa_inspections_admin_all on public.qa_inspections;
create policy qa_inspections_admin_all
  on public.qa_inspections for all
  using      (public.is_admin(array['super','ops','warehouse','qa']))
  with check (public.is_admin(array['super','ops','warehouse','qa']));

-- Customer reads OWN inspections (via tb_forwarder.userid → profiles.member_code).
-- legacy_account_link.member_code joins auth.uid() to the legacy varchar(10) userid.
-- Use a defensive SELECT: customer sees their inspection rows.
drop policy if exists qa_inspections_customer_read on public.qa_inspections;
create policy qa_inspections_customer_read
  on public.qa_inspections for select
  using (
    exists (
      select 1
        from public.tb_forwarder f
        join public.profiles      p on p.member_code = f.userid
       where f.id = qa_inspections.forwarder_id
         and p.id = auth.uid()
    )
  );

-- 3) Storage — reuse existing 'member-docs' bucket -----------------
-- Path layout: qa-inspections/{inspection_id}/photo-N.{ext}
--
-- The 'member-docs' bucket already exists from launch-era migrations
-- (private; profile-owned). All inserts go through service_role inside
-- actions/admin/qa-inspections.ts; we add only a READ policy so admins +
-- the owning customer can see photo URLs.

-- Admin (super/ops/warehouse/qa) reads any QA photo.
drop policy if exists "qa_inspection_photos_admin_read" on storage.objects;
create policy "qa_inspection_photos_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'member-docs'
    and (storage.foldername(name))[1] = 'qa-inspections'
    and public.is_admin(array['super','ops','warehouse','qa'])
  );

-- Customer reads photos under their own owned inspection folder.
-- Path segment [2] = inspection_id; we join through qa_inspections → tb_forwarder.
drop policy if exists "qa_inspection_photos_customer_read" on storage.objects;
create policy "qa_inspection_photos_customer_read"
  on storage.objects for select
  using (
    bucket_id = 'member-docs'
    and (storage.foldername(name))[1] = 'qa-inspections'
    and exists (
      select 1
        from public.qa_inspections qi
        join public.tb_forwarder   f  on f.id = qi.forwarder_id
        join public.profiles       p  on p.member_code = f.userid
       where qi.id::text = (storage.foldername(name))[2]
         and p.id = auth.uid()
    )
  );

-- 4) Comments -------------------------------------------------------
comment on table public.qa_inspections is
  'P0 #2 — QA/QC inspection per arrived tb_forwarder import job. Replaces freight_qa_inspections (FK''d retired cargo_shipments spine). Verdict enum + blacklist flag per PCS_Cargo_Guidebook_TH.md L441-454.';
comment on column public.qa_inspections.verdict is
  'pass | fail | hold | fake_product. fake_product implies blacklist_shop=true (DB CHECK).';
comment on column public.qa_inspections.blacklist_shop is
  'When true, the shop linked to this forwarder should be flagged. Shop-link integration is STUBBED in actions/admin/qa-inspections.ts (no tb_shop table exists in 0081; tb_shop_pay_h is shop-payouts, not a shop catalogue). TODO ภูม: when shop catalogue arrives, wire blacklist propagation.';
comment on column public.qa_inspections.photo_urls is
  'Array of Storage paths in bucket member-docs. Each path = qa-inspections/{inspection_id}/photo-N.{ext}.';


