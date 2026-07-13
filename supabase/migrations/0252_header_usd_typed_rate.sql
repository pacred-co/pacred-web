-- 0252 · store the operator's TYPED foreign sell-rate (บาท/USD) so the USD-order
-- editor shows exactly what was typed (owner 2026-07-13 P22353: "ตั้ง 35 ขึ้น 35.006").
-- Root: the header keeps only hrate (=effRate ¥→฿, numeric(10,2)); re-deriving
-- บาท/USD from that 2dp rate is lossy → drift. husdrate stores the typed rate at
-- full precision; the editor prefers it (falls back to the derived value for
-- legacy orders). Additive · nullable · DISPLAY-only (money basis = hrate, unchanged).
alter table public.tb_header_order
  add column if not exists husdrate numeric(12,6);
comment on column public.tb_header_order.husdrate is
  'typed foreign sell-rate บาท/{cur} for foreign-currency shop orders (display SOT · null = derive from hrate)';
