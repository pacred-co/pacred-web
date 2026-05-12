-- ============================================================
-- 09 — Search (1688/Taobao)
-- ============================================================
-- Product cache + keyword history + China API integration table
--
-- Source: pcsc_main.sql (MySQL dump 2026-05-12)
-- ⚠️  Reference only — translate to Postgres in supabase/migrations/*.sql
-- ⚠️  Drop `tb_` prefix, convert to snake_case, add FK constraints (per A3 hybrid strategy)
-- ============================================================

-- ──── tb_product ────
CREATE TABLE `tb_product` (
  `ID` bigint(20) NOT NULL,
  `pProductCategory` int(11) NOT NULL,
  `pDate` datetime NOT NULL,
  `pDateUpdate` datetime NOT NULL,
  `pNameTH` varchar(500) NOT NULL,
  `pIntro` varchar(500) NOT NULL,
  `pDetailTH` varchar(500) NOT NULL,
  `pProvider` varchar(1) NOT NULL COMMENT 'ร้านจีน',
  `pURL` varchar(500) NOT NULL,
  `pImages` varchar(300) NOT NULL,
  `pPrice` decimal(10,2) NOT NULL,
  `pPricePromo` decimal(10,2) NOT NULL,
  `pDetail` text NOT NULL,
  `pProductID` varchar(200) NOT NULL,
  `adminID` varchar(30) NOT NULL,
  `adminIDUpdate` varchar(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_product_category ────
CREATE TABLE `tb_product_category` (
  `pcID` bigint(20) NOT NULL,
  `pcName` varchar(300) NOT NULL,
  `pcDetail` varchar(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_keyword_product ────
CREATE TABLE `tb_keyword_product` (
  `ID` bigint(20) NOT NULL,
  `keyword` varchar(255) NOT NULL,
  `note` varchar(255) NOT NULL,
  `adminIDCreate` varchar(25) NOT NULL,
  `date` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ──── tb_history_key ────
CREATE TABLE `tb_history_key` (
  `ID` bigint(20) NOT NULL,
  `date` datetime NOT NULL,
  `keyWord` text NOT NULL,
  `userID` varchar(10) NOT NULL,
  `type` varchar(1) NOT NULL COMMENT '1=keyword,2=1688,3=taobao,4=tmall',
  `apiERROR` varchar(1) NOT NULL,
  `categoryName` varchar(300) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


-- ──── tb_api_china_hs ────
CREATE TABLE `tb_api_china_hs` (
  `ID` bigint(20) NOT NULL,
  `whsID` bigint(20) NOT NULL,
  `url` text NOT NULL,
  `type` int(11) NOT NULL COMMENT '1=ค้นหาคำ,2=วางลิงก์1688,3=วางลิงก์taobao,4=วางลิงก์tmall',
  `status` int(11) NOT NULL COMMENT '0=ทำงานปกติ,1=ไม่ทำงาน',
  `nameCategory` varchar(200) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;


