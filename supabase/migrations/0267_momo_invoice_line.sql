-- ════════════════════════════════════════════════════════════
-- 0267 · momo_invoice_line — PROVENANCE for MOMO-billed container cost
-- ════════════════════════════════════════════════════════════
-- Owner (2026-07-21): *"MOMO เก็บเราเป็น tracking · จะมาคอยตัดทั้งตู้ว่าครบแล้วยังไง"* —
-- MOMO bills us PER TRACKING in rounds, but we pay/register per CONTAINER once. Today
-- `tb_forwarder.fcosttotalprice` cannot tell "MOMO really billed this via an invoice"
-- from "we estimated it (คิว × 2,500/4,700 default)": the invoice-ingest apply
-- (applyMomoInvoiceCost) writes the same column the backfill/heal scripts write. So the
-- question "ตู้นี้ MOMO บิลครบยัง" is unanswerable from data — it is answered here.
--
-- WHAT THIS IS:
--   An APPEND-ONLY provenance log. One row per applied MOMO invoice LINE — proof that a
--   real MOMO invoice billed one of our tb_forwarder rows. The ONLY writer is
--   applyMomoInvoiceCost (actions/admin/momo-invoice-ingest.ts), which INSERTs these
--   rows in the SAME operation it writes fcosttotalprice — a separate, additive write
--   that does NOT change any cost/amount.
--
-- WHAT THIS IS NOT:
--   - NOT a money table. NO FK to tb_forwarder / tb_cnt / any billing/wallet table
--     (mirrors the momo_* + taem_packing_line isolation rule · §0e). `fid` is a plain
--     bigint snapshot of tb_forwarder.id — a dangling fid never blocks anything.
--   - NOT a price/status input. Coverage (lib/admin/cabinet-billing-coverage.ts) only
--     READS this to compute the ครบ/ขาด strip; the ครบ-gate is ADVISORY (never blocks a
--     payment). No consumer changes cost, status, wallet, or the pay register from here.
--
-- IDEMPOTENT / RE-APPLIABLE:
--   UNIQUE(invoice_no, ftrackingchn) = the natural identity of an invoice line (an
--   invoice cannot print two lines for the same tracking). Re-applying the same invoice
--   upserts DO NOTHING → coverage never double-counts. `invoice_no` is NOT NULL DEFAULT
--   '' so an unnumbered invoice still de-dupes deterministically (fail-safe direction:
--   a collision UNDER-counts coverage → shows "ขาด/ยังไม่มีข้อมูลใบ", never a false "ครบ").
--   Coverage additionally de-dupes Σ per fid at read time, so a corrected re-bill on a
--   NEW invoice_no can never inflate the billed total either.
--
-- Additive + idempotent (create … if not exists). Safe to re-run. Next free = 0268.
-- DO NOT apply here — the integrator (เดฟ) applies migrations to prod+dev. The app reads
-- this table FAIL-SOFT (missing table → "ยังไม่มีข้อมูลใบ"), so a deploy that briefly
-- precedes this migration never 500s.
-- ════════════════════════════════════════════════════════════

create table if not exists public.momo_invoice_line (
  id             uuid primary key default gen_random_uuid(),
  -- The tb_forwarder row this invoice line billed. Plain bigint snapshot — NO FK
  -- (§0e money-isolation). Coverage JOINs the CURRENT container membership on this.
  fid            bigint not null,
  -- The tracking AS MOMO PRINTED IT on the invoice (may be "<base>-1/N" for a split's
  -- first box). This is the invoice-line audit trail; `fid` is the authoritative link
  -- to our row. Part of the idempotency key.
  ftrackingchn   text not null,
  -- Snapshot of OUR container (tb_forwarder.fcabinetnumber) at apply time. May be null
  -- when the row was not yet cabinet-linked. Coverage does NOT trust this for the join
  -- (it re-derives container membership live) — it is a convenience index for cnt-hs.
  fcabinetnumber text,
  -- MOMO invoice number. NOT NULL DEFAULT '' so the UNIQUE key always has a concrete
  -- value (an unnumbered invoice de-dupes within the '' bucket · fail-safe).
  invoice_no     text not null default '',
  -- The line's Total (THB) MOMO billed for this tracking = the REAL cost of this row.
  amount         numeric(14,2) not null default 0,
  -- Which source the cost was read from — 'pdf_upload' | 'paste'. A money-provenance
  -- write must never be ambiguous about its origin when audited months later.
  source         text,
  applied_at     timestamptz not null default now(),
  -- The admin actor id (withAdmin ctx adminId) that applied the invoice.
  applied_by     text,
  constraint momo_invoice_line_invoice_tracking_uniq unique (invoice_no, ftrackingchn)
);

-- Coverage JOINs by fid (the container's CURRENT tb_forwarder rows → their invoice lines).
create index if not exists momo_invoice_line_fid_idx
  on public.momo_invoice_line (fid);
-- Convenience lookup for the cnt-hs container-payment views.
create index if not exists momo_invoice_line_cabinet_idx
  on public.momo_invoice_line (fcabinetnumber);
create index if not exists momo_invoice_line_invoice_idx
  on public.momo_invoice_line (invoice_no);

alter table public.momo_invoice_line enable row level security;

-- Admin read-only via authenticated (service_role bypasses RLS for the ingest write and
-- the admin-client reads). No insert/update/delete policy for non-service roles → the
-- only writer is applyMomoInvoiceCost via the service-role admin client (mirrors
-- taem_packing_line).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'momo_invoice_line'
      and policyname = 'momo_invoice_line_admin_read'
  ) then
    create policy momo_invoice_line_admin_read
      on public.momo_invoice_line
      for select
      to authenticated
      using (public.is_admin());
  end if;
end $$;

comment on table public.momo_invoice_line is
  'APPEND-ONLY provenance: one row per applied MOMO invoice LINE — proof a real MOMO invoice billed a tb_forwarder row. Powers cabinet-billing coverage (ครบ/ขาด · "ตู้นี้ MOMO บิลครบยัง"). NO FK to money tables (§0e). Only writer = applyMomoInvoiceCost. Idempotent via UNIQUE(invoice_no, ftrackingchn). Created 2026-07-21.';
comment on column public.momo_invoice_line.fid is 'tb_forwarder.id this line billed (plain bigint snapshot · NO FK). Coverage joins current container rows on this.';
comment on column public.momo_invoice_line.ftrackingchn is 'Tracking AS MOMO PRINTED IT (may be "<base>-1/N"). Invoice-line audit trail + idempotency key half.';
comment on column public.momo_invoice_line.invoice_no is 'MOMO invoice number ("" when the invoice printed none). Idempotency key half — re-applying the same invoice upserts DO NOTHING.';
comment on column public.momo_invoice_line.amount is 'The invoice line Total (THB) — the REAL per-tracking cost MOMO billed (vs the estimated fcosttotalprice).';
