-- ============================================================
-- 23 — Organization & HR (admin)
-- ============================================================
-- Org contact directory + outsider contacts + education + job posts
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_organization_domainname ────
CREATE TABLE `tb_organization_domainname` (
  `ID` bigint(20) NOT NULL,
  `domain` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `pay_date` date DEFAULT NULL,
  `note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `adminIDCreate` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `date` datetime NOT NULL,
  `dateUpdate` datetime NOT NULL,
  `adminIDUpdate` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_organization_email ────
CREATE TABLE `tb_organization_email` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `dateUpdate` datetime NOT NULL,
  `email` varchar(255) NOT NULL,
  `emailTel` varchar(30) NOT NULL,
  `passEmail` varchar(255) NOT NULL,
  `emailType` varchar(1) NOT NULL COMMENT '1=ฟรี, 2=ซื้อ',
  `adminIDCreate` varchar(30) NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL,
  `note` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_organization_line ────
CREATE TABLE `tb_organization_line` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `dateUpdate` datetime NOT NULL,
  `line` varchar(255) NOT NULL,
  `emailLine` varchar(30) NOT NULL,
  `telLine` varchar(30) NOT NULL,
  `passLine` varchar(255) NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL,
  `note` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_organization_tell ────
CREATE TABLE `tb_organization_tell` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL COMMENT 'วันที่สร้าง',
  `dateUpdate` datetime NOT NULL COMMENT 'วันที่อัปเดต',
  `tell` varchar(20) NOT NULL COMMENT 'เบอร์โทร ตัดเครื่องหมายพืเศษออก',
  `nameEquipment` varchar(255) NOT NULL COMMENT 'ชื่ออุปกรณ์',
  `numberEquipment` varchar(255) NOT NULL COMMENT 'หมายเลขเครื่องโทรศัพท์',
  `adminIDCreate` varchar(30) NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL,
  `note` mediumtext NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_organization_wechat ────
CREATE TABLE `tb_organization_wechat` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `dateUpdate` datetime NOT NULL,
  `wechat` varchar(255) NOT NULL,
  `emailWechat` varchar(30) NOT NULL,
  `telWechat` varchar(30) NOT NULL,
  `passWechat` varchar(255) NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL,
  `note` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_org_email_ships ────
CREATE TABLE `tb_org_email_ships` (
  `ID` bigint(20) NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `oeID` bigint(20) NOT NULL COMMENT 'ID ตาราง tb_organization_email'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_org_line_ships ────
CREATE TABLE `tb_org_line_ships` (
  `ID` bigint(20) NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `olID` bigint(20) NOT NULL COMMENT 'ID ตาราง tb_organization_line'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_org_tell_ships ────
CREATE TABLE `tb_org_tell_ships` (
  `ID` bigint(20) NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `otID` bigint(20) NOT NULL COMMENT 'ID ตาราง tb_organization_tell'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_org_wechat_ships ────
CREATE TABLE `tb_org_wechat_ships` (
  `ID` bigint(20) NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `owcID` bigint(20) NOT NULL COMMENT 'ID ตาราง tb_organization_wechat'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_contact_outsider ────
CREATE TABLE `tb_contact_outsider` (
  `ID` bigint(20) NOT NULL,
  `title` text NOT NULL,
  `coName` varchar(255) NOT NULL,
  `coLastName` varchar(255) NOT NULL,
  `coEmail` varchar(255) NOT NULL,
  `coTel` varchar(13) NOT NULL,
  `coAddress` text NOT NULL,
  `coNickname` varchar(255) NOT NULL,
  `note` text NOT NULL,
  `date` datetime NOT NULL,
  `dateUpdate` datetime NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci COMMENT='รายชื่อติดต่อบุคคลภายนอก';


-- ──── tb_education_background ────
CREATE TABLE `tb_education_background` (
  `ID` bigint(20) NOT NULL,
  `educationStatus` varchar(1) NOT NULL COMMENT '1=จบการศึกษา, 2=กำลังศึกษาอยู่',
  `educationLevel` varchar(1) NOT NULL COMMENT '1=ต่ำกว่ามัธยมศึกษา,2=มัธยมศึกษาตอนต้น,3=มัธยมศึกษาตอนปลาย,4=ปวช.,5=ปวท.,6=ปวส.,7=อนุปริญญา,8=ปริญญาตรี,9=ปริญญาโท,10=ปริญญาเอก',
  `Institution` varchar(255) NOT NULL,
  `faculty` varchar(255) NOT NULL,
  `educationDepartment` varchar(255) NOT NULL,
  `graduateYear` year(4) DEFAULT NULL,
  `GPA` decimal(10,2) NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `date` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_post_job ────
CREATE TABLE `tb_post_job` (
  `ID` bigint(20) NOT NULL,
  `companyType` varchar(2) NOT NULL,
  `adminType` varchar(2) NOT NULL,
  `department` varchar(2) NOT NULL,
  `section` varchar(2) NOT NULL,
  `jobTitle` varchar(500) NOT NULL,
  `amount` int(11) NOT NULL,
  `description` text NOT NULL,
  `qualifications` text NOT NULL,
  `welfareBenefit` text NOT NULL,
  `workingTime` varchar(1000) NOT NULL,
  `startDate` datetime NOT NULL,
  `endDate` datetime NOT NULL,
  `adminCreate` varchar(30) NOT NULL,
  `date` datetime NOT NULL,
  `salary` varchar(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


