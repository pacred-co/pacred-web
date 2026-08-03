-- ════════════════════════════════════════════════════════════
-- 0285 · คลัง HS — ยุบ product-grain (doc_bot) เข้าตารางเดียว hs_codes
-- ════════════════════════════════════════════════════════════
-- Owner 2026-08-03 (ย้ำครั้งที่ 2 หลังเห็นหน้า 2 แท็บ):
--   "ทำไมยังมี 2 แทปอยู่ เราบอกให้รวมกัน ทั้งหน้าตาการใช้งาน และ DB แล้วนี่ครับ
--    ให้เอามารวมให้ table เดียวกัน พอใช้ที่เดียวกันหนะครับ"
--
-- 0258 unified the CODE grain but kept doc_bot_hs_codes as a live-read child
-- (แท็บ 2 "สินค้า → พิกัด"). This closes that: the product names move ONTO the
-- hs_codes row itself as `product_aliases` — one table, one page.
--
--   product_aliases jsonb = [ { "th": "...", "en": "...", "note": "...", "src": "bot|file|override|line" }, ... ]
--
-- ⇒ ชื่อสินค้าที่เคยถาม/เคยตอบ ทุกชื่อ อยู่บนแถวพิกัดของมันเอง → หน้าเดียว
--   ค้นชื่อสินค้าแล้วเจอแถวพิกัดตรงๆ (ไม่ต้องสลับแท็บ) และ consumer ทุกตัว
--   อ่าน hs_codes ตัวเดียว.
--
-- doc_bot_hs_codes / doc_bot_hs_overrides become ARCHIVE after the merge
-- script (scripts/merge-doc-bot-aliases-2026-08-03.mjs) copies their content
-- in — no reader remains, tables kept for reversibility (ห้ามงานหาย · same
-- posture as tb_rate_vip_* after the tier removal). Additive + idempotent.
-- Apply to prod (dev unreachable → reconcile queue).

alter table public.hs_codes
  add column if not exists product_aliases jsonb not null default '[]'::jsonb;

comment on column public.hs_codes.product_aliases is
  'ชื่อสินค้าที่เคยถาม/ตอบสำหรับพิกัดนี้ [{th,en,note,src}] — merged from doc_bot_hs_codes (bot|file) + doc_bot_hs_overrides (override) + LINE chats (line). Reference intel only; search + display. The doc_bot_* tables are archive after the merge.';
