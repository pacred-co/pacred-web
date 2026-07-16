-- 0257 — customs_importer_lead: how the importer matched an existing customer.
-- owner 2026-07-16: "บางชื่อที่บอกไม่มีในระบบ เราเห็นมีเต็มเลย เช่น อภิรัตน์ ·
-- ลูกค้าในใบขนอยู่ในไฟล์ excel booking ของเฟรท 99%".
--
-- The first cross-ref matched ONLY นิติ tax id → tb_corporate → tb_users, so it
-- missed every customer whose tax id isn't in tb_corporate (e.g. อภิรัตน์
-- อินดัสตรีส์ = PR225, a juristic tb_users row with NO tb_corporate) and the whole
-- freight-booking import (imported_leads · 891 rows: freight/Axelra/Pcs/Pacred).
-- The widened cross-ref matches by tax id ▸ normalised company NAME across
-- tb_corporate / tb_users / imported_leads, and records WHICH signal matched.
alter table customs_importer_lead
  add column if not exists match_source text,        -- tax | name_corp | name_user | lead_freight
  add column if not exists matched_lead_id bigint,   -- imported_leads.id when matched via the booking file
  add column if not exists matched_lead_source text; -- imported_leads.source (freight/Axelra/Pcs/Pacred)

comment on column customs_importer_lead.match_source is
  'how this importer matched an existing customer: tax (นิติ→tb_corporate) · name_corp · name_user (tb_users) · lead_freight (imported_leads/ไฟล์ booking)';
