-- 0251_doc_bot_hs_source.sql
-- Owner 2026-07-10: the HS library grows from MULTIPLE sources — the DOC BOT import (749,
-- mig 0249) + an owner Excel file "1 . พิกัด อัพเดท.xlsx" (~4,586 rows across sheets
-- คำศัพท์-คำแปล / nnb / Vat). Owner: "เอาออกมาให้ครบ · แสดงรวมกับ docbot ไปเลย". So we load
-- the file's rows into the SAME doc_bot_hs_codes store (the browse reads it) + tag each row's
-- origin with a `source` column so the merged view can badge/filter by where it came from.
-- Existing 749 bot rows default to 'doc_bot'. The file rows import as 'ไฟล์:<sheet>'.
-- Additive · idempotent · no FK to money tables (§0e isolation).

alter table public.doc_bot_hs_codes
  add column if not exists source text not null default 'doc_bot';

create index if not exists doc_bot_hs_codes_source_idx on public.doc_bot_hs_codes (source);
