-- ════════════════════════════════════════════════════════════
-- 0177 · PEAK GL chart-of-accounts map — business_config seed
-- ════════════════════════════════════════════════════════════
-- The PEAK CSV export (actions/admin/peak-export.ts ~L462) reads the
-- GL account-code map via:
--
--   getBusinessConfig<PeakGlAccounts>("peak.gl_accounts", {
--     selling: "", cost: "", declared: "", pending: true,
--   })
--
-- …but NO migration ever seeded that business_config row. The editor at
-- /admin/settings/business-config renders only EXISTING rows, so the key
-- never appeared in the UI → the owner's standing "PEAK GL codes" action
-- item had no entry point in the product, and the export stayed flagged
-- "รหัสบัญชี GL รอนักบัญชี" (pending=true via the call-site default) with no
-- way for the accountant to supply real codes through the app.
--
-- This migration seeds the row with the EXACT shape the export reads, so
-- the editor surfaces it (new "accounting" tab) and the accountant just
-- fills the values + flips `pending` to false.
--
-- ── Read shape (PeakGlAccounts · peak-export.ts L103-108) ───────────
--   selling  : string  — revenue / AR account (→ ใบกำกับ + VAT)
--   cost     : string  — COGS / stock-in account (→ PEAK)
--   declared : string  — memo only (no GL posting for declared value)
--   pending  : boolean — true = accountant has NOT supplied real codes yet
--
-- Only gl.selling / gl.cost / gl.declared are consumed downstream
-- (TaxDocRollupRow.glSelling/glCost/glDeclared); `pending` drives the
-- amber "รหัสบัญชี GL รอนักบัญชี" banner. Shape matched 1:1 — no extra
-- sub-keys, so the accountant fills exactly what the export reads.
--
-- value_type = 'json' → the business-config editor already renders json
-- rows as a JSON textarea (parse/stringify roundtrip) + adminUpdateBusiness
-- Config validates the json type. Editable out of the box, no UI change.
--
-- Additive + idempotent: ON CONFLICT (key) DO NOTHING.
-- ════════════════════════════════════════════════════════════

insert into public.business_config (key, value, value_type, category, description)
values (
  'peak.gl_accounts',
  '{"selling": "", "cost": "", "declared": "", "pending": true}'::jsonb,
  'json',
  'accounting',
  'PEAK GL chart-of-accounts map สำหรับ PEAK CSV export (actions/admin/peak-export.ts). นักบัญชี (NAT) ใส่รหัสบัญชี GL จริง: selling = บัญชีรายได้/AR (→ ใบกำกับ + VAT), cost = บัญชี COGS/stock-in (→ PEAK), declared = memo เฉยๆ ไม่มี GL posting. หลังกรอกรหัสครบแล้วให้ตั้ง "pending" เป็น false เพื่อปิด banner "รหัสบัญชี GL รอนักบัญชี" — โครงสร้าง CSV พร้อมแล้ว เติมรหัสแล้วใช้ได้ทันที.'
)
on conflict (key) do nothing;
