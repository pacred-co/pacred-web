-- ════════════════════════════════════════════════════════════
-- 0135 · "โปรเหมาๆ" import-banner config (business_config seed)
-- ════════════════════════════════════════════════════════════
-- BUG #3 (2026-06-01) — the red "โปรเหมาๆ" promo banner on the
-- customer /service-import (ฝากนำเข้า) page was HARDCODED in
-- forwarder-interactivity.tsx. The owner wants to set/edit it:
-- amount · end-date · headline/text · image · enable/disable.
--
-- ── Config home (ADR-0024) ──────────────────────────────────
-- business_config is the canonical home for Pacred-native, NON-pricing
-- config (lib/business-config.ts · 60s cache · super-only editor at
-- /admin/settings/business-config). The 6 keys below are seeded under a
-- new "Promo" category so they appear in that existing editor (a new tab)
-- — no new admin page, reachable in ≤3 clicks (AGENTS.md §0d).
--
-- The page reads each key via getBusinessConfig(key, default); the
-- DEFAULTS here reproduce the previous hardcoded banner EXACTLY, so
-- behaviour is unchanged until an admin edits a value. getBusinessConfig
-- also falls back to the call-site default on a missing key, so the
-- banner renders even if this migration has not yet been applied.
--
-- value_type drives the editor surface:
--   boolean      → checkbox            (import.promo.enabled)
--   string       → text input          (headline / text / end_date / image_url)
--   currency_thb → number + ฿ unit     (import.promo.amount_thb)
--
-- NOTE: setBusinessConfig refuses UNKNOWN keys (schema-by-migration), so
-- these rows MUST exist for the admin editor to write them — that's why
-- this seed is required (not just a code default).
--
-- ⚠️ image_url is a plain URL string for now; a real file-upload picker
--    is a later add (flagged in the PR summary). Paste a hosted URL.
-- ════════════════════════════════════════════════════════════

insert into public.business_config (key, value, value_type, category, description) values
  ('import.promo.enabled',    to_jsonb(true),                                                                                                            'boolean',      'Promo', 'เปิด/ปิด แบนเนอร์ "โปรเหมาๆ" บนหน้าฝากนำเข้า (/service-import). ปิด = ไม่แสดงแบนเนอร์.'),
  ('import.promo.headline',   to_jsonb('โปรเหมาๆ'::text),                                                                                                'string',       'Promo', 'หัวข้อแบนเนอร์โปรฯ หน้าฝากนำเข้า.'),
  ('import.promo.text',       to_jsonb('“หากลูกค้าชำระค่าขนส่งในไทยก่อนเวลา 00.00 น. บริษัทฯ จะจัดส่งสินค้าให้ภายใน 1-3 วันทำการ นับจากวันที่ชำค่าขนส่ง”'::text), 'string',  'Promo', 'ข้อความแบนเนอร์โปรฯ หน้าฝากนำเข้า (รองรับขึ้นบรรทัดใหม่).'),
  ('import.promo.amount_thb', to_jsonb(100),                                                                                                             'currency_thb', 'Promo', 'จำนวนเงินส่วนลด/โปรฯ (บาท) แสดงใต้ข้อความ. 0 = ไม่แสดงบรรทัดจำนวนเงิน.'),
  ('import.promo.end_date',   to_jsonb(''::text),                                                                                                        'string',       'Promo', 'วันสิ้นสุดโปรฯ รูปแบบ YYYY-MM-DD (เช่น 2026-06-30). เว้นว่าง = ไม่มีกำหนดสิ้นสุด. เลยวันนี้ = ซ่อนแบนเนอร์อัตโนมัติ.'),
  ('import.promo.image_url',  to_jsonb(''::text),                                                                                                        'string',       'Promo', 'URL รูปแบนเนอร์โปรฯ (ถ้ามี). เว้นว่าง = ไม่มีรูป. (อัปโหลดไฟล์จริงเป็นงานเพิ่มภายหลัง — ตอนนี้วาง URL.)')
on conflict (key) do nothing;
