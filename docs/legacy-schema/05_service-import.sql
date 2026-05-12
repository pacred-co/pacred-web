-- ============================================================
-- 05 — Service-Import (Forwarder ฝากนำเข้า)
-- ============================================================
-- tb_forwarder (50+ cols!) + item + img + status log + check_forwarder. Largest customer-side domain.
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_forwarder ────
CREATE TABLE `tb_forwarder` (
  `ID` bigint(20) NOT NULL,
  `fDate` datetime NOT NULL COMMENT 'วันที่สร้าง',
  `fStatus` varchar(2) NOT NULL DEFAULT '1',
  `paydeposit` varchar(1) DEFAULT NULL COMMENT '1 คือ รอตรวจสอบการจ่ายเงิน',
  `fPallet` varchar(100) DEFAULT NULL,
  `fDateStatus2` datetime DEFAULT NULL,
  `fDateStatus3` datetime DEFAULT NULL,
  `fDateStatus4` datetime DEFAULT NULL COMMENT 'สินค้าเข้าโกดังไทย',
  `fDateStatus5` datetime DEFAULT NULL,
  `fDateStatus6` datetime DEFAULT NULL,
  `fDateStatus7` datetime DEFAULT NULL,
  `fStatusCarOn` varchar(1) DEFAULT NULL COMMENT 'สถานะรายการขึ้นรถ: ',
  `fStatusCarDateOn` datetime DEFAULT NULL,
  `fStatusCarAdminOn` varchar(10) NOT NULL,
  `fStatusCarOff` varchar(1) NOT NULL,
  `fStatusCarDateOff` datetime DEFAULT NULL,
  `fStatusCarAdminOff` varchar(10) NOT NULL,
  `printStatus1` varchar(1) NOT NULL DEFAULT '0' COMMENT '0=ยังไม่พิมพ์,1=พิมพ์แล้ว	',
  `printStatus2` varchar(1) NOT NULL DEFAULT '0' COMMENT '0=ยังไม่พิมพ์,1=พิมพ์แล้ว',
  `printStatus3` varchar(1) NOT NULL DEFAULT '0' COMMENT '0=ยังไม่พิมพ์,1=พิมพ์แล้ว',
  `printStatus4` varchar(1) NOT NULL,
  `fDateKey` datetime NOT NULL COMMENT 'วันทีกรอกข้อมูลสินค้า',
  `fDateAdminStatus` datetime NOT NULL,
  `fDateBarcode` datetime NOT NULL,
  `fWarehouseChina` varchar(1) NOT NULL COMMENT '1=กวางโจว,2=อี้อู',
  `fWarehouseName` varchar(1) NOT NULL COMMENT 'โกดังรับของที่จีน\r\n1=แสง, 2=CTT, 3=MK, 4=MX, 5=JMF',
  `fTransportType` varchar(1) NOT NULL COMMENT 'รูปแบบการขนส่ง',
  `fCabinetNumber` varchar(300) NOT NULL,
  `fIDorCO` varchar(30) DEFAULT NULL,
  `fTrackingCHN` varchar(50) NOT NULL,
  `fTrackingCHN2` varchar(100) DEFAULT NULL,
  `fDateToThai` date NOT NULL,
  `fDateContainerClose` datetime DEFAULT NULL COMMENT 'วันที่ปิดตู้',
  `fShipBy` varchar(10) NOT NULL COMMENT 'รูปแบบการขนส่งไทย',
  `fFreeShipping` varchar(1) NOT NULL COMMENT '1=สั่งตอนโปรส่งฟรี พื้นที่ กทม',
  `fTrackingTH` varchar(50) NOT NULL DEFAULT '-',
  `fAmount` int(11) NOT NULL DEFAULT 1 COMMENT 'จำนวนกล่อง',
  `fAmountCount` varchar(1) DEFAULT NULL COMMENT 'รวมกล่อง',
  `fDetail` text NOT NULL,
  `fNote` text DEFAULT NULL,
  `fNoteUser` varchar(1) NOT NULL,
  `fNoteUserRead` varchar(1) NOT NULL,
  `fNoteDate` datetime DEFAULT NULL,
  `fCover` varchar(500) NOT NULL,
  `fIMG1` varchar(40) DEFAULT NULL,
  `fIMG2` varchar(40) DEFAULT NULL,
  `fIMG3` varchar(40) DEFAULT NULL,
  `fIMG4` varchar(40) DEFAULT NULL,
  `fPhotoEnd` varchar(200) NOT NULL,
  `fProductsType` varchar(1) NOT NULL,
  `fProductsType2` varchar(1) DEFAULT NULL,
  `fWeight` decimal(10,2) NOT NULL,
  `fWidth` decimal(10,2) NOT NULL,
  `fLength` decimal(10,2) NOT NULL,
  `fHeight` decimal(10,2) NOT NULL,
  `fVolume` decimal(10,5) NOT NULL,
  `customRateKG` decimal(10,2) NOT NULL,
  `customRateCBM` decimal(10,2) NOT NULL,
  `customRate` varchar(1) NOT NULL DEFAULT '0' COMMENT '0=คิดตามปกติ,1=กำหนดเอง',
  `fRefPrice` varchar(1) NOT NULL,
  `fRefRate` decimal(10,2) NOT NULL,
  `fCostRefRate` decimal(10,2) NOT NULL,
  `fTransportPrice` decimal(10,2) NOT NULL COMMENT 'ค่าขนส่งในไทย',
  `fTransportPriceSum` varchar(1) DEFAULT NULL COMMENT '1=คิดรวมรายการอื่น',
  `fPriceUpdate` decimal(10,2) NOT NULL,
  `fDiscount` decimal(10,2) NOT NULL COMMENT 'ส่วนลด',
  `fShippingService` decimal(10,2) DEFAULT 0.00 COMMENT 'ค่าบริการฝากนำเข้า',
  `fTotalPrice` decimal(10,2) NOT NULL,
  `fCostTotalPrice` decimal(10,2) NOT NULL COMMENT 'ต้นทุนขนส่ง',
  `fCostTotalPriceSheet` decimal(10,2) NOT NULL COMMENT 'ต้นทุนจากSheet',
  `fProfitTransportCHN` decimal(10,2) NOT NULL COMMENT 'กำไรค่าขนส่งจีน',
  `fProfitPriceUpdate` decimal(10,2) NOT NULL COMMENT 'กำไร เพิ่ม/ลด เงิน',
  `fProfitTotal` decimal(10,2) NOT NULL COMMENT 'กำไรสุทธิ',
  `fAddressName` varchar(200) NOT NULL,
  `fAddressLastname` varchar(200) NOT NULL,
  `fAddressNo` varchar(255) NOT NULL,
  `fAddressSubDistrict` varchar(255) NOT NULL,
  `fAddressDistrict` varchar(255) NOT NULL,
  `fAddressProvince` varchar(255) NOT NULL,
  `fAddressZIPCode` varchar(5) NOT NULL,
  `fAddressNote` text NOT NULL,
  `fAddressTel` varchar(10) NOT NULL,
  `fAddressTel2` varchar(10) NOT NULL,
  `fAddressLatitude` decimal(10,8) NOT NULL,
  `fAddressLongitude` decimal(10,8) NOT NULL,
  `userID` varchar(10) NOT NULL,
  `adminID` varchar(10) NOT NULL,
  `adminIDCreator` varchar(10) NOT NULL,
  `adminIDKey` varchar(10) NOT NULL COMMENT 'คนkey กล่อง',
  `fLockDate` datetime NOT NULL,
  `adminIDUpdate` varchar(10) NOT NULL,
  `session` varchar(100) NOT NULL,
  `refOrder` varchar(30) NOT NULL,
  `fCredit` varchar(1) NOT NULL,
  `fCreditDate` datetime DEFAULT NULL,
  `fUserCompany` varchar(1) NOT NULL COMMENT 'นค บริษัท',
  `fSendSMS1Day` varchar(1) NOT NULL,
  `fSendSMS3Day` varchar(1) NOT NULL,
  `fSendSMS3EDay` varchar(1) NOT NULL,
  `payMethod` varchar(1) NOT NULL DEFAULT '1' COMMENT 'วิธีเก็บเงิน 1=ต้นทาง 2=ปลายทาง',
  `crate` varchar(1) NOT NULL DEFAULT '2' COMMENT '1=ตีลัง',
  `priceCrate` decimal(10,2) NOT NULL,
  `fQC` varchar(1) NOT NULL COMMENT '1=ไม่ตรวจนับ, 2=ตรวจนับ',
  `fQCPrice` decimal(10,2) NOT NULL COMMENT 'ค่า QC สินค้า',
  `fTransportPriceCHNTHB` decimal(10,2) NOT NULL COMMENT 'ค่าขนส่งจีน บาท',
  `priceMore` varchar(1) NOT NULL COMMENT '1=ค่าตีลังไม้,2=ค่าขนส่งจีน',
  `priceOther` decimal(10,2) NOT NULL COMMENT 'ค่าอื่นๆ qp',
  `linkAPIOrder` varchar(1) NOT NULL COMMENT 'การเชื่อมต่อผ่าน API 1 = JMF',
  `smPCS` varchar(255) DEFAULT NULL COMMENT 'สำรองเชื่อม sm',
  `subUserID` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_forwarder_item ────
CREATE TABLE `tb_forwarder_item` (
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
  `productCBMPerItem` decimal(10,2) NOT NULL,
  `productCBMAll` decimal(10,2) NOT NULL,
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
  `locationWTH` varchar(20) NOT NULL,
  `otherServiceFee` decimal(10,2) NOT NULL COMMENT 'ค่าบริการอื่น ๆ',
  `thailandDeliveryFee` decimal(10,2) NOT NULL COMMENT 'ค่าขนส่งในไทย',
  `fRefPrice` varchar(1) NOT NULL COMMENT 'คิดเรทนำเข้าตาม 1=น้ำหนัก 2=ปริมาตร',
  `fQC` varchar(1) NOT NULL COMMENT '	1=ไม่ตรวจนับ, 2=ตรวจนับ',
  `fQCPrice` decimal(10,2) NOT NULL COMMENT 'ค่า QC สินค้า',
  `fPriceUpdate` decimal(10,2) NOT NULL COMMENT 'ราคาที่เก็บเพิ่มมาจากฝากนำเข้า',
  `fDiscount` decimal(10,2) NOT NULL COMMENT 'ส่วนลด'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ──── tb_forwarder_img ────
CREATE TABLE `tb_forwarder_img` (
  `ID` bigint(20) NOT NULL,
  `img` varchar(255) NOT NULL,
  `fID` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_log_forwarder_status ────
CREATE TABLE `tb_log_forwarder_status` (
  `ID` bigint(20) NOT NULL,
  `fID` bigint(20) NOT NULL,
  `fStatusOld` varchar(2) NOT NULL,
  `fStatusNew` varchar(2) NOT NULL,
  `adminIDChange` varchar(50) NOT NULL,
  `fDateChange` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_check_forwarder ────
CREATE TABLE `tb_check_forwarder` (
  `ID` bigint(20) NOT NULL,
  `cfStatus` varchar(1) NOT NULL,
  `fID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `adminID` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


