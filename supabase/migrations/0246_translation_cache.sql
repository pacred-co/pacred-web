-- ════════════════════════════════════════════════════════════
-- 0246 · translation_cache — cached ZH→TH translations (in-house translate tool)
-- ════════════════════════════════════════════════════════════
-- The reusable translate tool (lib/translate/zh-to-th.ts) translates Chinese
-- product fields (ชื่อสินค้าจีน · ชื่อร้าน · สี/ขนาด · หมายเหตุ) to Thai on demand
-- via a FREE keyless endpoint (Google gtx → MyMemory fallback). To avoid re-hitting
-- the endpoint for the same string (the same product name repeats across many rows
-- and surfaces), each successful translation is cached here.
--
-- WHAT THIS IS:
--   A pure REFERENCE cache. One row per unique (source_text · target_lang), keyed by
--   sha256(source + "|" + lang). Written ONLY by translateZhToTh via the service-role
--   admin client (idempotent upsert on source_hash). Read only inside that helper.
--
-- WHAT THIS IS NOT:
--   - NOT a money/status table. NO FK to any order/pay/forwarder/wallet/rate table.
--     Nothing here feeds pricing, status, or any business math (mirrors the
--     taem_packing_line / container_packing_reconcile isolation rule · §0e).
--   - NOT a customer-queried table. Customers never SELECT it directly — the
--     translate server action reads/writes it via the service-role client only, so
--     there is intentionally NO public read policy (service_role bypasses RLS).
--
-- Additive + idempotent (create … if not exists). Safe to re-run. Next free = 0247.
-- ════════════════════════════════════════════════════════════

create table if not exists public.translation_cache (
  source_hash  text primary key,                 -- sha256(source_text + "|" + target_lang)
  source_text  text not null,
  target_text  text not null,
  target_lang  varchar(8) not null default 'th',
  created_at   timestamptz not null default now()
);

alter table public.translation_cache enable row level security;

-- No public policy on purpose: the ONLY reader/writer is the service-role client
-- inside translateZhToTh (service_role bypasses RLS). Customers/staff reach the
-- translation exclusively through the bounded translateTextAction server action.

comment on table public.translation_cache is
  'Cached ZH→TH translations for the in-house translate tool (2026-07-09). One row per unique (source_text · lang), key = sha256(source + "|" + lang). Written/read ONLY by translateZhToTh via the service-role client. Pure reference cache — NO FK to any money/status/rate table (§0e isolation).';
comment on column public.translation_cache.source_hash is
  'sha256(source_text + "|" + target_lang) — the primary cache key computed in lib/translate/zh-to-th.ts.';
comment on column public.translation_cache.target_lang is
  'Target language code (currently only "th"). Part of the hash so the same source can cache multiple targets later.';
