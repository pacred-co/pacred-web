-- ============================================================
-- 21 — Containers (admin tracking)
-- ============================================================
-- Container shipment tracking + HS code rates per container
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_cnt ────
CREATE TABLE `tb_cnt` (
  `ID` bigint(20) NOT NULL,
  `cntName` varchar(1000) NOT NULL COMMENT 'เลขตู้',
  `cntStatus` varchar(1) NOT NULL,
  `cntAmount` decimal(10,2) NOT NULL COMMENT 'จำนวนเงินที่จ่าย',
  `cntImagesSlip` varchar(200) NOT NULL,
  `date` datetime NOT NULL COMMENT 'วันที่ทำรายการ',
  `adminIDCreate` varchar(30) NOT NULL COMMENT 'แอดมินทำรายการ',
  `nameBlank` varchar(300) NOT NULL,
  `noBlank` varchar(200) NOT NULL,
  `nameAccount` varchar(300) NOT NULL,
  `cntFile` varchar(200) NOT NULL,
  `dateUpdate` datetime NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci COMMENT='ตารางจ่ายเงินค่าตู้';


-- ──── tb_cnt_item ────
CREATE TABLE `tb_cnt_item` (
  `ID` bigint(20) NOT NULL,
  `fCabinetNumber` varchar(300) NOT NULL,
  `cntID` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_cnt_pay_idorco ────
CREATE TABLE `tb_cnt_pay_idorco` (
  `ID` bigint(20) NOT NULL,
  `fIDorCO` varchar(30) NOT NULL,
  `fCabinetNumber` varchar(300) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci COMMENT='รายการจ่ายเงินเลข PK';


-- ──── tb_cnt_pay_trackingchn ────
CREATE TABLE `tb_cnt_pay_trackingchn` (
  `ID` bigint(20) NOT NULL,
  `fTrackingCHN` varchar(50) NOT NULL,
  `fCabinetNumber` varchar(300) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci COMMENT='ข้อมูลจ่ายตามเลขแทรคกิ้ง';


-- ──── tb_cost_container ────
CREATE TABLE `tb_cost_container` (
  `ID` bigint(20) NOT NULL,
  `fCabinetNumber` varchar(300) NOT NULL,
  `fProductsType1` decimal(10,2) NOT NULL,
  `fProductsType2` decimal(10,2) NOT NULL,
  `fProductsType3` decimal(10,2) NOT NULL,
  `fProductsType4` decimal(10,2) NOT NULL,
  `adminID` varchar(50) DEFAULT NULL,
  `date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


