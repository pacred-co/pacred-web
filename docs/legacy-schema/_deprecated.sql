-- ============================================================
-- DEPRECATED — DO NOT PORT
-- ============================================================
-- Time-bound campaigns, surveys, backups, typo-named tables. Listed for completeness only.
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_promotion33 ────
CREATE TABLE `tb_promotion33` (
  `userID` varchar(30) NOT NULL,
  `statusPro` varchar(1) NOT NULL COMMENT '1=ยังไม่ใช้,2=ใช้โปรแล้ว'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_pro_valentine ────
CREATE TABLE `tb_pro_valentine` (
  `userID` varchar(30) NOT NULL,
  `message` text NOT NULL,
  `date` datetime NOT NULL COMMENT 'เวลาที่โพสต์'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_survey ────
CREATE TABLE `tb_survey` (
  `ID` bigint(20) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `userSex` varchar(200) NOT NULL,
  `userBirthday` varchar(20) NOT NULL,
  `occupation` varchar(200) NOT NULL,
  `usedPCS` text NOT NULL,
  `serviceIntroduction` varchar(100) NOT NULL,
  `problems` text NOT NULL,
  `forwarder` text NOT NULL,
  `shop` text NOT NULL,
  `promotion` text NOT NULL,
  `date` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_survey202306 ────
CREATE TABLE `tb_survey202306` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `userID` varchar(30) NOT NULL,
  `userSex` varchar(200) NOT NULL,
  `occupation` varchar(200) NOT NULL,
  `usedPCS` text NOT NULL,
  `problems` text NOT NULL,
  `adjust` text NOT NULL,
  `readBlog` varchar(100) NOT NULL,
  `benefitBlog` text NOT NULL,
  `promotion` text NOT NULL,
  `addService` text NOT NULL,
  `recommend` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_youtude ────
CREATE TABLE `tb_youtude` (
  `ID` bigint(20) NOT NULL,
  `dateGet` datetime NOT NULL,
  `title` text NOT NULL,
  `videoId` varchar(256) NOT NULL,
  `urlCover` varchar(256) NOT NULL,
  `category` varchar(1) NOT NULL COMMENT '1=all,2=ceo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci COMMENT='ข้อมูลจาก youtude';


-- ──── tb_forwarder_import2 ────
CREATE TABLE `tb_forwarder_import2` (
  `ID` bigint(20) NOT NULL,
  `fID` bigint(20) DEFAULT NULL,
  `keysearch` varchar(80) NOT NULL,
  `fiPallet` varchar(5) NOT NULL,
  `fi2Amount` int(11) NOT NULL,
  `fi2Date` datetime NOT NULL,
  `adminID` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_tmp_forwarder_cargothai ────
CREATE TABLE `tb_tmp_forwarder_cargothai` (
  `ID` bigint(20) NOT NULL,
  `container_name` varchar(255) DEFAULT NULL,
  `container_code` varchar(255) DEFAULT NULL,
  `due_date` datetime DEFAULT NULL,
  `box_total` int(11) DEFAULT NULL,
  `box_weight` decimal(10,2) DEFAULT NULL,
  `box_cbm` decimal(10,6) DEFAULT NULL,
  `sm_code` varchar(255) DEFAULT NULL,
  `sm_date` datetime DEFAULT NULL,
  `manifest_date` datetime DEFAULT NULL,
  `estimated_date` datetime DEFAULT NULL,
  `etd` datetime DEFAULT NULL,
  `eta` datetime DEFAULT NULL,
  `re` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `note` text DEFAULT NULL,
  `note_amount` int(11) DEFAULT NULL COMMENT 'หน่วยหยวน',
  `transport_name` varchar(255) DEFAULT NULL,
  `transport_code` varchar(255) DEFAULT NULL,
  `warehouse_name` varchar(255) DEFAULT NULL,
  `warehouse_code` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `status_date` datetime DEFAULT NULL,
  `sm` varchar(255) DEFAULT NULL,
  `userID` varchar(255) DEFAULT NULL,
  `hNo` varchar(255) DEFAULT NULL,
  `api_lastTimeUpdated` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_tmp_forwarder_item_cargothai ────
CREATE TABLE `tb_tmp_forwarder_item_cargothai` (
  `ID` bigint(20) NOT NULL,
  `productID` bigint(20) NOT NULL,
  `productName` varchar(255) NOT NULL,
  `productTracking` varchar(255) NOT NULL,
  `productTrackingNote` text NOT NULL,
  `productQTY` int(11) NOT NULL,
  `productBagID` bigint(20) NOT NULL,
  `productWidth` decimal(10,2) NOT NULL,
  `productLength` decimal(10,2) NOT NULL,
  `productHeight` decimal(10,2) NOT NULL,
  `productWeightPerItem` decimal(10,2) NOT NULL,
  `productWeightAll` decimal(10,2) NOT NULL,
  `productCBMPerItem` decimal(10,6) NOT NULL,
  `productCBMAll` decimal(10,6) NOT NULL,
  `productWeightFormat` varchar(100) NOT NULL,
  `productTypeCode` varchar(5) NOT NULL,
  `containerCode` varchar(200) NOT NULL,
  `userID` varchar(50) NOT NULL,
  `fID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `lastTimeUpdated` datetime NOT NULL,
  `adminID` varchar(50) NOT NULL COMMENT 'แอดมินที่สร้าง',
  `adminIDUpdated` varchar(50) NOT NULL COMMENT 'แอดมินที่แก้ไขล่าสุด',
  `domesticShippingChina` decimal(10,2) NOT NULL COMMENT 'ค่าขนส่งในจีน เดิมใน tb_forwarder fTransportPriceCHNTHB',
  `chinaWoodenCrateFeeType` varchar(1) NOT NULL COMMENT 'ตีลังไม้ 1=ไม่ตี, 2=ตีลัง เดิม tb_forwarder crate',
  `chinaWoodenCrateFee` decimal(10,2) NOT NULL COMMENT 'ค่าตีลังไม้',
  `otherServiceFee` decimal(10,2) NOT NULL COMMENT 'ค่าบริการอื่น ๆ',
  `thailandDeliveryFee` decimal(10,2) NOT NULL COMMENT 'ค่าขนส่งในไทย',
  `fRefPrice` varchar(1) NOT NULL COMMENT 'คิดเรทนำเข้าตาม 1=น้ำหนัก 2=ปริมาตร',
  `fQC` varchar(1) NOT NULL COMMENT '	1=ไม่ตรวจนับ, 2=ตรวจนับ',
  `fQCPrice` decimal(10,2) NOT NULL COMMENT 'ค่า QC สินค้า',
  `fPriceUpdate` decimal(10,2) NOT NULL COMMENT 'ราคาที่เก็บเพิ่มมาจากฝากนำเข้า',
  `fDiscount` decimal(10,2) NOT NULL COMMENT 'ส่วนลด',
  `sm_code` varchar(255) NOT NULL,
  `sm` varchar(255) NOT NULL,
  `container_code` varchar(255) NOT NULL,
  `productCostCHN` decimal(10,2) NOT NULL COMMENT 'note_amount',
  `transport_code` varchar(5) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


