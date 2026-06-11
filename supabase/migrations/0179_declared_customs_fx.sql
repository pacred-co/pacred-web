-- ════════════════════════════════════════════════════════════
-- 0179 · มูลค่าสำแดง (ใบขน) — customs FX model (owner 2026-06-12)
-- ════════════════════════════════════════════════════════════
-- The declared value on the ใบขน is a THB figure derived from a foreign-currency
-- amount × the Customs Department's MONTHLY exchange rate (เรทนำเข้าประจำเดือนของ
-- กรมศุลกากร). The owner wants:
--   • anchor the declared amount to a currency (USD default · CNY · others),
--   • the customs rate from a monthly central setting (business_config
--     customs.fx_rates), editable PER-JOB,
--   • the declared amount DEFAULTS from the real cost (the cost expressed in the
--     chosen currency at the customs rate) and is editable DOWN (engineer-down,
--     audited — per docs/learnings/pacred-cargo-tax-invoice-flow.md).
--
--   declared_value_thb = declared_amount_ccy × declared_fx_rate
--
-- These columns sit alongside the mig-0158 per-line cost/declared columns. The
-- existing `declared_value_thb` stays the authoritative THB figure (the seed +
-- the cargo ใบขน PDF + customs_declaration_lines read it); the three new columns
-- record HOW it was reached so staff can re-edit the breakdown.
--
-- ⚠️ ISOLATION (§0e): cost-sheet / customs fields only — NEVER the selling price,
-- the customer's binding charge, status, comms. Additive + idempotent.
-- Next free migration = 0180.
-- ════════════════════════════════════════════════════════════

-- per-line on the shop-order line (tb_order · cost in ¥)
alter table public.tb_order
  add column if not exists declared_currency  text         not null default 'USD',
  add column if not exists declared_fx_rate    numeric(12,4),
  add column if not exists declared_amount_ccy numeric(16,4);

-- per-line on the import-forwarder line (tb_forwarder_item · cost in THB)
alter table public.tb_forwarder_item
  add column if not exists declared_currency  text         not null default 'USD',
  add column if not exists declared_fx_rate    numeric(12,4),
  add column if not exists declared_amount_ccy numeric(16,4);

comment on column public.tb_order.declared_amount_ccy is
  'มูลค่าสำแดง ในสกุล declared_currency (default จากต้นทุนจริง · แก้ลงได้ engineer-down). declared_value_thb = declared_amount_ccy × declared_fx_rate. owner 2026-06-12.';
comment on column public.tb_order.declared_fx_rate is
  'เรทศุลกากร (THB ต่อ 1 หน่วย declared_currency) — default จาก business_config customs.fx_rates รายเดือน · แก้ต่อ job ได้.';

-- ── Central monthly customs FX setting (USD/CNY/… → THB), editable in
--    /admin/settings/business-config. ON CONFLICT DO NOTHING (idempotent seed).
--    `pending` drives an amber "รอกรมศุลกากรประจำเดือน" hint until the accountant
--    fills the real monthly rates. Seed values are reasonable starting points. ──
insert into public.business_config (key, value, value_type, category, description)
values (
  'customs.fx_rates',
  '{"USD": 36.5, "CNY": 5.1, "pending": true}'::jsonb,
  'json',
  'accounting',
  'เรทนำเข้าประจำเดือนของกรมศุลกากร (THB ต่อ 1 หน่วยเงินตปท.) สำหรับคำนวณมูลค่าสำแดงในใบขน. นักบัญชี/Docs อัปเดตทุกเดือน: USD = THB ต่อ 1 USD, CNY = THB ต่อ 1 หยวน (เพิ่มสกุลอื่นได้). หลังกรอกเรทจริงของเดือนแล้วตั้ง "pending" = false. cost editor ใช้เป็น default + แก้ต่อ job ได้.'
)
on conflict (key) do nothing;
