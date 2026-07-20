-- ════════════════════════════════════════════════════════════════════════
-- 0265_cms_articles_en.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-07-20 — owner: "ทำให้มีสลับ en ด้วยดิ แต่หน้าเดียวกันนะ จะได้ง่ายๆ"
--
-- One cms_articles row = one language today. The public case page localises only
-- its CHROME (menu/button strings via typedLocale) — the title, excerpt, body and
-- case facts stay Thai, so an EN visitor reads Thai. Worse, the page already
-- declares `hreflang="en-US"` for that same slug (our-work/[id]/page.tsx:155),
-- i.e. it advertises an English translation that does not exist.
--
-- Rather than a second row per language (which would fork the slug, the view /
-- like / share counters and the comment thread), the translation lives BESIDE the
-- Thai on the same row. One row = one case = one URL = one set of stats, with two
-- language faces. The editor gets a TH/EN switch on the same screen.
--
-- Only genuinely language-bearing fields are duplicated. Deliberately NOT
-- duplicated — these are the same in both languages and must not drift:
--   slug · cover_url · gallery_images · video_url · case_rating · tags · category
-- (tags double as the /our-work filter keys, so forking them would split the
--  filter; slug stays single so hreflang keeps pointing at one canonical URL.)
--
-- Blank EN = fall back to the Thai. So this migration changes nothing until an
-- author actually types a translation — every existing case keeps rendering
-- exactly as it does now, in both locales.
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table cms_articles
  add column if not exists title_en            text  not null default '',
  add column if not exists excerpt_en          text  not null default '',
  add column if not exists body_en             text  not null default '',
  add column if not exists meta_title_en       text  not null default '',
  add column if not exists meta_description_en text  not null default '',
  -- our_work case-study fields (mirror of 0219)
  add column if not exists case_route_en       text  not null default '',
  add column if not exists case_price_en       text  not null default '',
  add column if not exists case_facts_en       jsonb not null default '[]'::jsonb;

comment on column cms_articles.title_en is
  'คำแปลอังกฤษ — ว่าง = ใช้ภาษาไทยแทน (owner 2026-07-20)';

commit;
