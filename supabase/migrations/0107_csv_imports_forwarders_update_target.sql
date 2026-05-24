-- ════════════════════════════════════════════════════════════
-- Gap #7 · D1 Phase B — Bulk-update target for csv_imports
-- ════════════════════════════════════════════════════════════
-- Legacy PCS `import-excel.php` (despite the name, accepts CSV
-- per the help text: "การบันทึกไฟล์แนะนำให้ใช้ รูปแบบ CSV UTF-8")
-- is a BULK-UPDATE tool: matches existing tb_forwarder rows by
-- tracking number, then flips status 1 → 2 (สินค้าถึงโกดังจีน)
-- or 1 → 3 (กำลังส่งมาประเทศไทย) AND fills in box dimensions,
-- weight, volume, cabinet number, source_warehouse, transport_type.
--
-- That's the "ปรับรายการอัตโนมัติ" (auto-update items) menu —
-- warehouse staff in Guangzhou / Yiwu paste a daily container
-- manifest into Excel, export CSV, upload, and ALL inbound
-- forwarder rows are progressed in one operation.
--
-- Our existing `csv_imports.target_table` only accepts
-- 'forwarders' (= bulk-INSERT new rows). This migration adds a
-- second target — `forwarders_update_by_tracking` — that matches
-- by tracking_chn and UPDATEs columns instead of inserting.
--
-- Behaviour of the new target (server-side, in confirmCsvImport):
--   * Required column: tracking_chn  (legacy column D)
--   * Optional columns mapped to forwarders.* :
--       cabinet_closed_date → date_arrived_thailand (status auto-bumps)
--       source_warehouse    → source_warehouse  (GuangZhou→guangzhou, Yiwu→yiwu)
--       transport_type      → transport_type    (EK→truck, SEA→ship)
--       cabinet_number      → cabinet_number
--       weight_kg, width_cm, length_cm, height_cm, volume_cbm, box_count
--       detail              → detail
--   * Match rule: WHERE tracking_chn = csv_row.tracking_chn — first
--     match wins. Rows with no match are SKIPPED (counted, not failed).
--   * Status: when cabinet_closed_date is present, status auto-bumps:
--       'pending_payment' → 'shipped_china'
--       'shipped_china'   → 'in_transit'
--       else              → unchanged
--     Mirrors legacy fStatus 1→2 + 1→3 bumps in import-excel.php §573.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

alter table public.csv_imports
  drop constraint if exists csv_imports_target_table_check;

alter table public.csv_imports
  add constraint csv_imports_target_table_check
    check (target_table in ('forwarders', 'forwarders_update_by_tracking'));

comment on column public.csv_imports.target_table is
  'forwarders = bulk INSERT new rows. forwarders_update_by_tracking = match existing rows by tracking_chn + UPDATE box dims / cabinet / status (legacy import-excel.php "ปรับรายการอัตโนมัติ").';
