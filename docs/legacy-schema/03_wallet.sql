-- ============================================================
-- 03 — Wallet (รวม credit/cashback/withdraw)
-- ============================================================
-- Pacred wallet ledger — merges 4 legacy variants (normal/credit/cashback/paydeposit)
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_wallet ────
CREATE TABLE `tb_wallet` (
  `userID` varchar(10) NOT NULL COMMENT 'รหัสสมาชิก',
  `walletTotal` decimal(10,2) DEFAULT 0.00 COMMENT 'ยอดเงินกระเป่า'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_wallet_hs ────
CREATE TABLE `tb_wallet_hs` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL COMMENT 'วันที่ทำรายการ',
  `dateSlip` datetime DEFAULT NULL COMMENT 'วันที่โอนในสลิป ฝาก',
  `amount` decimal(10,2) NOT NULL COMMENT 'จำนวนเงิน',
  `status` varchar(1) DEFAULT NULL COMMENT '1=รอดำเนินการ,2=สำเร็จ,3=ไม่สำเร็จ',
  `type` varchar(1) DEFAULT NULL COMMENT '1=รายการเติมเงิน,2=รายการชำระเงินฝากสั่ง,3=รายการถอนเงิน,4=รายการชำระเงินฝากนำเข้า,5=รายการคืนเงิน,6=ชำระเงินฝากโอน,7=ชำระเงินรอตรวจสอบการเติม',
  `typeNew` varchar(1) NOT NULL COMMENT '1=เติมเงิน,2=คืนเงิน,3=ชำระฝากสั่ง,4=ชำระฝากสั่งเติมเพิ่ม,5=ชำระนำเข้า,6=ชำระเงินนำเข้าเติมเพิ่ม, 7=ชำระเงินฝากโอน',
  `typeService` varchar(1) NOT NULL COMMENT '1=ฝากสั่งซื้อ, 2=ฝากนำเข้า, 3=ฝากโอน',
  `paydeposit` varchar(1) DEFAULT NULL COMMENT 'รายการเติมพร้อมชำระ',
  `adminCreate` varchar(20) DEFAULT NULL,
  `imagesSlip` varchar(150) DEFAULT NULL COMMENT 'ชื่อไฟล์สลิป ฝาก หรือ ถอน',
  `depositNameBank` varchar(100) DEFAULT NULL COMMENT 'ธนาคารปลายทางที่รับเงิน',
  `nameUserBank` varchar(200) DEFAULT NULL COMMENT 'ชื่อบัญชีรับเงินคืน',
  `noUserBank` varchar(200) DEFAULT NULL COMMENT 'เลขที่บัญชีโอนเงินคืน',
  `note` text DEFAULT NULL,
  `adminID` varchar(20) DEFAULT NULL COMMENT 'adminเปิดรายการ',
  `adminIDUpdate` varchar(20) DEFAULT NULL COMMENT 'แอดมินทำรายการ',
  `LockDate` datetime DEFAULT current_timestamp() COMMENT 'เวลาห้ามเปิดรายการซ้ำ',
  `session` varchar(100) DEFAULT NULL COMMENT 'เครื่องที่มาเปิดตอนนั้น',
  `refOrder` varchar(30) DEFAULT NULL COMMENT 'อ้างอิงรายการตามสถานะ รายการฝากชำระเงินเลขที่ รายการถอนเงิน',
  `refOrder2` bigint(20) DEFAULT NULL COMMENT 'อ้างอิงการเติมพร้อมชำระ\r\n',
  `whNo` varchar(30) NOT NULL,
  `wUserCredit` varchar(1) NOT NULL,
  `userID` varchar(20) NOT NULL,
  `adminIDCrate` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_cash_back ────
CREATE TABLE `tb_cash_back` (
  `userID` varchar(10) NOT NULL,
  `cbTotal` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_cash_back_hs ────
CREATE TABLE `tb_cash_back_hs` (
  `cbhID` bigint(20) NOT NULL,
  `cbhDate` datetime NOT NULL,
  `cbhStatus` varchar(1) NOT NULL COMMENT '1=บวกเพิ่ม,2=ชำระเงิน',
  `cbhAmount` decimal(10,2) NOT NULL,
  `userID` varchar(10) NOT NULL,
  `cbhRefID` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_credit ────
CREATE TABLE `tb_credit` (
  `userID` varchar(10) NOT NULL,
  `creditValue` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_wallet_paydeposit ────
CREATE TABLE `tb_wallet_paydeposit` (
  `ID` bigint(20) NOT NULL,
  `whID` bigint(20) NOT NULL,
  `hNo` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


