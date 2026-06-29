-- 0228 · WeChat ops-chat archive (owner 2026-06-29 "เอาข้อมูล wechat เข้า database").
-- Reference table only — the decrypted cargo-ops coordination chats (MOMO / PCS /
-- AXELRA / HUAHAI / FEISHENG / 柏盛泰 / Yiwu / แลกหยวน / 退税 / per-container groups)
-- so staff can SEARCH past China-side coordination (ปิดตู้วันไหน · ตู้ไหน · เลขแทรค)
-- instead of scrolling WeChat. NO money/status writes — pure read reference.
create table if not exists public.wechat_ops_message (
  id            bigserial primary key,
  source_account text not null,             -- the wxid the export came from
  chat_name     text not null,              -- display name (group/contact)
  sender        text,                       -- display name of sender ('me' = our side)
  sent_at       timestamptz,                -- message time (Asia/Bangkok)
  content       text not null,              -- decoded (zstd-aware) message text
  content_hash  text not null,              -- md5(chat||sender||sent_at||content) for idempotent ingest
  created_at    timestamptz not null default now()
);

create unique index if not exists wechat_ops_message_dedup_idx
  on public.wechat_ops_message(content_hash);
create index if not exists wechat_ops_message_chat_idx
  on public.wechat_ops_message(chat_name);
create index if not exists wechat_ops_message_sent_idx
  on public.wechat_ops_message(sent_at desc);

create extension if not exists pg_trgm;
create index if not exists wechat_ops_message_content_trgm_idx
  on public.wechat_ops_message using gin (content gin_trgm_ops);

alter table public.wechat_ops_message enable row level security;
-- service-role (admin client) only; no anon/auth policy → customers never see it.
