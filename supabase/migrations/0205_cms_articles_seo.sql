-- 0205_cms_articles_seo.sql
-- Owner 2026-06-23: per-article SEO override on the no-code CMS — let the writer
-- set the <title> + meta description independently of the on-page heading/excerpt
-- (standard blog-CMS behaviour). Both optional → the detail page falls back to
-- title / excerpt when blank.
--
-- (Inline images need NO column — they live in the body text as ![](url) markers
-- rendered by <ArticleContent>; the cover stays in cover_url.)
--
-- Additive · idempotent.

alter table public.cms_articles add column if not exists meta_title       text not null default '';
alter table public.cms_articles add column if not exists meta_description text not null default '';
