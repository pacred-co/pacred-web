-- ============================================================
-- 10 — Rates & Settings (shared backbone for forwarder/cart pricing)
-- ============================================================
-- General/VIP/Custom rate tables (KG + CBM) + HS code rate + co (customer groups) + settings (singleton config)
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_co ────
CREATE TABLE `tb_co` (
  `ID` int(11) NOT NULL,
  `coStatus` varchar(1) NOT NULL DEFAULT '1',
  `coID` varchar(10) NOT NULL,
  `coName` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_settings ────
CREATE TABLE `tb_settings` (
  `ID` int(11) NOT NULL,
  `rgDefault` decimal(10,2) NOT NULL,
  `rsDefault` decimal(10,2) NOT NULL,
  `rpDefault` decimal(10,2) NOT NULL,
  `hRateCostDefault` decimal(10,2) DEFAULT NULL COMMENT 'ต้นทุนเรทตั้งต้น',
  `hRateCostSale` decimal(10,2) NOT NULL,
  `numberPaymemt` varchar(1000) NOT NULL,
  `freeShipping` varchar(1) NOT NULL,
  `fCostCar1Default` decimal(10,2) NOT NULL,
  `fCostCar2Default` decimal(10,2) NOT NULL,
  `fCostCar3Default` decimal(10,2) NOT NULL,
  `fCostCar4Default` decimal(10,2) NOT NULL,
  `fCostCar1Default2` decimal(10,2) NOT NULL DEFAULT 0.00,
  `fCostCar2Default2` decimal(10,2) NOT NULL DEFAULT 0.00,
  `fCostCar3Default2` decimal(10,2) NOT NULL DEFAULT 0.00,
  `fCostCar4Default2` decimal(10,2) NOT NULL DEFAULT 0.00,
  `fCostShip1Default` decimal(10,2) NOT NULL,
  `fCostShip2Default` decimal(10,2) NOT NULL,
  `fCostShip3Default` decimal(10,2) NOT NULL,
  `fCostShip4Default` decimal(10,2) NOT NULL,
  `fCostShip1Default2` decimal(10,2) NOT NULL,
  `fCostShip2Default2` decimal(10,2) NOT NULL,
  `fCostShip3Default2` decimal(10,2) NOT NULL,
  `fCostShip4Default2` decimal(10,2) NOT NULL,
  `fCostCar1DefaultSang` decimal(10,2) NOT NULL,
  `fCostCar2DefaultSang` decimal(10,2) NOT NULL,
  `fCostCar3DefaultSang` decimal(10,2) NOT NULL,
  `fCostCar4DefaultSang` decimal(10,2) NOT NULL,
  `fCostShip1DefaultSang` decimal(10,2) NOT NULL,
  `fCostShip2DefaultSang` decimal(10,2) NOT NULL,
  `fCostShip3DefaultSang` decimal(10,2) NOT NULL,
  `fCostShip4DefaultSang` decimal(10,2) NOT NULL,
  `fCostCar1DefaultSang2` decimal(10,2) NOT NULL,
  `fCostCar2DefaultSang2` decimal(10,2) NOT NULL,
  `fCostCar3DefaultSang2` decimal(10,2) NOT NULL,
  `fCostCar4DefaultSang2` decimal(10,2) NOT NULL,
  `fCostShip1DefaultSang2` decimal(10,2) NOT NULL,
  `fCostShip2DefaultSang2` decimal(10,2) NOT NULL,
  `fCostShip3DefaultSang2` decimal(10,2) NOT NULL,
  `fCostShip4DefaultSang2` decimal(10,2) NOT NULL,
  `fCostCar1DefaultMKCargo` decimal(10,2) NOT NULL,
  `fCostCar2DefaultMKCargo` decimal(10,2) NOT NULL,
  `fCostCar3DefaultMKCargo` decimal(10,2) NOT NULL,
  `fCostCar4DefaultMKCargo` decimal(10,2) NOT NULL,
  `fCostShip1DefaultMKCargo` decimal(10,2) NOT NULL,
  `fCostShip2DefaultMKCargo` decimal(10,2) NOT NULL,
  `fCostShip3DefaultMKCargo` decimal(10,2) NOT NULL,
  `fCostShip4DefaultMKCargo` decimal(10,2) NOT NULL,
  `fCostCar1DefaultMKCargo2` decimal(10,2) NOT NULL,
  `fCostCar2DefaultMKCargo2` decimal(10,2) NOT NULL,
  `fCostCar3DefaultMKCargo2` decimal(10,2) NOT NULL,
  `fCostCar4DefaultMKCargo2` decimal(10,2) NOT NULL,
  `fCostShip1DefaultMKCargo2` decimal(10,2) NOT NULL,
  `fCostShip2DefaultMKCargo2` decimal(10,2) NOT NULL,
  `fCostShip3DefaultMKCargo2` decimal(10,2) NOT NULL,
  `fCostShip4DefaultMKCargo2` decimal(10,2) NOT NULL,
  `fCostCar1DefaultMXCargo` decimal(10,2) NOT NULL,
  `fCostCar2DefaultMXCargo` decimal(10,2) NOT NULL,
  `fCostCar3DefaultMXCargo` decimal(10,2) NOT NULL,
  `fCostCar4DefaultMXCargo` decimal(10,2) NOT NULL,
  `fCostShip1DefaultMXCargo` decimal(10,2) NOT NULL,
  `fCostShip2DefaultMXCargo` decimal(10,2) NOT NULL,
  `fCostShip3DefaultMXCargo` decimal(10,2) NOT NULL,
  `fCostShip4DefaultMXCargo` decimal(10,2) NOT NULL,
  `fCostCar1DefaultWMXCargo` decimal(10,2) NOT NULL,
  `fCostCar2DefaultWMXCargo` decimal(10,2) NOT NULL,
  `fCostCar3DefaultWMXCargo` decimal(10,2) NOT NULL,
  `fCostCar4DefaultWMXCargo` decimal(10,2) NOT NULL,
  `fCostShip1DefaultWMXCargo` decimal(10,2) NOT NULL,
  `fCostShip2DefaultWMXCargo` decimal(10,2) NOT NULL,
  `fCostShip3DefaultWMXCargo` decimal(10,2) NOT NULL,
  `fCostShip4DefaultWMXCargo` decimal(10,2) NOT NULL,
  `fCostCar1DefaultMXCargo2` decimal(10,2) NOT NULL,
  `fCostCar2DefaultMXCargo2` decimal(10,2) NOT NULL,
  `fCostCar3DefaultMXCargo2` decimal(10,2) NOT NULL,
  `fCostCar4DefaultMXCargo2` decimal(10,2) NOT NULL,
  `fCostShip1DefaultMXCargo2` decimal(10,2) NOT NULL,
  `fCostShip2DefaultMXCargo2` decimal(10,2) NOT NULL,
  `fCostShip3DefaultMXCargo2` decimal(10,2) NOT NULL,
  `fCostShip4DefaultMXCargo2` decimal(10,2) NOT NULL,
  `fCostCar1DefaultWMXCargo2` decimal(10,2) NOT NULL,
  `fCostCar2DefaultWMXCargo2` decimal(10,2) NOT NULL,
  `fCostCar3DefaultWMXCargo2` decimal(10,2) NOT NULL,
  `fCostCar4DefaultWMXCargo2` decimal(10,2) NOT NULL,
  `fCostShip1DefaultWMXCargo2` decimal(10,2) NOT NULL,
  `fCostShip2DefaultWMXCargo2` decimal(10,2) NOT NULL,
  `fCostShip3DefaultWMXCargo2` decimal(10,2) NOT NULL,
  `fCostShip4DefaultWMXCargo2` decimal(10,2) NOT NULL,
  `fCostCar1DefaultJMF` decimal(10,2) NOT NULL,
  `fCostCar2DefaultJMF2` decimal(10,2) NOT NULL,
  `fCostCar2DefaultJMF` decimal(10,2) NOT NULL,
  `fCostCar3DefaultJMF2` decimal(10,2) NOT NULL,
  `fCostCar3DefaultJMF` decimal(10,2) NOT NULL,
  `fCostCar4DefaultJMF2` decimal(10,2) NOT NULL,
  `fCostShip1DefaultJMF` decimal(10,2) NOT NULL,
  `fCostShip2DefaultJMF2` decimal(10,2) NOT NULL,
  `fCostShip2DefaultJMF` decimal(10,2) NOT NULL,
  `fCostShip3DefaultJMF2` decimal(10,2) NOT NULL,
  `fCostShip3DefaultJMF` decimal(10,2) NOT NULL,
  `fCostShip4DefaultJMF2` decimal(10,2) NOT NULL,
  `fCostShip4DefaultJMF` decimal(10,2) NOT NULL,
  `fCostShip1DefaultJMF2` decimal(10,2) NOT NULL,
  `fCostCar4DefaultJMF` decimal(10,2) NOT NULL,
  `fCostCar1DefaultJMF2` decimal(10,2) NOT NULL,
  `fCostCar1DefaultGOGO` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ ทั่วไป',
  `fCostCar2DefaultGOGO` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ มอก',
  `fCostCar3DefaultGOGO` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ อย',
  `fCostCar4DefaultGOGO` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ พิเศษ',
  `fCostCar1DefaultGOGO2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ ทั่วไป',
  `fCostCar2DefaultGOGO2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ มอก',
  `fCostCar3DefaultGOGO2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ อย',
  `fCostCar4DefaultGOGO2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ พิเศษ',
  `fCostShip1DefaultGOGO` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ ทั่วไป',
  `fCostShip2DefaultGOGO` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ มอก',
  `fCostShip3DefaultGOGO` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ อย',
  `fCostShip4DefaultGOGO` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ พิเศษ',
  `fCostShip1DefaultGOGO2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ ทั่วไป',
  `fCostShip2DefaultGOGO2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ มอก',
  `fCostShip3DefaultGOGO2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ อย',
  `fCostShip4DefaultGOGO2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ พิเศษ',
  `fCostCar1DefaultCargoCenter` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ ทั่วไป',
  `fCostCar2DefaultCargoCenter` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ มอก',
  `fCostCar3DefaultCargoCenter` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ อย',
  `fCostCar4DefaultCargoCenter` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ พิเศษ',
  `fCostCar1DefaultCargoCenter2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ ทั่วไป',
  `fCostCar2DefaultCargoCenter2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ มอก',
  `fCostCar3DefaultCargoCenter2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ อย',
  `fCostCar4DefaultCargoCenter2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางรถ พิเศษ',
  `fCostShip1DefaultCargoCenter` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ ทั่วไป',
  `fCostShip2DefaultCargoCenter` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ มอก',
  `fCostShip3DefaultCargoCenter` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ อย',
  `fCostShip4DefaultCargoCenter` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ พิเศษ',
  `fCostShip1DefaultCargoCenter2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ ทั่วไป',
  `fCostShip2DefaultCargoCenter2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ มอก',
  `fCostShip3DefaultCargoCenter2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ อย',
  `fCostShip4DefaultCargoCenter2` decimal(10,2) NOT NULL COMMENT 'กวางโจว ทางเรือ พิเศษ'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_customrate_hs ────
CREATE TABLE `tb_customrate_hs` (
  `ID` bigint(20) NOT NULL,
  `adminID` varchar(50) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  `date` datetime NOT NULL,
  `userID` varchar(30) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ──── tb_hs_rate_custom_cbm ────
CREATE TABLE `tb_hs_rate_custom_cbm` (
  `ID` bigint(20) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `sourceWarehouse` varchar(1) NOT NULL,
  `rTransportType` varchar(1) NOT NULL,
  `rProductsType` varchar(1) NOT NULL,
  `rCBMbefore` decimal(10,2) NOT NULL,
  `rCBM` decimal(10,2) NOT NULL,
  `adminIDUpdate` varchar(50) NOT NULL,
  `crhsID` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_hs_rate_custom_kg ────
CREATE TABLE `tb_hs_rate_custom_kg` (
  `ID` bigint(20) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `sourceWarehouse` varchar(1) NOT NULL,
  `rTransportType` varchar(1) NOT NULL,
  `rProductsType` varchar(1) NOT NULL,
  `rKGbefore` decimal(10,2) NOT NULL,
  `rKG` decimal(10,2) NOT NULL,
  `adminIDUpdate` varchar(50) NOT NULL,
  `crhsID` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_rate_custom_cbm ────
CREATE TABLE `tb_rate_custom_cbm` (
  `ID` int(11) NOT NULL,
  `userID` varchar(10) NOT NULL,
  `rTransportType` varchar(1) NOT NULL,
  `sourceWarehouse` varchar(1) NOT NULL,
  `rProductsType` varchar(1) NOT NULL,
  `rCBM` decimal(10,2) NOT NULL,
  `adminIDUpdate` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_rate_custom_kg ────
CREATE TABLE `tb_rate_custom_kg` (
  `ID` int(11) NOT NULL,
  `userID` varchar(10) NOT NULL,
  `sourceWarehouse` varchar(1) NOT NULL,
  `rTransportType` varchar(1) NOT NULL,
  `rProductsType` varchar(1) NOT NULL,
  `rKG` decimal(10,2) NOT NULL,
  `adminIDUpdate` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_rate_g_cbm ────
CREATE TABLE `tb_rate_g_cbm` (
  `ID` int(11) NOT NULL,
  `coID` varchar(10) NOT NULL,
  `sourceWarehouse` varchar(1) NOT NULL COMMENT 'โกดังต้นทาง : 1=กวางโจว,2=อี้อู',
  `rgTransportType` varchar(1) NOT NULL,
  `rgProductsType` varchar(1) NOT NULL,
  `rgCBM1` decimal(10,2) NOT NULL,
  `rgCBM2` decimal(10,2) NOT NULL,
  `rgCBM3` decimal(10,2) NOT NULL,
  `adminIDUpdate` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_rate_g_kg ────
CREATE TABLE `tb_rate_g_kg` (
  `ID` int(11) NOT NULL,
  `coID` varchar(10) NOT NULL,
  `sourceWarehouse` varchar(1) NOT NULL COMMENT 'โกดังต้นทาง : 1=กวางโจว,2=อี้อู',
  `rgTransportType` varchar(1) NOT NULL COMMENT 'ประเภทการขนส่ง 1=รถ,2=เรือ',
  `rgProductsType` varchar(1) NOT NULL,
  `rgKG1` decimal(10,2) NOT NULL,
  `rgKG2` decimal(10,2) NOT NULL,
  `rgKG3` decimal(10,2) NOT NULL,
  `adminIDUpdate` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_rate_vip_cbm ────
CREATE TABLE `tb_rate_vip_cbm` (
  `ID` int(11) NOT NULL,
  `coID` varchar(10) NOT NULL,
  `sourceWarehouse` varchar(1) NOT NULL,
  `rTransportType` varchar(1) NOT NULL,
  `rProductsType` varchar(1) NOT NULL,
  `rCBM` decimal(10,2) NOT NULL,
  `adminIDUpdate` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_rate_vip_kg ────
CREATE TABLE `tb_rate_vip_kg` (
  `ID` int(11) NOT NULL,
  `coID` varchar(10) NOT NULL,
  `sourceWarehouse` varchar(1) NOT NULL,
  `rTransportType` varchar(1) NOT NULL,
  `rProductsType` varchar(1) NOT NULL,
  `rKG` decimal(10,2) NOT NULL,
  `adminIDUpdate` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


