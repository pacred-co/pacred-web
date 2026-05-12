-- ============================================================
-- 26 — Commission withdrawals (admin)
-- ============================================================
-- Withdraw flows for sales + interpreter commissions
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_set_comm_interpreter ────
CREATE TABLE `tb_set_comm_interpreter` (
  `ID` bigint(20) NOT NULL,
  `perCom` decimal(10,2) NOT NULL,
  `adminID` varchar(20) NOT NULL,
  `adminIDUpdate` varchar(20) NOT NULL,
  `dateUpdate` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_withdraw_comm_interpreter_h ────
CREATE TABLE `tb_withdraw_comm_interpreter_h` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `dateUpdate` datetime NOT NULL,
  `title` varchar(300) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `commBefore` decimal(10,2) NOT NULL COMMENT 'Commission before',
  `withholding` decimal(10,2) NOT NULL COMMENT 'Withholding',
  `status` varchar(1) NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL,
  `nameBank` varchar(2) NOT NULL,
  `nameUserBank` varchar(200) NOT NULL,
  `noUserBank` varchar(200) NOT NULL,
  `imagesSlip` varchar(300) NOT NULL,
  `adminID` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_withdraw_comm_interpreter_item ────
CREATE TABLE `tb_withdraw_comm_interpreter_item` (
  `ID` bigint(20) NOT NULL,
  `hNo` varchar(30) NOT NULL,
  `wciID` bigint(20) NOT NULL,
  `diffYaun` decimal(10,2) NOT NULL COMMENT 'ส่วนต่าง ณ วันที่จ่ายเงิน'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_withdraw_comm_sale_h ────
CREATE TABLE `tb_withdraw_comm_sale_h` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `dateUpdate` datetime NOT NULL,
  `title` varchar(300) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `commBefore` decimal(10,2) NOT NULL COMMENT 'Commission before ',
  `withholding` decimal(10,2) NOT NULL COMMENT 'Withholding',
  `status` varchar(1) NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL,
  `nameBank` varchar(2) NOT NULL,
  `nameUserBank` varchar(200) NOT NULL,
  `noUserBank` varchar(200) NOT NULL,
  `imagesSlip` varchar(300) NOT NULL,
  `adminID` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_withdraw_comm_sale_item ────
CREATE TABLE `tb_withdraw_comm_sale_item` (
  `ID` bigint(20) NOT NULL,
  `fID` bigint(20) NOT NULL,
  `wcsID` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


