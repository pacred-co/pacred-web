-- ════════════════════════════════════════════════════════════
-- 0245 · container_packing_reconcile — per-container MOMO packing-list stamp
-- ════════════════════════════════════════════════════════════
-- Owner (2026-07-08 · combo-flow continuity G1): the ตรวจตู้→บิล→เสร็จ flow must not
-- let a bill go out on a container whose กล่อง/น้ำหนัก (the CBM/weight basis that drives
-- the SELL price) has NOT been reconciled against the MOMO packing list yet. The
-- packing-upload tool (applyMomoPacking) already writes the reconciled basis onto
-- tb_forwarder; this table records WHICH container was reconciled so the billing-run
-- gate can refuse (acknowledgeably) an un-reconciled container, and the ตรวจตู้ /
-- forwarder-check lists can badge "ยังไม่อัพ packing".
--
-- WHAT THIS IS:
--   A per-container REFERENCE stamp. One row per real container_no. Written ONLY by
--   applyMomoPacking (the packing-upload apply step · idempotent upsert on container_no).
--
-- WHAT THIS IS NOT:
--   - NOT a money table. NO FK to tb_forwarder / tb_forwarder_invoice / any billing /
--     wallet / price table (mirrors the taem_packing_line + taem_container_etd_eta
--     isolation rule · §0e). The counters here (rows_updated/boxes_short/advanced/
--     tracking_count) are audit metadata from the apply run — they feed NO pricing math.
--   - NOT a hard block. The billing-run gate reads this and REFUSES an un-reconciled
--     container only until the admin ticks the "ยืนยันออกบิลทั้งที่ยังไม่ reconcile"
--     acknowledgment (grandfathers pre-feature containers with no stamp).
--
-- Additive + idempotent (create … if not exists). Safe to re-run. Next free = 0246.
-- DO NOT apply here — the integrator (เดฟ) applies migrations to prod+dev.
-- ════════════════════════════════════════════════════════════

create table if not exists public.container_packing_reconcile (
  -- The REAL container code the packing list was for (GZS…/GZE…/EK…) — the same
  -- value applyMomoPacking writes onto tb_forwarder.fcabinetnumber, so the billing
  -- gate + list badges key on fcabinetnumber and match.
  container_no    text primary key
    constraint container_packing_reconcile_container_no_nonblank
      check (btrim(container_no) <> ''),
  reconciled_at   timestamptz not null default now(),
  reconciled_by   varchar(20),          -- legacy admin id who ran the apply (audit)
  rows_updated    integer,              -- basis writes in that apply run
  boxes_short     integer,              -- of those, how many were box-short under-counts
  advanced        integer,              -- sibling rows moved 1/2 → 3
  tracking_count  integer,              -- packing-list tracking count (reference)
  source          text default 'momo_packing'
);

alter table public.container_packing_reconcile enable row level security;

-- Admin read-only via authenticated (service_role bypasses RLS for the apply-step
-- upsert and the admin-client reads). No insert/update/delete policy for non-service
-- roles → the only writer is the service-role applyMomoPacking (mirrors taem_packing_line).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'container_packing_reconcile'
      and policyname = 'container_packing_reconcile_admin_read'
  ) then
    create policy container_packing_reconcile_admin_read
      on public.container_packing_reconcile
      for select
      to authenticated
      using (public.is_admin());
  end if;
end $$;

comment on table public.container_packing_reconcile is
  'Per-container MOMO packing-list reconcile stamp (combo-flow G1 · 2026-07-08). One row per real container_no, written ONLY by applyMomoPacking (idempotent upsert). The billing-run gate reads it to refuse (acknowledgeably) an un-reconciled container; ตรวจตู้ / forwarder-check badge it. NO FK to money tables (§0e isolation).';
comment on column public.container_packing_reconcile.container_no is
  'Real container code (GZS…/GZE…/EK…) = tb_forwarder.fcabinetnumber written by applyMomoPacking. The billing gate + badges key on this.';
comment on column public.container_packing_reconcile.rows_updated is 'Basis writes in the apply run that produced this stamp (audit metadata · feeds no pricing).';
