-- ============================================================
-- 01 — Auth & Users
-- ============================================================
-- tb_users (core profile) + tb_register (legacy signup data) + tb_corporate (juristic) + OTP tables + terms_service + pcs_logged sessions
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_users ────
CREATE TABLE `tb_users` (
  `ID` bigint(20) NOT NULL,
  `userID` varchar(10) NOT NULL COMMENT 'รหัสสมาชิก',
  `userTel` varchar(13) NOT NULL COMMENT 'เบอร์โทร',
  `userStatus` varchar(1) NOT NULL DEFAULT '1' COMMENT 'สถานะการใช้งานบัญชี_1=ใช้งาน,0=ลบบัญชี',
  `userPass` varchar(80) NOT NULL COMMENT 'รหัสผ่านเข้าสู่ระบบ',
  `pcs_logged` varchar(80) DEFAULT NULL,
  `userName` varchar(200) NOT NULL COMMENT 'ชื่อจริง',
  `userLastName` varchar(200) NOT NULL COMMENT 'นามสกุล',
  `userEmail` varchar(100) DEFAULT NULL COMMENT 'อีเมล',
  `userLineID` varchar(50) DEFAULT NULL COMMENT 'ไอดีไลน์',
  `userFacebook` varchar(255) DEFAULT NULL COMMENT 'ลิงก์เฟสบุ๊ก',
  `userRegistered` datetime NOT NULL COMMENT 'วันที่สมัครใช้งาน',
  `userSex` varchar(10) DEFAULT NULL COMMENT 'เพศ Null=ไม่ระบุ,1=ชาย,2=หญิง,3=เพศทางเลือก',
  `userBirthday` date DEFAULT NULL COMMENT 'วันเกิด',
  `userLastLogin` datetime DEFAULT NULL COMMENT 'เวลาล็อกอินล่าสุด',
  `userRegisterWith` varchar(3) DEFAULT NULL COMMENT 'วิธีสมัครสมาชิก PCS=สมาชิกในระบบ,F=เฟสบุ๊ก,L=ไลน์',
  `userPicture` varchar(150) NOT NULL DEFAULT 'user.jpg',
  `userRecoverKey` varchar(30) DEFAULT NULL COMMENT 'ตัวเลขขอรีเซ็ตรหัสผ่าน',
  `userRecoverDate` datetime DEFAULT NULL COMMENT 'วันที่ขอรีเซ็ต',
  `coID` varchar(10) NOT NULL DEFAULT 'PCS' COMMENT 'กลุ่มลูกค้า PCS=ลูกค้าทั่วไป',
  `adminID` varchar(20) DEFAULT NULL COMMENT 'admin ที่สร้างบัญชีนี้',
  `adminIDSale` varchar(20) DEFAULT NULL,
  `userLineNotify` varchar(80) NOT NULL,
  `userCompany` varchar(1) NOT NULL,
  `userComparison` varchar(1) NOT NULL,
  `userComparisonValue` decimal(10,2) NOT NULL,
  `userCredit` varchar(1) NOT NULL,
  `userCreditValue` decimal(10,2) NOT NULL,
  `userCreditDate` int(11) NOT NULL,
  `shopUser` varchar(1) NOT NULL COMMENT '1=ซื้อไปใข้เอง',
  `channel` varchar(2) NOT NULL,
  `userRecom` varchar(20) NOT NULL,
  `userAddressID` varchar(20) NOT NULL,
  `userTransportType` varchar(1) NOT NULL,
  `userShipBy` varchar(20) NOT NULL,
  `userPayMethod` varchar(1) NOT NULL COMMENT 'วิธีเก็บเงิน 1=ต้นทาง 2=ปลายทาง',
  `userNote` text NOT NULL,
  `userActive` varchar(1) NOT NULL COMMENT '1=ใช้งานแล้ว',
  `userLineIDOA` varchar(50) NOT NULL COMMENT 'user_line_id',
  `companyCustomer` varchar(1) NOT NULL COMMENT '1=seafreight,2=cargo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_register ────
CREATE TABLE `tb_register` (
  `ID` bigint(20) NOT NULL,
  `type` varchar(1) NOT NULL COMMENT '1=ทั่วไป,2=นิติบุคคล ',
  `corporateNumber` varchar(13) NOT NULL,
  `corporateName` varchar(300) NOT NULL,
  `corporateAddress` text NOT NULL,
  `corporateFile` varchar(200) NOT NULL COMMENT 'หนังสือรับรอง',
  `corporateFile20` varchar(200) NOT NULL COMMENT 'ภพ20',
  `userTel` varchar(13) NOT NULL,
  `userPass` varchar(80) NOT NULL,
  `userName` varchar(200) NOT NULL,
  `userLastName` varchar(200) NOT NULL,
  `userEmail` varchar(100) NOT NULL,
  `shopUser` varchar(1) NOT NULL COMMENT '1=ซื้อไปใข้เอง',
  `channel` varchar(2) NOT NULL COMMENT 'รู้จักเราจากช่องทางใด',
  `userRegistered` datetime NOT NULL,
  `userRegisterWith` varchar(3) NOT NULL COMMENT 'วิธีสมัครสมาชิก PCS=สมาชิกในระบบ,F=เฟสบุ๊ก,L=ไลน์	',
  `coID` varchar(10) NOT NULL DEFAULT 'PCS' COMMENT '	กลุ่มลูกค้า PCS=ลูกค้าทั่วไป',
  `adminIDSale` varchar(30) NOT NULL,
  `userPicture` varchar(150) NOT NULL DEFAULT 'user.jpg',
  `userRecom` varchar(20) NOT NULL,
  `token` varchar(40) NOT NULL,
  `refno` varchar(20) NOT NULL,
  `pin` varchar(10) NOT NULL COMMENT 'OTP'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_corporate ────
CREATE TABLE `tb_corporate` (
  `ID` bigint(20) NOT NULL,
  `userID` varchar(10) NOT NULL,
  `corporateNumber` varchar(13) NOT NULL,
  `corporateName` varchar(300) NOT NULL,
  `corporateAddress` text NOT NULL,
  `corporateFile` varchar(200) NOT NULL,
  `corporateFile20` varchar(200) NOT NULL,
  `cpDateCreate` datetime NOT NULL DEFAULT current_timestamp(),
  `corporateStatus` varchar(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_users_otp ────
CREATE TABLE `tb_users_otp` (
  `ID` bigint(20) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `date` datetime NOT NULL COMMENT 'วันที่ยืนยันตัวตน'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_users_otp_hs ────
CREATE TABLE `tb_users_otp_hs` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `userID` varchar(30) NOT NULL,
  `tel` varchar(12) NOT NULL,
  `type` varchar(1) NOT NULL COMMENT '1=ยืนยันตัวตนสมัครใหม่,2=ยืนยันตัวตนลูกค้าเดิม,3=ขอรหัสผ่านใหม่,4=เปลี่ยนเบอร์',
  `IP` varchar(45) NOT NULL,
  `refno` varchar(20) NOT NULL,
  `token` varchar(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_otp_check ────
CREATE TABLE `tb_otp_check` (
  `ID` bigint(20) NOT NULL,
  `userTel` varchar(15) NOT NULL,
  `pin` varchar(10) NOT NULL,
  `token` varchar(40) NOT NULL,
  `refno` varchar(20) NOT NULL,
  `date` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_pcs_logged ────
CREATE TABLE `tb_pcs_logged` (
  `ID` bigint(20) NOT NULL,
  `pcs_logged` text NOT NULL,
  `userID` varchar(50) NOT NULL,
  `basePath` text NOT NULL,
  `test` varchar(2) NOT NULL,
  `path` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_terms_service ────
CREATE TABLE `tb_terms_service` (
  `ID` bigint(20) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `date` datetime NOT NULL COMMENT 'เวลากดยอมรับเงื่อนไข',
  `version` varchar(20) NOT NULL COMMENT 'เวอร์ชันของเงื่อนไขการใช้บริการ'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


