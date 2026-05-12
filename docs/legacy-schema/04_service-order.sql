-- ============================================================
-- 04 — Service-Order (ฝากสั่งซื้อสินค้าจากจีน, cart→shops)
-- ============================================================
-- Cart + order header (hNo ONS{YYMMDD}-{seq}) + line items + promotion
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_cart ────
CREATE TABLE `tb_cart` (
  `ID` int(11) NOT NULL,
  `cDetails` text NOT NULL,
  `cURL` varchar(300) NOT NULL,
  `cTitle` varchar(300) NOT NULL,
  `cNameShop` varchar(300) NOT NULL DEFAULT 'pcs' COMMENT 'pcs=ไม่มีชื่อร้าน',
  `cProvider` varchar(1) NOT NULL DEFAULT '4',
  `cImages` varchar(300) NOT NULL,
  `cPrice` decimal(10,2) NOT NULL,
  `cAmount` int(11) NOT NULL,
  `cColor` varchar(200) NOT NULL,
  `cSize` varchar(200) NOT NULL,
  `userID` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_header_order ────
CREATE TABLE `tb_header_order` (
  `ID` bigint(20) NOT NULL,
  `hStatus` varchar(1) NOT NULL DEFAULT '1' COMMENT '1=รอดำเนินการ 2=รอชำระเงิน 3=สั่งสินค้า 4=รอร้านจีนจัดส่ง 5=สำเร็จ 6=ยกเลิกออเดอร์',
  `hShopPay` varchar(1) DEFAULT NULL COMMENT '1=จ่ายเงินแล้ว',
  `paydeposit` varchar(1) DEFAULT NULL COMMENT '1 คือ รอตรวจสอบการจ่ายเงิน',
  `hNo` varchar(30) NOT NULL,
  `hTitle` varchar(300) NOT NULL,
  `hCover` varchar(500) NOT NULL,
  `hCount` int(11) NOT NULL,
  `hDate` datetime NOT NULL,
  `hDate2` datetime DEFAULT NULL COMMENT 'รอชำระเงิน',
  `hDate3` datetime DEFAULT NULL COMMENT 'สั่งสินค้า',
  `hDate4` datetime DEFAULT NULL COMMENT 'รอร้านจีนจัดส่ง',
  `hDate5` datetime DEFAULT NULL COMMENT 'สำเร็จ',
  `hDateUpdate` datetime NOT NULL,
  `hDatePayment` datetime NOT NULL,
  `hTransportType` varchar(1) NOT NULL,
  `hTotalPriceCHN` decimal(10,2) NOT NULL,
  `hTotalPriceUser` decimal(10,2) NOT NULL,
  `hShippingService` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'ค่าบริการ 50 บาท',
  `hShippingCHN` decimal(10,2) NOT NULL COMMENT 'ค่าขนส่งจีน',
  `hPriceUpdate` decimal(10,2) NOT NULL,
  `hRate` decimal(10,2) NOT NULL,
  `hRateCost` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'เรทต้นทุน',
  `hCostAll` decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'ราคาซื้อจริง',
  `hCostAllTH` decimal(10,2) NOT NULL DEFAULT 0.00,
  `hNote` text NOT NULL,
  `hNoteUser` varchar(1) NOT NULL COMMENT '1=ยังไม่อ่าน,2or null อ่านแล้ว',
  `hNoteUserRead` varchar(1) NOT NULL,
  `hNoteDate` datetime DEFAULT NULL,
  `hPrintBill2` varchar(1) NOT NULL COMMENT 'ใบแจ้งหนี้',
  `hShipBy` varchar(10) NOT NULL COMMENT 'บริษัทขนส่งในไทย F=ฟรี',
  `hFreeShipping` varchar(1) NOT NULL COMMENT '1=สั่งซื้อช่วงจัดส่งฟรี',
  `hWarehouseChina` varchar(1) DEFAULT NULL COMMENT '1=อี้อู,2=กวางโจว',
  `hAddressName` varchar(200) NOT NULL,
  `hAddressLastname` varchar(200) NOT NULL,
  `hAddressNo` varchar(255) NOT NULL,
  `hAddressSubDistrict` varchar(255) NOT NULL,
  `hAddressDistrict` varchar(255) NOT NULL,
  `hAddressProvince` varchar(255) NOT NULL,
  `hAddressZIPCode` varchar(5) NOT NULL,
  `hAddressNote` text NOT NULL,
  `hAddressTel` varchar(10) NOT NULL,
  `hAddressTel2` varchar(10) NOT NULL,
  `hPrintBill` varchar(1) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `adminIDCreate` varchar(10) DEFAULT NULL,
  `adminID` varchar(10) NOT NULL,
  `hLockDate` datetime NOT NULL,
  `adminIDUpdate` varchar(10) NOT NULL,
  `session` varchar(100) NOT NULL,
  `payMethod` varchar(1) NOT NULL COMMENT 'วิธีเก็บเงิน 1=ต้นทาง 2=ปลายทาง',
  `crate` varchar(1) NOT NULL COMMENT '1=ตีลัง',
  `fShippingService` decimal(10,2) NOT NULL,
  `adminIDIP` varchar(30) NOT NULL COMMENT 'ล่ามจีนที่ดูแล'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_order ────
CREATE TABLE `tb_order` (
  `ID` int(11) NOT NULL,
  `cDetails` text NOT NULL,
  `cURL` varchar(300) NOT NULL,
  `cTitle` varchar(300) NOT NULL,
  `cNameShop` varchar(300) NOT NULL DEFAULT 'pcs' COMMENT 'pcs=ไม่มีชื่อร้าน',
  `cProvider` varchar(1) NOT NULL DEFAULT '4',
  `cImages` varchar(300) NOT NULL,
  `cPrice` decimal(10,2) NOT NULL,
  `cShippingCHN` decimal(10,2) NOT NULL,
  `cPriceUpdate` decimal(10,2) NOT NULL,
  `cAmount` int(11) NOT NULL,
  `cColor` varchar(200) NOT NULL,
  `cSize` varchar(200) NOT NULL,
  `userID` varchar(10) NOT NULL,
  `hNo` varchar(30) NOT NULL,
  `cShippingNumber` varchar(500) NOT NULL,
  `cTrackingNumber` varchar(200) NOT NULL,
  `cReWallet` varchar(1) NOT NULL,
  `cNote` varchar(255) NOT NULL,
  `hWarehouseName` varchar(1) NOT NULL COMMENT 'โกดังรับของที่จีน 1=แสง, 2=CTT, 3=MK, 4=MX, 5=JMF',
  `hCrate` varchar(1) NOT NULL DEFAULT '2' COMMENT '1=ตีลัง',
  `hQC` varchar(1) NOT NULL COMMENT '1=ไม่ตรวจนับ, 2=ตรวจนับ'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_promotion ────
CREATE TABLE `tb_promotion` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `promoID` bigint(20) NOT NULL,
  `fID` bigint(20) NOT NULL,
  `hNo` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


