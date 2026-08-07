-- ════════════════════════════════════════════════════════════════════════
-- 0299_container_summary_keep_null_close.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-07 — owner: "เลขตู้อี้อูเรามี 9 ตู้ แต่หน้ารายการตู้หายไปไหน · ตู้แสดงผล
--   ไม่ครบ · กระทบคนทำงานเยอะ · ดู logic การทำงานดีๆ flow เขาไหลมาแบบไหนยังไง"
--   (เคสจริง `/admin/report-cnt/YWS260707-1` — เปิดตรงๆ ได้ แต่ไม่โผล่ในลิสต์)
--
-- ROOT: แท็บ "เข้าโกดังไทยแล้ว" กรองด้วย **วันปิดตู้** (90 วันย้อนหลังเป็นค่าเริ่มต้น).
-- 0271 ย้ายตัวกรองมาระดับตู้ (MAX) แล้ว — แต่ตู้ที่ **ไม่เคยมีวันปิดตู้เลย** ยังหาย
-- เพราะ `MAX(NULL) >= p_start` = NULL → ไม่ผ่าน HAVING → หายทั้งตู้ ทั้งที่ถึงไทยแล้ว.
--
-- วัดกับ prod ก่อนแก้ (2026-08-07): ตู้ทั้งหมด 80 · bucket ถึงไทย 56 ·
--   **ไม่มีวันปิดตู้ = 3 ตู้ หายหมด**: GZS260712-1 (max 7) · GZS260612-1 (max 7) ·
--   YWS260707-1 (max 5 · ตู้ที่ owner เปิด) — ทั้ง 3 ไม่มีวันถึงไทยให้ fallback ด้วย
--   ⇒ 56 − 3 = 53 = ตัวเลขที่จอโชว์เป๊ะ (ตัวนับหัวข้อซ่อนไปด้วย = ไม่มีใครรู้ว่าหาย)
-- บริบท: วันปิดตู้ว่าง = เรื่องปกติของงานจริง (prod ว่าง 58/72 กวางโจว + 7/8 อี้อู ·
-- ไม่มีแหล่งข้อมูล รอ CS คีย์) ⇒ เอา "วันที่ไม่มี" มาตัดตู้ทิ้ง = ผิดตั้งแต่ต้น.
--
-- FIX: ตู้ที่ไม่มีวันปิดตู้ → ผ่านตัวกรองวันเสมอ (`MAX(...) IS NULL`) ทั้งใน
--   `get_container_summary` (ลิสต์) และ `count_distinct_cabinets` (ตัวนับ) ⇒
--   เลขบนหัวข้อ = จำนวนแถวในลิสต์เสมอ. ตัวกรองวันมีไว้ "จำกัดขอบเขต" ไม่ใช่ "ซ่อนงาน".
-- ผลที่คาด: "เข้าโกดังไทยแล้ว" 53 → 56 · "รอเข้าโกดังไทย" ไม่กระทบ (ไม่กรองวันอยู่แล้ว).
-- Idempotent CREATE OR REPLACE · READ-ONLY (ไม่แตะข้อมูล/เงิน · signature เดิมเป๊ะ).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_container_summary(
  p_page      text,
  p_transport text DEFAULT NULL,
  p_start     date DEFAULT NULL,
  p_end       date DEFAULT NULL
)
RETURNS TABLE (
  fcabinetnumber       text,
  ftransporttype       text,
  fwarehousename       text,
  fdatecontainerclose  timestamptz,
  latest_fdatestatus4  timestamptz,
  row_count            bigint,
  sum_weight           numeric,
  sum_volume           numeric,
  sum_cost             numeric,
  sum_price            numeric,
  min_fstatus          text,
  max_fstatus          text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.fcabinetnumber,
    MAX(f.ftransporttype)                    AS ftransporttype,
    MAX(f.fwarehousename)                    AS fwarehousename,
    MAX(f.fdatecontainerclose::timestamptz)  AS fdatecontainerclose,
    MAX(f.fdatestatus4::timestamptz)         AS latest_fdatestatus4,
    COUNT(*)::bigint                         AS row_count,
    COALESCE(SUM(f.fweight::numeric),         0)::numeric  AS sum_weight,
    -- 0263: row-TOTAL CBM (famountcount "CBMProduct" rule) — unchanged.
    COALESCE(SUM(
      CASE WHEN btrim(COALESCE(f.famountcount::text, '')) = '1'
           THEN f.fvolume::numeric
           ELSE f.fvolume::numeric * GREATEST(COALESCE(f.famount::numeric, 1), 1)
      END
    ), 0)::numeric                                          AS sum_volume,
    COALESCE(SUM(f.fcosttotalprice::numeric), 0)::numeric  AS sum_cost,
    COALESCE(SUM(f.ftotalprice::numeric),     0)::numeric  AS sum_price,
    -- min_fstatus = LEAST-advanced tracking over ALL the ตู้'s rows (the true
    -- representative "what it's still waiting on" status). 0271: no longer
    -- distorted by the date window (that filter is now container-level, below).
    MIN(f.fstatus)                           AS min_fstatus,
    MAX(f.fstatus)                           AS max_fstatus
  FROM public.tb_forwarder f
  WHERE f.fcabinetnumber IS NOT NULL
    AND f.fcabinetnumber <> ''
    AND f.fcabinetnumber <> '0'
    AND f.fstatus <> '99'                                   -- 0190: drop cancelled
    AND (
      p_transport IS NULL OR p_transport = '' OR f.ftransporttype = p_transport
    )
  GROUP BY f.fcabinetnumber
  -- 0261 "any arrived" bucket + 0271 CONTAINER-level date filter (MAX close in
  -- range) — the arrived (fstatus=4) rows with a NULL close no longer drop out.
  HAVING ((p_page = 'waiting' AND MAX(f.fstatus) <  '4')
       OR (p_page = 'succeed' AND MAX(f.fstatus) >= '4'))
     AND ( p_page <> 'succeed' OR p_start IS NULL OR p_end IS NULL
           -- 0299: ตู้ที่ไม่มีวันปิดตู้เลย = ตัดสินด้วยวันไม่ได้ → ต้องเห็น ไม่ใช่หายทั้งตู้
           OR MAX(f.fdatecontainerclose::timestamptz) IS NULL
           OR (MAX(f.fdatecontainerclose::timestamptz) >= (p_start::text || ' 00:00:00')::timestamptz
               AND MAX(f.fdatecontainerclose::timestamptz) <= (p_end::text   || ' 23:59:59')::timestamptz) )
  ORDER BY MAX(f.fdatestatus4) DESC NULLS LAST, f.fcabinetnumber;
$$;

COMMENT ON FUNCTION public.get_container_summary(text, text, date, date) IS
  '/admin/report-cnt listing — one row per cabinet (0261 any-arrived bucket). 0263: sum_volume = Σ row-TOTAL CBM (CBMProduct rule). 0271: date-filter ระดับตู้. 0299: ตู้ที่ไม่มีวันปิดตู้ (NULL) ผ่านตัวกรองวันเสมอ — เดิมหายทั้งตู้ (prod 3 ตู้ · เคส YWS260707-1 ที่ owner แจ้ง).';

-- count_distinct_cabinets — the tab/transport BADGE counts. Same 0271 fix: date
-- filter → HAVING container-level so the counts match the listing exactly.
CREATE OR REPLACE FUNCTION public.count_distinct_cabinets(
  p_page       text,
  p_transport  text DEFAULT NULL,
  p_start      date DEFAULT NULL,
  p_end        date DEFAULT NULL,
  p_action_pay text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::bigint FROM (
    SELECT f.fcabinetnumber
    FROM public.tb_forwarder f
    WHERE f.fcabinetnumber IS NOT NULL
      AND f.fcabinetnumber <> ''
      AND f.fcabinetnumber <> '0'
      AND f.fstatus <> '99'
      AND (
        p_transport IS NULL OR p_transport = '' OR f.ftransporttype = p_transport
      )
      AND (
        p_action_pay IS NULL OR p_action_pay = '' OR p_action_pay = 'all'
        OR (p_action_pay = '2' AND EXISTS (
              SELECT 1 FROM public.tb_cnt_item ci
              WHERE ci."fCabinetNumber" = f.fcabinetnumber))
        OR (p_action_pay = '1' AND NOT EXISTS (
              SELECT 1 FROM public.tb_cnt_item ci
              WHERE ci."fCabinetNumber" = f.fcabinetnumber))
      )
    GROUP BY f.fcabinetnumber
    HAVING ((p_page = 'waiting' AND MAX(f.fstatus) <  '4')
         OR (p_page = 'succeed' AND MAX(f.fstatus) >= '4'))
       AND ( p_page <> 'succeed' OR p_start IS NULL OR p_end IS NULL
             -- 0299: NULL วันปิดตู้ = นับด้วย (ตัวนับต้องเท่าลิสต์เสมอ)
             OR MAX(f.fdatecontainerclose::timestamptz) IS NULL
             OR (MAX(f.fdatecontainerclose::timestamptz) >= (p_start::text || ' 00:00:00')::timestamptz
                 AND MAX(f.fdatecontainerclose::timestamptz) <= (p_end::text   || ' 23:59:59')::timestamptz) )
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_container_summary(text, text, date, date)         TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.count_distinct_cabinets(text, text, date, date, text) TO service_role, authenticated;
