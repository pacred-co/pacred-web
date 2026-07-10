-- 0249_doc_bot_hs_import.sql
-- Owner 2026-07-09: move the ENTIRE DOC BOT database (a separate Supabase project ·
-- blhdxmcmepmmdfmqqvdg) into the MAIN DB — the real, live HS-CODE knowledge base to
-- develop further. This creates the doc_bot_* landing tables (a FAITHFUL/lossless copy
-- of the 5 DOC BOT tables); the data is copied by scripts/import-doc-bot-2026-07-09.mjs.
-- Kept SEPARATE from the clean canonical hs_codes (mig 0224) so the messy bot lookup
-- (749 rows · 20 empty codes · 138 dup groups) does not pollute it — reconcile/merge the
-- good entries into hs_codes as a later "develop further" step.
-- Additive · idempotent · RLS service-role-only (§0e isolation · no FK to money tables).

-- The HS-code lookup the DOC bot learned (product th/en → hs_code + duty).
create table if not exists public.doc_bot_hs_codes (
  id           uuid primary key default gen_random_uuid(),
  hs_code      text,
  th           text,               -- Thai product/description
  en           text,               -- English product/description
  fe           text,               -- Form-E duty
  no           text,               -- normal duty (อากรปกติ)
  stat         text,               -- statistical code (รหัสสถิติ)
  note         text,
  imported_at  timestamptz not null default now()
);
create index if not exists doc_bot_hs_codes_hs_code_idx on public.doc_bot_hs_codes (hs_code);

-- The DOC team's manual HS corrections (keyword → correct_hs).
create table if not exists public.doc_bot_hs_overrides (
  id          uuid primary key default gen_random_uuid(),
  user_id     text,
  keyword     text,
  correct_hs  text,
  note        text,
  created_at  timestamptz
);
create index if not exists doc_bot_hs_overrides_keyword_idx on public.doc_bot_hs_overrides (keyword);

-- The bot's conversation history (for future development / training context).
create table if not exists public.doc_bot_conversation_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     text,
  role        text,
  content     text,
  created_at  timestamptz
);
create index if not exists doc_bot_conversation_history_user_idx on public.doc_bot_conversation_history (user_id);

-- The bot's per-user conversation state.
create table if not exists public.doc_bot_conversation_state (
  user_id     text primary key,
  state       text,
  data        jsonb,
  updated_at  timestamptz
);

-- The bot's per-user session state (mode/step machine).
create table if not exists public.doc_bot_state (
  user_id     text primary key,
  mode        text,
  step        text,
  temp_name   text,
  temp_field  text
);

alter table public.doc_bot_hs_codes             enable row level security;
alter table public.doc_bot_hs_overrides         enable row level security;
alter table public.doc_bot_conversation_history enable row level security;
alter table public.doc_bot_conversation_state   enable row level security;
alter table public.doc_bot_state                enable row level security;

comment on table public.doc_bot_hs_codes is 'DOC BOT HS-code lookup (product→code · imported from the DOC BOT Supabase 2026-07-09 · reconcile into canonical hs_codes later).';
