-- ============================================================
-- 24 — Time attendance & meeting rooms (admin)
-- ============================================================
-- Time-attendance-system (TAS) + holiday + leave + meeting room booking
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── reserve_meeting_room ────
CREATE TABLE `reserve_meeting_room` (
  `ID` bigint(20) NOT NULL,
  `event` varchar(255) NOT NULL,
  `datemeet` date NOT NULL,
  `start_date` time NOT NULL,
  `end_date` time NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `note` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tas_historydataold ────
CREATE TABLE `tas_historydataold` (
  `ID` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `time` time NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `datetimeUpload` datetime NOT NULL,
  `name` varchar(200) NOT NULL,
  `scanID` varchar(20) NOT NULL,
  `status` varchar(4) NOT NULL,
  `note` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tas_historydataold_tmp ────
CREATE TABLE `tas_historydataold_tmp` (
  `ID` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `time` time NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `datetimeUpload` datetime NOT NULL,
  `name` varchar(200) NOT NULL,
  `scanID` varchar(20) NOT NULL,
  `status` varchar(4) NOT NULL,
  `note` text NOT NULL,
  `filename` varchar(250) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tas_historydata_mobile ────
CREATE TABLE `tas_historydata_mobile` (
  `ID` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `time` time NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `datetimeUpload` datetime NOT NULL,
  `name` varchar(200) NOT NULL,
  `scanID` varchar(20) NOT NULL,
  `status` varchar(4) NOT NULL,
  `note` text NOT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(20,8) NOT NULL,
  `noteUser` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tas_holiday ────
CREATE TABLE `tas_holiday` (
  `ID` bigint(20) NOT NULL,
  `holidayName` varchar(255) NOT NULL,
  `holidayDate` date NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `date` datetime NOT NULL,
  `note` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tas_holiday_maid ────
CREATE TABLE `tas_holiday_maid` (
  `ID` bigint(20) NOT NULL,
  `holidayDate` date NOT NULL,
  `adminIDCreate` varchar(30) NOT NULL,
  `date` datetime NOT NULL,
  `note` text NOT NULL,
  `adminID` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tas_leave ────
CREATE TABLE `tas_leave` (
  `ID` bigint(20) NOT NULL,
  `type` varchar(1) NOT NULL COMMENT 'ประเภทการลา 1=ลาป่วย,2=ลาพักผ่อน,3=ลากิจส่วนตัว,4=ลาคลอด',
  `startdate` date NOT NULL,
  `enddate` date NOT NULL,
  `duration` varchar(1) NOT NULL COMMENT '1=ทั้งวัน,2=ครึ่งวันเช้า,3=ครึ่งวันบ่าย',
  `reason` text NOT NULL,
  `filename` varchar(250) NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `date` datetime DEFAULT NULL,
  `status` varchar(1) NOT NULL COMMENT '1=รอ HR ตรวจสอบ, 2=รอผู้บริหารอนุมัติ, 3=อนุมัติ,4=ไม่อนุมัติ',
  `adminIDCreate` varchar(30) NOT NULL,
  `adminIDCEO` varchar(30) NOT NULL,
  `adminIDHR` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci COMMENT='การลางาน';


