-- 0182_coid_pcs_to_pr.sql
-- Rebrand the general/default company code  PCS → PR  (Pacred).
--
-- WHY: legacy PCS Cargo used coID='PCS' for the default (non-VIP) customer
-- tier — the bucket that reads the general tiered rate card (tb_rate_g_*).
-- Pacred rebranded it to 'PR': new signups already write coID='PR'
-- (lib/auth/legacy-bridge-tb-users.ts), so the 8,742 migrated legacy rows on
-- 'PCS' were inconsistent with the 43 native 'PR' rows AND with the rate
-- sentinel — a 'PR' customer fell through to the VIP branch, found no VIP card,
-- and saw "ไม่มีเรต". This migration renames every legacy 'PCS' → 'PR' so the
-- whole platform is consistent on 'PR', fixing that gap.
--
-- SAFE — verified on DEV (lozntlidlqqzzcaathnm) 2026-06-12:
--   • NO foreign key references any coid column (pg_constraint scan = 0).
--   • tb_co PK is on "ID" (numeric), NOT coID → renaming the value is free.
--   • NO 'PR' row pre-exists in tb_co (the rename does not collide).
--   • The 4 VIP coIDs (THADA.VIP / SIN.VIP / OOAEOM.VIP / SWAN) + VIP1-5 / PRO*
--     are NOT 'PCS' → untouched (their tb_rate_vip_* cards stay keyed as-is).
--   • The matching app change (lib/forwarder/coid.ts isGeneralCoid) accepts
--     BOTH 'PR' and legacy 'PCS' as general, so code + this migration can land
--     in either order without breaking the 8,742 general customers.
--
-- ⚠️  This is a DATA migration (not schema). Idempotent: re-running is a no-op
--     once every 'PCS' is gone. Counts below are the DEV snapshot (prod ≈ same
--     shape — confirm via the dry-run print before --apply).
--
-- ⚠️  CAUTION — "PCS" has OTHER, UNRELATED meanings that this migration MUST NOT
--     touch (they are different columns, so the WHERE clauses below are safe):
--       · fShipBy / hShipBy / addressID = 'PCS'  → self-pickup at the warehouse
--       · PCSF / PCSE                            → Flash/EMS ship-by promos
--       · unit = 'PCS'                           → freight line unit (pieces)
--     Only the coID/coid company-tier columns are renamed here.

-- tb_co — the company/tier master (1 row: ID 21 'ทั่วไป').
update public.tb_co         set "coID" = 'PR' where "coID" = 'PCS';

-- The general tiered rate card (16 rows each = sourcewarehouse × transport × product).
update public.tb_rate_g_kg  set coid   = 'PR' where coid   = 'PCS';
update public.tb_rate_g_cbm set coid   = 'PR' where coid   = 'PCS';

-- The customers (~8,742 rows on DEV). Native 'PR' rows already exist (≈43) and
-- are unaffected; this only flips the legacy 'PCS' rows.
update public.tb_users      set "coID" = 'PR' where "coID" = 'PCS';

-- The registration archive (~16,853 rows). Not read by current app code, but
-- renamed for full consistency ("เปลี่ยนที่เป็น PCS เป็น PR ให้หมด").
update public.tb_register   set coid   = 'PR' where coid   = 'PCS';
