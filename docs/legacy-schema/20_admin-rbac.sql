-- ============================================================
-- 20 — Admin & RBAC (admin-side, Phase G)
-- ============================================================
-- Admin users + RBAC tuple (companyType, department, section) — needs redesign to roles table (CLAUDE.md #15)
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_admin ────
CREATE TABLE `tb_admin` (
  `ID` int(11) NOT NULL,
  `adminID` varchar(20) NOT NULL,
  `adminStatusA` varchar(1) NOT NULL DEFAULT '1' COMMENT 'สถานะการใช้งานบัญชี 1=ใช้งาน,0=ไม่ใช้งาน',
  `adminPass` varchar(80) NOT NULL,
  `adminName` varchar(255) NOT NULL,
  `adminLastName` varchar(255) NOT NULL,
  `adminEmail` varchar(255) NOT NULL,
  `adminEmailOrg` bigint(20) NOT NULL COMMENT 'เมลองค์กร',
  `adminSex` varchar(4) DEFAULT NULL,
  `adminBirthday` datetime DEFAULT NULL,
  `adminStatus` varchar(2) NOT NULL COMMENT 'สิทธิ์การเข้าถึงข้อมูล',
  `adminStatusSale` varchar(1) NOT NULL,
  `adminPicture` varchar(150) NOT NULL DEFAULT 'user.jpg',
  `adminRegistered` datetime NOT NULL,
  `adminTel` varchar(13) NOT NULL,
  `adminLastLogin` datetime NOT NULL,
  `pcs_admin_logged` varchar(80) DEFAULT NULL,
  `adminType` varchar(1) NOT NULL COMMENT '1=พนักงานประจำ, 2=ทดลองงาน, 3=เด็กฝึกงาน, 4=สหกิจศึกษา, 5=พาสเนอร์, 6=คนในบ้าน',
  `department` varchar(2) NOT NULL,
  `section` varchar(2) NOT NULL,
  `companyType` varchar(1) NOT NULL,
  `startDate` datetime NOT NULL,
  `endDate` datetime NOT NULL,
  `endDateOfLogin` datetime NOT NULL,
  `adminDel` varchar(40) NOT NULL,
  `dateDel` datetime NOT NULL,
  `adminNickname` varchar(30) NOT NULL,
  `adminTMP` varchar(1) NOT NULL COMMENT '2=พักชัวคราว',
  `adminTelOrg` bigint(20) NOT NULL,
  `salaryType` varchar(1) NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `nationalIDCard` varchar(25) NOT NULL,
  `expiryDate` date DEFAULT NULL,
  `salary` decimal(10,2) NOT NULL,
  `dateCreate` datetime DEFAULT NULL,
  `statusResetPass` varchar(1) NOT NULL,
  `nationalIDCardFile` varchar(255) NOT NULL,
  `copyHouseRegistrationFile` varchar(255) NOT NULL,
  `resumeFile` varchar(255) NOT NULL,
  `religion` varchar(2) NOT NULL COMMENT '1 = พุทธศาสนา,2 = คริสต์ศาสนา,3 = อิสลาม,4 = ฮินดู,5 = ซิกข์,6 = ยูดาห์,7 = ไม่มีศาสนา,8 = ศาสนาอื่นๆ	',
  `nationality` varchar(200) NOT NULL,
  `maritalStatus` varchar(2) NOT NULL COMMENT '1 = โสด,2 = แต่งงานแล้ว,3 = หย่าร้าง,4 = ม่าย,5 = แยกกันอยู่,6 = มีความสัมพันธ์,7 = หมั้น,8 = อื่น ๆ',
  `adminLineTokenNotify` varchar(100) NOT NULL,
  `dateAdminLineTokenNotify` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_admin_address ────
CREATE TABLE `tb_admin_address` (
  `ID` bigint(20) NOT NULL,
  `addressNo` text NOT NULL,
  `district` varchar(255) NOT NULL,
  `amphoe` varchar(255) NOT NULL,
  `province` varchar(255) NOT NULL,
  `zipcode` varchar(10) NOT NULL,
  `addressNote` text NOT NULL,
  `date` datetime NOT NULL,
  `adminID` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_tmp_profile_admin ────
CREATE TABLE `tb_tmp_profile_admin` (
  `ID` bigint(20) NOT NULL,
  `token` varchar(70) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


