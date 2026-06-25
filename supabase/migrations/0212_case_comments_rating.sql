-- 0212_case_comments_rating.sql
-- ปอน 2026-06-25: add a 1–5 star rating to case-study comments so each comment
-- on /our-work/[id] doubles as a mini-review. The case-study hero score then
-- shows the AVERAGE of these comment ratings (and falls back to the curated
-- review.rating when there are no rated comments yet).
--
-- Additive · nullable (existing rows keep NULL = "no rating") · CHECK 1–5 ·
-- idempotent (safe to re-run). RLS unchanged — all access stays via the
-- service-role client inside the case-comments server actions.
--
-- ⚠️ NOT YET APPLIED TO PROD — เดฟ to apply to prod (yzljakczhwrpbxflnmco)
-- together with 0210/0211. Until applied, postCaseComment stores no rating and
-- the hero keeps showing the curated review.rating (fail-soft). NEXT FREE = 0213.

alter table public.case_comments
  add column if not exists rating smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'case_comments_rating_range'
  ) then
    alter table public.case_comments
      add constraint case_comments_rating_range
      check (rating is null or (rating between 1 and 5));
  end if;
end $$;

comment on column public.case_comments.rating is
  '1–5 star review score for the case study · NULL = comment without a rating · ปอน 2026-06-25.';
