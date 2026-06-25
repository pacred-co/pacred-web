-- 0211: video_url + gallery_images on cms_articles for "ผลงานของเรา" CMS
-- (owner: ปอน 2026-06-25 — case study media: YouTube/video embed + image gallery).
-- Additive columns · idempotent · no RLS change (0204 service-role pattern).
-- ⚠️ NOT YET APPLIED — เดฟ to apply to prod (yzljakczhwrpbxflnmco) + DEV-sync.
-- Until applied the editor shows the video/gallery fields but saves to null (ignored).
-- NEXT FREE = 0212.

alter table public.cms_articles
  add column if not exists video_url      text,
  add column if not exists gallery_images text[] default '{}';

comment on column public.cms_articles.video_url is
  'YouTube URL (https://youtu.be/…) or direct Supabase Storage video URL · our_work';
comment on column public.cms_articles.gallery_images is
  'Ordered image URLs for the CaseGallery filmstrip · prepended after cover_url · our_work';
