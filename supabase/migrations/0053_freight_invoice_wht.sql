-- ════════════════════════════════════════════════════════════
-- U2-3 · WHT gate for freight invoices
-- ════════════════════════════════════════════════════════════
-- Per UPGRADE_PLAN §2 U2-3 + gap-schema-security G-4 + ADR-0015
-- (extension to the cargo-only V-A6 model).
--
-- V-A6 (migration 0044) wired WHT for cargo orders — admin creates a
-- withholding_tax_entries row (FK to service_orders.h_no OR
-- forwarders.f_no) → cert_status='pending' → blocks issueTaxInvoice
-- until cert received/waived.
--
-- The freight side (V-E1 freight_invoices, migration 0051) had no WHT
-- gate. Juristic freight customers withhold tax the SAME way — but
-- Pacred couldn't block their receipt issuance today. U2-3 closes
-- this gap.
--
-- Changes:
--   1. Add freight_invoice_id column to withholding_tax_entries
--   2. Relax wht_one_parent_order from 2-way XOR (h_no OR f_no) to
--      3-way XOR (h_no OR f_no OR freight_invoice_id), exactly-one
--   3. Add partial-unique on freight_invoice_id (mirror the two
--      existing partial-unique indexes for cargo parents)
--   4. Index for the freight side for the issuance-gate lookup
--
-- After this migration, adminIssueFreightInvoice can check:
--   select 1 from withholding_tax_entries
--    where freight_invoice_id = <id> and cert_status='pending';
-- → block issuance if found (mirror tax_invoices issuance gate from
-- V-A6).
--
-- Idempotent. Safe to apply on prod live (no data migration).
-- ════════════════════════════════════════════════════════════

-- 1) Add the freight_invoice_id column ----------------------------------
alter table public.withholding_tax_entries
  add column if not exists freight_invoice_id uuid references public.freight_invoices(id) on delete restrict;

-- 2) Relax the XOR constraint to 3-way --------------------------------
-- Drop the existing 2-way XOR, replace with 3-way exactly-one.
-- (Idempotent: drop-if-exists then add.)
alter table public.withholding_tax_entries
  drop constraint if exists wht_one_parent_order;
alter table public.withholding_tax_entries
  add constraint wht_one_parent_order check (
    (case when order_h_no         is not null then 1 else 0 end) +
    (case when forwarder_f_no     is not null then 1 else 0 end) +
    (case when freight_invoice_id is not null then 1 else 0 end) = 1
  );

-- 3) Partial-unique on freight_invoice_id ------------------------------
-- Mirror the existing wht_one_per_order_uidx / wht_one_per_forwarder_uidx
-- pattern. One WHT row per freight invoice (no double-counting).
create unique index if not exists wht_one_per_freight_invoice_uidx
  on public.withholding_tax_entries(freight_invoice_id)
  where freight_invoice_id is not null;

-- 4) Lookup index for the issuance gate --------------------------------
create index if not exists wht_freight_invoice_idx
  on public.withholding_tax_entries(freight_invoice_id)
  where freight_invoice_id is not null;

-- 5) Comments ---------------------------------------------------------
comment on column public.withholding_tax_entries.freight_invoice_id is
  'U2-3 — freight-side parent. XOR with order_h_no + forwarder_f_no (exactly one non-null per wht_one_parent_order constraint).';
comment on constraint wht_one_parent_order on public.withholding_tax_entries is
  '3-way XOR: each WHT row points to exactly one parent — order_h_no (shop), forwarder_f_no (cargo import), or freight_invoice_id (freight commercial invoice). Mirrors tax_invoices_one_parent_order pattern extended for V-E1.';
comment on index public.wht_one_per_freight_invoice_uidx is
  'U2-3 — at most one WHT entry per freight_invoice (mirror the cargo-side per-parent unique pattern).';
