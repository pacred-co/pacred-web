-- ════════════════════════════════════════════════════════════════════════
-- 0266_article_stats_shares.sql
-- (เดิมเป็น 0264 · ชนกับ 0264_shop_status_base_aware_link ที่ถูก push เข้า
--  InwPond007 ระหว่างที่งานนี้ทำอยู่ → เปลี่ยนเลขเป็น 0266 ตอน merge.
--  ตัว migration apply prod ไปแล้วตั้งแต่ยังเป็น 0264 — เปลี่ยนแค่ชื่อไฟล์
--  ไม่ต้องรันซ้ำ และเนื้อในเป็น idempotent อยู่แล้วถ้าจะรัน)
-- ════════════════════════════════════════════════════════════════════════
-- 2026-07-20 — owner: "เพิ่มปุ่มแชร์หน่อย แล้วให้มีนับจำนวนแชร์ด้วย"
-- (หน้าผลงานของเรา · ต่อจากปุ่ม วิว/ถูกใจ ที่มีอยู่แล้ว)
--
-- Adds a THIRD counter to the existing `article_stats` spine (migration 0227 —
-- views + likes). Same design, no new table, no new access path:
--   • one row per article, keyed `<category>:<slug>`
--   • RLS ON with no policy → only the service-role server action can write
--   • atomic (column = column + 1) so concurrent visitors never lose a count
--
-- ⚠️ The two existing RPCs are DROPped and recreated rather than CREATE OR
-- REPLACEd: Postgres refuses to replace a function whose RETURN TYPE changes
-- ("cannot change return type of existing function"), and both now need to
-- return `shares` as well. The whole migration runs in one transaction, so the
-- functions are never missing from the live app's point of view.
--
-- Semantics note — shares are CUMULATIVE, not a toggle like `likes`:
-- แชร์ 1 ครั้ง = +1 เสมอ (แชร์เข้า LINE แล้วแชร์เข้า FB ต่อ = 2) ต่างจากถูกใจ
-- ที่กดซ้ำแล้วหักออก. ไม่มี -1 → ไม่ต้องมี greatest(0, …) guard.
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table article_stats
  add column if not exists shares bigint not null default 0;

-- ── +1 view (upsert) → now returns all three totals ──────────────────────
drop function if exists article_stat_view(text);

create function article_stat_view(p_key text)
returns table(views bigint, likes bigint, shares bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into article_stats as s (stat_key, views) values (p_key, 1)
  on conflict (stat_key) do update set views = s.views + 1, updated_at = now();
  return query select a.views, a.likes, a.shares from article_stats a where a.stat_key = p_key;
end;
$$;

-- ── like delta (+1 / -1, floored at 0) → now returns all three totals ────
drop function if exists article_stat_like(text, int);

create function article_stat_like(p_key text, p_delta int)
returns table(views bigint, likes bigint, shares bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into article_stats as s (stat_key, likes) values (p_key, greatest(0, p_delta))
  on conflict (stat_key) do update set likes = greatest(0, s.likes + p_delta), updated_at = now();
  return query select a.views, a.likes, a.shares from article_stats a where a.stat_key = p_key;
end;
$$;

-- ── +1 share (upsert) → returns all three totals ─────────────────────────
create or replace function article_stat_share(p_key text)
returns table(views bigint, likes bigint, shares bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into article_stats as s (stat_key, shares) values (p_key, 1)
  on conflict (stat_key) do update set shares = s.shares + 1, updated_at = now();
  return query select a.views, a.likes, a.shares from article_stats a where a.stat_key = p_key;
end;
$$;

comment on column article_stats.shares is
  'จำนวนครั้งที่กดแชร์ (สะสม · ไม่ใช่ toggle แบบ likes) — owner 2026-07-20';

commit;
