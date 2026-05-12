-- ============================================================
-- 27 — Utility / CSV import / page metadata
-- ============================================================
-- CSV bulk import staging, page metadata, history audit, web_hs (web settings)
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_csvimport ────
CREATE TABLE `tb_csvimport` (
  `ID` varchar(15) NOT NULL COMMENT 'ปีเดือนวัน-เวลา',
  `csvName` varchar(100) NOT NULL,
  `csvDate` datetime NOT NULL,
  `csvCount` int(11) NOT NULL,
  `csvCountProcess` int(11) NOT NULL,
  `adminID` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_history ────
CREATE TABLE `tb_history` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `action` text NOT NULL,
  `status` varchar(2) NOT NULL,
  `adminID` varchar(20) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_page_name ────
CREATE TABLE `tb_page_name` (
  `ID` int(11) NOT NULL,
  `pageName` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_web_hs ────
CREATE TABLE `tb_web_hs` (
  `ID` bigint(20) NOT NULL,
  `datetime` datetime NOT NULL,
  `ip` varchar(45) NOT NULL,
  `device` int(11) NOT NULL COMMENT 'nameGetDevice()',
  `os` int(11) NOT NULL COMMENT 'nameGetOS()',
  `browser` int(11) NOT NULL COMMENT 'getBrowserName()',
  `load_time` decimal(10,8) NOT NULL,
  `user_agent` text NOT NULL,
  `session_id` varchar(256) NOT NULL,
  `userID` varchar(30) NOT NULL,
  `page_name` int(11) NOT NULL COMMENT 'namePageName()'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


