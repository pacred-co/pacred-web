-- 0207_forwarder_advance_bill_confirm.sql
-- Owner 2026-06-23 (B · "วางบิลล่วงหน้าตอน MOMO ยิงของ"): let admin วางบิล + เก็บเงิน
-- BEFORE the goods reach Thailand — once MOMO has scanned the parcel into a container
-- (confirmed it exists, not lost) AND a staff has CONFIRMED (เฟิม) the cbm/weight
-- (from แต้ม's packing list, MOMO as fallback). Two additive columns on tb_forwarder:
--
--   advance_bill_confirmed  '1' once a staff เฟิม's the measurements → unlocks
--                           advance billing at fstatus 2/3/4 (eligibility cohort C).
--                           DEFAULT '0' → 100% inert until explicitly confirmed
--                           (no change to any existing billing while this ships).
--   advance_bill_measure_source  audit: where the firmed cbm/weight came from
--                           ('taem' = แต้ม packing list · 'momo' = MOMO scan ·
--                           'th' = re-measured at the Thai warehouse · '' = none).
--
-- owner decision: bill is LOCKED on these firmed numbers; a later TH re-measure that
-- differs beyond a threshold is FLAGGED for review (no silent auto re-collect).
-- Additive · idempotent · no FK.

alter table public.tb_forwarder
  add column if not exists advance_bill_confirmed varchar(1) not null default '0';

alter table public.tb_forwarder
  add column if not exists advance_bill_measure_source varchar(8) not null default '';

-- Find the confirmed-but-unbilled advance queue fast.
create index if not exists tb_forwarder_advance_confirm_idx
  on public.tb_forwarder (advance_bill_confirmed)
  where advance_bill_confirmed = '1';
