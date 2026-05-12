-- ============================================================
-- 02 — Address
-- ============================================================
-- Shipping addresses + default flag + soft delete
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_address ────
CREATE TABLE `tb_address` (
  `addressID` bigint(20) NOT NULL,
  `addressStatus` varchar(1) NOT NULL DEFAULT '1' COMMENT 'สถานะการลบที่อยู่ 1=ใช้งาน,0=ลบ',
  `addressName` varchar(200) NOT NULL COMMENT 'ชื่อ',
  `addressLastname` varchar(200) NOT NULL COMMENT 'นามสกุล',
  `addressTel` varchar(10) NOT NULL COMMENT 'เบอร์โทร',
  `addressTel2` varchar(10) DEFAULT NULL COMMENT 'เบอร์โทร2',
  `addressNo` varchar(200) NOT NULL COMMENT 'บ้านเลขที่',
  `addressSubDistrict` varchar(255) NOT NULL COMMENT 'ตำบล',
  `addressDistrict` varchar(255) NOT NULL COMMENT 'อำเภอ',
  `addressProvince` varchar(255) NOT NULL COMMENT 'จังหวัด',
  `addressZIPCode` varchar(5) NOT NULL COMMENT 'รหัสไปรษณีย์',
  `addressNote` text NOT NULL COMMENT 'หมายเหตุเพิ่มเติม',
  `userID` varchar(10) NOT NULL COMMENT 'รหัสสมาชิก',
  `adminID` varchar(30) NOT NULL COMMENT 'admin ที่สร้างรายการ',
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(10,8) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_address_main ────
CREATE TABLE `tb_address_main` (
  `ID` bigint(20) NOT NULL,
  `addressID` bigint(20) NOT NULL,
  `userID` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_address_maomao_free ────
CREATE TABLE `tb_address_maomao_free` (
  `ID` bigint(20) NOT NULL,
  `datetime` datetime NOT NULL,
  `addressSubDistrict` varchar(255) NOT NULL COMMENT 'ตำบล',
  `addressDistrict` varchar(255) NOT NULL COMMENT 'อำเภอ',
  `addressProvince` varchar(255) NOT NULL COMMENT 'จังหวัด',
  `addressZIPCode` varchar(5) NOT NULL COMMENT 'รหัสไปรษณีย์',
  `userID` varchar(10) NOT NULL COMMENT 'รหัสสมาชิก',
  `adminID` varchar(30) NOT NULL COMMENT 'admin ที่สร้างรายการ'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


