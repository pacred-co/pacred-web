-- ============================================================
-- 06 — Service-Payment (ฝากโอนหยวน Alipay)
-- ============================================================
-- Single table — Alipay transfer requests
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_payment ────
CREATE TABLE `tb_payment` (
  `ID` bigint(20) NOT NULL,
  `payDate` datetime NOT NULL,
  `paydeposit` varchar(1) NOT NULL,
  `payStatus` varchar(1) NOT NULL DEFAULT '1',
  `payType` varchar(1) NOT NULL,
  `payDetail` text NOT NULL,
  `payYuan` decimal(10,2) NOT NULL,
  `payRate` decimal(10,2) NOT NULL,
  `payRateCost` decimal(10,2) NOT NULL,
  `payTHB` decimal(10,2) NOT NULL,
  `payTHBCost` decimal(10,2) NOT NULL,
  `payProfitTHB` decimal(10,2) NOT NULL,
  `payDateAdmin` datetime NOT NULL,
  `userID` varchar(10) NOT NULL,
  `adminID` varchar(10) NOT NULL,
  `adminIDUpdate` varchar(10) NOT NULL,
  `payAdminIDCreator` varchar(10) NOT NULL,
  `payLockDate` datetime NOT NULL,
  `session` varchar(100) NOT NULL,
  `imagesSlip` varchar(250) NOT NULL,
  `certifiedTrueCopy` varchar(250) NOT NULL COMMENT 'ชื่อไฟล์ หนังสือเดินทางหรือบัตรประชาชน',
  `imagesSlipAdmin` varchar(250) NOT NULL COMMENT 'ชื่อไฟล์หลักฐานการทำงานของแอดมิน'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


