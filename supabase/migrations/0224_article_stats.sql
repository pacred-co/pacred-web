-- Real, persisted view + like counters for the public article pages
-- (สาระน่ารู้ · ข่าวสาร · ผลงานของเรา). Owner 2026-06-29: "เข้าเว็บ 1 ครั้งนับ 1 ·
-- กดไลก์ ล็อกอินหรือไม่ก็ได้ · กดแล้วค้างไว้ · นับสะสมเรื่อยๆ".
--
-- One row per article, keyed by `<category>:<slug>` (stable permalink key, shared
-- by the listing card + the detail page so the number matches everywhere).
-- All writes go through the server action (service-role client) → RLS ON with no
-- policy = the table is invisible to the anon/auth client; only the validated
-- action can touch it. The counters are atomic (column = column + 1) so concurrent
-- visitors never lose a count.

create table if not exists article_stats (
  stat_key   text primary key,
  views      bigint not null default 0,
  likes      bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table article_stats enable row level security;

-- atomic +1 view (upsert) → returns the new totals
create or replace function article_stat_view(p_key text)
returns table(views bigint, likes bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into article_stats as s (stat_key, views) values (p_key, 1)
  on conflict (stat_key) do update set views = s.views + 1, updated_at = now();
  return query select a.views, a.likes from article_stats a where a.stat_key = p_key;
end;
$$;

-- atomic like delta (+1 / -1, floored at 0) → returns the new totals
create or replace function article_stat_like(p_key text, p_delta int)
returns table(views bigint, likes bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into article_stats as s (stat_key, likes) values (p_key, greatest(0, p_delta))
  on conflict (stat_key) do update set likes = greatest(0, s.likes + p_delta), updated_at = now();
  return query select a.views, a.likes from article_stats a where a.stat_key = p_key;
end;
$$;
