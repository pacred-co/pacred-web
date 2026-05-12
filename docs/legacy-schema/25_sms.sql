-- ============================================================
-- 25 — SMS history (admin)
-- ============================================================
-- ThaiBulkSMS audit log + monthly statistics
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_sms_hs ────
CREATE TABLE `tb_sms_hs` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `msisdn` text NOT NULL,
  `message` text NOT NULL,
  `status` varchar(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_sms_statistic ────
CREATE TABLE `tb_sms_statistic` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `browser` varchar(80) NOT NULL,
  `browserVersion` varchar(20) NOT NULL,
  `ip` varchar(20) NOT NULL,
  `getDevice` varchar(30) NOT NULL,
  `userID` varchar(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_sms_statistic9 ────
CREATE TABLE `tb_sms_statistic9` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `browser` varchar(80) NOT NULL,
  `browserVersion` varchar(20) NOT NULL,
  `ip` varchar(20) NOT NULL,
  `getDevice` varchar(30) NOT NULL,
  `userID` varchar(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


