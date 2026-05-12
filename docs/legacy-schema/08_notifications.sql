-- ============================================================
-- 08 — Notifications
-- ============================================================
-- tb_notify history + read tracker + sheet sync. ⚠️ LINE Notify tokens (tb_users.userLineNotify) are DEAD — see ADR-0001
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_notify ────
CREATE TABLE `tb_notify` (
  `ID` bigint(20) NOT NULL,
  `title` varchar(400) NOT NULL,
  `content` varchar(100) NOT NULL,
  `dateStart` datetime NOT NULL,
  `dateExp` datetime NOT NULL,
  `url` varchar(400) NOT NULL,
  `adminID` varchar(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_notify_read ────
CREATE TABLE `tb_notify_read` (
  `ID` bigint(20) NOT NULL,
  `userID` varchar(10) NOT NULL,
  `popID` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_notify_sheet_ctt ────
CREATE TABLE `tb_notify_sheet_ctt` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `numRow` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_notify_wp ────
CREATE TABLE `tb_notify_wp` (
  `ID` bigint(20) NOT NULL,
  `title` varchar(300) NOT NULL,
  `detail` text NOT NULL,
  `dateStart` datetime NOT NULL,
  `dateExp` datetime NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `status` varchar(1) NOT NULL COMMENT '1 คือ เห็นทั้งหมด , 2 คือ เห็นเฉพาะสามาชิก',
  `URL` varchar(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


