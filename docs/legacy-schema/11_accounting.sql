-- ============================================================
-- 11 — Accounting (bill / receipt / shop_pay)
-- ============================================================
-- Customer-visible bills + receipts. Shared with admin side.
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_account_pcs ────
CREATE TABLE `tb_account_pcs` (
  `ID` bigint(20) NOT NULL,
  `bankName` varchar(300) NOT NULL,
  `accountNumber` varchar(300) NOT NULL,
  `accountName` varchar(300) NOT NULL,
  `adminID` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_bill ────
CREATE TABLE `tb_bill` (
  `billID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `printStatus` varchar(1) NOT NULL,
  `adminID` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_bill_item ────
CREATE TABLE `tb_bill_item` (
  `ID` bigint(20) NOT NULL,
  `billID` bigint(20) NOT NULL,
  `fID` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_receipt ────
CREATE TABLE `tb_receipt` (
  `ID` bigint(20) NOT NULL,
  `rStatus` varchar(1) NOT NULL DEFAULT '3',
  `rID` varchar(20) NOT NULL COMMENT 'PCS221002-1',
  `refID` varchar(50) NOT NULL COMMENT 'เลขอ้างอิง เช่น ใบแจ้งหนี้',
  `rDateCreate` datetime NOT NULL COMMENT 'วันที่สร้าง',
  `rDate` datetime NOT NULL COMMENT '	วันเวลาที่ทำรายการผ่านระบบ pcs wallet',
  `issueDate` datetime NOT NULL COMMENT 'วันที่ออกเอกสาร',
  `rAmount` decimal(10,2) NOT NULL COMMENT 'ยอดที่จ่ายจริงมา ยอดหลังหัก ณ ที่จ่าย',
  `totalBeforeWithholding` decimal(10,2) NOT NULL COMMENT 'ยอดก่อน หัก ณ ที่จ่าย',
  `adminID` varchar(30) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `statusPrint` varchar(1) NOT NULL COMMENT '1=print แล้ว',
  `adminIDprint` varchar(30) NOT NULL,
  `rDatePrint` datetime DEFAULT NULL,
  `statusPrintCopy` varchar(1) NOT NULL,
  `rDatePrintCopy` datetime DEFAULT NULL,
  `adminIDprintCopy` varchar(30) NOT NULL,
  `reCompNumber` varchar(13) NOT NULL,
  `reCompName` varchar(300) NOT NULL,
  `reCompAddress` text NOT NULL,
  `rPopup` varchar(1) NOT NULL COMMENT '1=กดดู popup แล้ว',
  `corporateType` varchar(1) NOT NULL COMMENT '1=ลูกค้าบริษัท, 2=ลูกค้าทั่วไป',
  `documentIssuer` varchar(300) NOT NULL COMMENT 'ผู้ออกเอกสารเอาชื่อ-นามสกุลมาเลย',
  `documentApprover` varchar(300) NOT NULL COMMENT 'ผู้อนุมัติเอกสารเอาชื่อ-นามสกุลมาเลย',
  `refWHID` bigint(20) DEFAULT NULL COMMENT 'อ้างอิงรายการเติมเงิน'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_receipt_item ────
CREATE TABLE `tb_receipt_item` (
  `ID` bigint(20) NOT NULL,
  `rID` varchar(30) NOT NULL,
  `fID` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_shop_pay_h ────
CREATE TABLE `tb_shop_pay_h` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `dateUpdate` datetime NOT NULL,
  `amount` decimal(10,2) NOT NULL COMMENT 'จำนวนที่โอน',
  `title` varchar(300) NOT NULL,
  `status` varchar(1) NOT NULL COMMENT '1=รอดำเนินการ, 2=สำเร็จ',
  `adminIDCreate` varchar(30) NOT NULL COMMENT 'แอดมินสร้างรายการ',
  `nameBank` varchar(2) NOT NULL COMMENT 'ธนาคารปลายทางที่รับเงิน',
  `nameUserBank` varchar(200) NOT NULL COMMENT 'ชื่อบัญชีรับเงินคืน',
  `noUserBank` varchar(200) NOT NULL COMMENT 'เลขที่บัญชีโอนเงินคืน',
  `imagesSlip` varchar(300) NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL COMMENT 'แอดมินทำรายการ'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_shop_pay_sub ────
CREATE TABLE `tb_shop_pay_sub` (
  `ID` bigint(20) NOT NULL,
  `hNo` varchar(30) NOT NULL,
  `sphID` bigint(20) NOT NULL,
  `hCostAllTH` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


