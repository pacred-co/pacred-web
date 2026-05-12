-- ============================================================
-- 07 — Sales referral & commission
-- ============================================================
-- Sales team commission ledger. Note: PHP hardcodes whitelist (PCS888/2000/352/2678/4155) — replace with team_leaders table per CLAUDE.md #11
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_user_sales ────
CREATE TABLE `tb_user_sales` (
  `ID` bigint(20) NOT NULL,
  `usStatus` varchar(1) NOT NULL,
  `date` datetime DEFAULT NULL,
  `userIDMain` varchar(10) NOT NULL,
  `userID` varchar(10) NOT NULL,
  `IDF` bigint(20) NOT NULL COMMENT 'เลขที่ออเดอร์นำเข้า'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_user_sales_pay ────
CREATE TABLE `tb_user_sales_pay` (
  `ID` bigint(20) NOT NULL,
  `IDUS` bigint(20) NOT NULL,
  `IDUSAP` bigint(20) NOT NULL COMMENT 'ไอดีที่ทำรายการจ่าย'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_user_sales_admin_pay ────
CREATE TABLE `tb_user_sales_admin_pay` (
  `ID` bigint(20) NOT NULL,
  `date` datetime DEFAULT NULL COMMENT 'วันที่สร้าง',
  `status` varchar(1) NOT NULL,
  `userIDMain` varchar(10) NOT NULL,
  `dateSlip` datetime NOT NULL,
  `imagesSlip` varchar(200) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `adminCreate` varchar(20) NOT NULL,
  `name_blank` varchar(256) NOT NULL,
  `no_blank` varchar(256) NOT NULL,
  `name_account` varchar(256) NOT NULL,
  `file` varchar(300) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_sales_report ────
CREATE TABLE `tb_sales_report` (
  `ID` bigint(20) NOT NULL,
  `srDate` datetime NOT NULL COMMENT 'วันที่ลูกค้าชำระ',
  `fID` bigint(20) NOT NULL COMMENT 'เลขที่ออเดอร์ฝากนำเข้า',
  `srAdminIDSale` varchar(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


