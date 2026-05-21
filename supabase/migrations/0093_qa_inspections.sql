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
