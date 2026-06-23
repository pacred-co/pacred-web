-- 0206_cms_articles_tags.sql
-- Owner 2026-06-23: tag the CMS articles (esp. ผลงานของเรา) with free-form tags —
-- HS code, product category, etc. On /our-work the tags become a clickable filter
-- bar (?tag=…) so a visitor can browse the case studies by product/HS.
--
-- text[] on the row (a few hundred articles · no separate tags table needed) +
-- a GIN index so the `tags @> {tag}` filter is fast. Additive · idempotent.

alter table public.cms_articles add column if not exists tags text[] not null default '{}';

create index if not exists cms_articles_tags_gin on public.cms_articles using gin (tags);
