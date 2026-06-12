-- 0181 — รหัสสถิติ (statistical code) for the Thai 11-digit tariff (HS-8 + stat-3)
-- + bulk-assign support for the CS HS-triage queue (GAP 5+, owner 2026-06-12).
--
-- Owner spec: the customs พิกัด is HS(8) + a 3-digit statistical code (รหัสสถิติ ·
-- "มี stat ให้ใส่ด้วย · ส่วนใหญ่ 001/090/000"). Capture it per LINE alongside the
-- existing hs_code (mig 0158), and let the คลัง HS dictionary carry the USUAL stat
-- for a พิกัด so the triage UI can pre-fill it.
--
-- Additive + idempotent. No data backfill (existing rows = NULL → the UI defaults
-- the input to '000'). §0e: these are reference/customs-doc columns — they never
-- touch selling price / cost / status / wallet.

-- ── per-line statistical code (the assignment captures it) ──
alter table public.tb_order
  add column if not exists hs_stat_code text;
alter table public.tb_forwarder_item
  add column if not exists hs_stat_code text;

-- ── the คลัง HS dictionary's usual stat for a พิกัด (pre-fill suggestion) ──
alter table public.hs_codes
  add column if not exists default_stat_code text default '000';

comment on column public.tb_order.hs_stat_code is 'รหัสสถิติ (Thai tariff stat suffix · 3 digits e.g. 000/001/090) · paired with hs_code';
comment on column public.tb_forwarder_item.hs_stat_code is 'รหัสสถิติ (Thai tariff stat suffix · 3 digits) · paired with hs_code';
comment on column public.hs_codes.default_stat_code is 'usual รหัสสถิติ for this พิกัด (default 000) · pre-fill suggestion in the HS-triage UI';
