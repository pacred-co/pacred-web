-- ════════════════════════════════════════════════════════════════
-- 0139 — Yuan (ฝากโอน · tb_payment) tax-document preference.
-- เดฟ-agent · 2026-06-04 · Lane B (the 3 tax-document modes).
-- ════════════════════════════════════════════════════════════════
-- Completes the per-order tax-doc data model. Migration 0127 added the
-- three columns to tb_header_order (ฝากสั่งซื้อ) + tb_forwarder (ฝากนำเข้า);
-- this extends the SAME three columns to tb_payment (ฝากโอน) so the customer/
-- admin can pick a document mode on a yuan-transfer order too.
--
--   tax_doc_pref     enum text — 'tax_invoice' (ใบกำกับ · VAT 7% on goods —
--                     ⚠ ฝากโอน: only valid when the customer ฝากโอน WITH us,
--                     i.e. we are the importer-of-record), 'customs' (ใบขน ·
--                     VAT 7% on the service fee), 'receipt' (ไม่รับเอกสาร ·
--                     no doc; margin = taxable profit). NULL = receipt default.
--   tax_doc_tax_id   snapshot — 13-digit tax id at order time (juristic only).
--   tax_doc_address  snapshot — billing/company name + address at order time.
--
-- ⚠ ISSUANCE STILL DEFERRED (ADR-0027). World-B has no cross-type tax-invoice
--   store for yuan yet (only forwarder · tb_forwarder_tax_invoice, migration
--   0129). This migration completes the SELECTION data model; issuing a yuan
--   ใบกำกับ/ใบขน is a separate follow-up once the cross-type table lands
--   (ADR-0027 Option A/B). The customer-request path keeps returning the
--   friendly 'not_yet_supported' banner for yuan until then.
--
-- Idempotent. tb_payment columns are lowercase (per current schema state —
-- only tb_users/tb_admin/tb_co are camelCase; see migration 0125 casing note).
-- ════════════════════════════════════════════════════════════════

alter table public.tb_payment
  add column if not exists tax_doc_pref      text,
  add column if not exists tax_doc_tax_id    text,
  add column if not exists tax_doc_address   text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tb_payment_tax_doc_pref_chk') then
    alter table public.tb_payment
      add constraint tb_payment_tax_doc_pref_chk
      check (tax_doc_pref is null or tax_doc_pref in ('receipt','tax_invoice','customs'));
  end if;
end $$;

-- Index for the admin "pending tax-doc issuance" queue (mirrors 0127).
create index if not exists idx_tb_payment_tax_doc_pref
  on public.tb_payment (tax_doc_pref) where tax_doc_pref is not null and tax_doc_pref <> 'receipt';

comment on column public.tb_payment.tax_doc_pref is
  'Lane B tax-document mode (lib/tax/tax-doc-mode.ts): tax_invoice (ใบกำกับ · VAT on goods · ฝากโอน only if importer-of-record) · customs (ใบขน · VAT on service fee) · receipt/NULL (ไม่รับเอกสาร). Issuance for yuan deferred per ADR-0027 (no cross-type World-B store yet).';
