-- 0213: rich "case study" fields on cms_articles for ผลงานของเรา (our_work).
-- (ปอน 2026-06-26 — owner: "เขียนแบบแพทเทิร์นหน้าเว็บ ผลงานของเรา ได้ + แก้ทุกเคสหลังบ้าน").
-- Lets a CMS-authored our_work case carry the SAME visible fields the hardcoded
-- catalog cases show: starting price · star rating · route · the ข้อมูลขนส่ง grid.
-- These also receive the migrated hardcoded reviews (catalog → CMS) so every case
-- becomes back-office editable (Ultra Admin Z approve → live).
-- Additive · idempotent · no RLS change (0204 service-role pattern · our_work only).
-- Applied to DEV (lozntlidlqqzzcaathnm). ⚠️ เดฟ to apply to prod + DEV-sync.
-- NEXT FREE = 0214.

alter table public.cms_articles
  add column if not exists case_price  text,                              -- "เริ่ม $500" · sidebar ราคาเริ่มต้น (blank → ขอใบเสนอราคาฟรี)
  add column if not exists case_rating numeric(2,1),                      -- 0.0–5.0 star rating (null → fall back to comment avg / 5.0)
  add column if not exists case_route  text,                              -- "กวางโจว → แหลมฉบัง" route chip
  add column if not exists case_facts  jsonb not null default '[]'::jsonb;-- [{label,value}] · the ข้อมูลขนส่ง grid rows

comment on column public.cms_articles.case_price is
  'our_work starting-price text e.g. "เริ่ม $500" · shown in the case booking sidebar · blank = quote-only';
comment on column public.cms_articles.case_rating is
  'our_work star rating 0.0-5.0 · null falls back to comment average then 5.0';
comment on column public.cms_articles.case_route is
  'our_work route summary e.g. "กวางโจว → แหลมฉบัง"';
comment on column public.cms_articles.case_facts is
  'our_work logistics-fact rows: jsonb array of {label,value} for the ข้อมูลขนส่ง grid';
