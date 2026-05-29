-- ════════════════════════════════════════════════════════════════
-- 0127 — Customer tax-document preference at order time (P1 cart selector).
-- เดฟ · 2026-05-30 · owner directive 2026-05-30: at /cart let the customer
-- pick "เอกสารภาษี" up front (ใบกำกับภาษี + VAT vs ใบเสร็จธรรมดา) so the
-- system knows at billing time what to issue.
-- ════════════════════════════════════════════════════════════════
-- Adds three nullable columns to BOTH legacy order tables (so the same
-- selector works for ฝากสั่งซื้อ + ฝากนำเข้า). All three default NULL —
-- existing rows stay unaffected; new orders carry the choice.
--
--   tax_doc_pref       enum text — 'receipt' (default, no VAT) ·
--                       'tax_invoice' (+VAT 7% + RD-compliant ใบกำกับภาษี) ·
--                       'customs' (+ใบขนสินค้า, freight/cargo import only)
--   tax_doc_tax_id     snapshot — the customer's 13-digit tax id chosen at
--                       order time (juristic only). Snapshotted because the
--                       customer can update their profile later; the invoice
--                       must reflect the data at the time of order.
--   tax_doc_address    snapshot — billing/company address.
--
-- Idempotent. Both schemas: tb_header_order is lowercase (per current state);
-- tb_forwarder is lowercase too (batch 2b deferred — see tb_users casing note
-- in migration 0125).
-- ════════════════════════════════════════════════════════════════

alter table public.tb_header_order
  add column if not exists tax_doc_pref      text,
  add column if not exists tax_doc_tax_id    text,
  add column if not exists tax_doc_address   text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tb_header_order_tax_doc_pref_chk') then
    alter table public.tb_header_order
      add constraint tb_header_order_tax_doc_pref_chk
      check (tax_doc_pref is null or tax_doc_pref in ('receipt','tax_invoice','customs'));
  end if;
end $$;

alter table public.tb_forwarder
  add column if not exists tax_doc_pref      text,
  add column if not exists tax_doc_tax_id    text,
  add column if not exists tax_doc_address   text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tb_forwarder_tax_doc_pref_chk') then
    alter table public.tb_forwarder
      add constraint tb_forwarder_tax_doc_pref_chk
      check (tax_doc_pref is null or tax_doc_pref in ('receipt','tax_invoice','customs'));
  end if;
end $$;

-- Indexes for the admin "pending tax-invoice issuance" / "pending customs"
-- queues (P2/P3 will read these).
create index if not exists idx_tb_header_order_tax_doc_pref
  on public.tb_header_order (tax_doc_pref) where tax_doc_pref is not null and tax_doc_pref <> 'receipt';
create index if not exists idx_tb_forwarder_tax_doc_pref
  on public.tb_forwarder (tax_doc_pref) where tax_doc_pref is not null and tax_doc_pref <> 'receipt';
