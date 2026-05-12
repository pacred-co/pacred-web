-- ============================================================
-- 22 — Forwarder operations (admin)
-- ============================================================
-- Driver dispatch + import sync + transit warehouse + quotations
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_forwarder_driver ────
CREATE TABLE `tb_forwarder_driver` (
  `ID` bigint(20) NOT NULL,
  `fdDate` datetime NOT NULL,
  `fdName` varchar(200) NOT NULL,
  `fdAmount` int(11) NOT NULL,
  `fdAdminID` varchar(20) NOT NULL,
  `fdAdminCreator` varchar(20) NOT NULL,
  `fdStatus` varchar(1) NOT NULL,
  `endTime` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_forwarder_driver_item ────
CREATE TABLE `tb_forwarder_driver_item` (
  `ID` bigint(20) NOT NULL,
  `fdID` bigint(20) NOT NULL,
  `fID` bigint(20) NOT NULL,
  `fdiStatus` varchar(1) NOT NULL,
  `fdiPictureOn` varchar(150) NOT NULL COMMENT 'รูปขึ้นรถ',
  `fdiPictureOff` varchar(150) NOT NULL COMMENT 'ลงรถ'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_forwarder_import ────
CREATE TABLE `tb_forwarder_import` (
  `ID` bigint(20) NOT NULL,
  `fID` bigint(20) NOT NULL,
  `fiAmount` int(11) NOT NULL,
  `fiDate` datetime NOT NULL,
  `adminID` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_forwarder_jmf_tmp ────
CREATE TABLE `tb_forwarder_jmf_tmp` (
  `ID` bigint(20) NOT NULL,
  `IDJMF` bigint(20) NOT NULL,
  `dateCrate` datetime NOT NULL,
  `IP` varchar(250) NOT NULL,
  `fDate` datetime NOT NULL,
  `fWarehouseChina` varchar(1) NOT NULL COMMENT '1=กวางโจว,2=อี้อู',
  `fTransportType` varchar(1) NOT NULL COMMENT 'รูปแบบการขนส่ง',
  `fCabinetNumber` varchar(255) NOT NULL,
  `fIDorCO` varchar(30) NOT NULL,
  `fTrackingCHN` varchar(100) NOT NULL,
  `fTrackingCHN2` varchar(100) NOT NULL,
  `fDateToThai` datetime NOT NULL,
  `fDateContainerClose` datetime NOT NULL,
  `fAmount` int(11) NOT NULL,
  `fDetail` text NOT NULL,
  `fCover` varchar(255) NOT NULL,
  `fIMG1` varchar(23) NOT NULL,
  `fIMG2` varchar(23) NOT NULL,
  `fIMG3` varchar(23) NOT NULL,
  `fIMG4` varchar(23) NOT NULL,
  `fProductsType` varchar(1) NOT NULL,
  `fWeight` decimal(10,2) NOT NULL,
  `fWidth` decimal(10,2) NOT NULL,
  `fLength` decimal(10,2) NOT NULL,
  `fHeight` decimal(10,2) NOT NULL,
  `fVolume` decimal(10,5) NOT NULL,
  `fShippingService` decimal(10,2) NOT NULL,
  `userID` varchar(50) NOT NULL,
  `crate` varchar(1) NOT NULL COMMENT '1=ตีลัง',
  `priceCrate` decimal(10,2) NOT NULL,
  `fTransportPriceCHNTHB` decimal(10,2) NOT NULL COMMENT 'ค่าขนส่งจีน บาท',
  `priceOther` decimal(10,2) NOT NULL COMMENT 'ค่าอื่นๆ',
  `APIStatus` varchar(10) NOT NULL,
  `APIResult` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_forwarder_prepare ────
CREATE TABLE `tb_forwarder_prepare` (
  `ID` bigint(20) NOT NULL,
  `fID` bigint(20) NOT NULL,
  `fpAmount` int(11) NOT NULL,
  `fpDate` datetime NOT NULL,
  `adminID` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_forwarder_tran_th_h ────
CREATE TABLE `tb_forwarder_tran_th_h` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_forwarder_tran_th_sub ────
CREATE TABLE `tb_forwarder_tran_th_sub` (
  `ID` bigint(20) NOT NULL,
  `ftthhID` bigint(20) NOT NULL,
  `fID` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_farwarder_quotation ────
CREATE TABLE `tb_farwarder_quotation` (
  `ID` bigint(20) NOT NULL,
  `fqNo` varchar(30) NOT NULL,
  `date` datetime NOT NULL COMMENT 'วันที่สร้างรายการ',
  `adminIDCreate` varchar(30) NOT NULL COMMENT 'แอดมินที่สร้าง',
  `adminIDApprover` varchar(30) NOT NULL COMMENT 'คนอนุมัติราคา',
  `dateApprover` datetime NOT NULL COMMENT 'เวลาที่อนุมัติ',
  `compNumber` varchar(13) NOT NULL COMMENT 'เลขผู้เสียภาษี',
  `compName` varchar(300) NOT NULL COMMENT 'ชื่อบริษัท',
  `compAddress` text NOT NULL COMMENT 'ที่อยู่บริษัท',
  `contact` varchar(500) NOT NULL COMMENT 'ผู้ติดต่อมา',
  `userID` varchar(30) NOT NULL,
  `email` varchar(200) NOT NULL,
  `tel` varchar(15) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_farwarder_quotation_item ────
CREATE TABLE `tb_farwarder_quotation_item` (
  `ID` bigint(20) NOT NULL,
  `fqID` bigint(20) NOT NULL,
  `warehouseType` varchar(1) NOT NULL COMMENT '1=กวางโจว,2=อี้อู',
  `transportType` varchar(1) NOT NULL COMMENT '1=ทางรถ,2=เรือ',
  `productType` varchar(1) NOT NULL COMMENT '1=ทั่วไป',
  `price` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


