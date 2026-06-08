-- ════════════════════════════════════════════════════════════════
-- 0149 — Customer delivery feedback (Phase 4a · ops-workflow audit 2026-06-05 §32)
-- ════════════════════════════════════════════════════════════════
-- WHY (ops-workflow audit 2026-06-05 — Phase 4a):
--   Today the only "reviews" are static marketing copy. After a forwarder
--   reaches fstatus=7 (delivered) the customer has no place to tell us
--   *this* shipment was good/bad — so we never close the dispatch loop
--   and never catch a damaged box / slow driver / wrong address before
--   it festers in LINE OA.
--
-- WHAT THIS TABLE STORES:
--   One row per fid (tb_forwarder.id), inserted by the customer from
--   /service-import/[fNo] AFTER tb_forwarder.fstatus='7'. All three
--   content fields (rating · comment · photo_path) are OPTIONAL but
--   at least ONE must be present (the CHECK below enforces it — keeps
--   the table free of empty submissions).
--
-- WHEN ROWS ARE CREATED:
--   actions/delivery-feedback.ts::submitDeliveryFeedback validates:
--     1. caller owns the forwarder (tb_forwarder.userid = member_code)
--     2. tb_forwarder.fstatus = '7' (delivered)
--     3. within 7 days of tb_forwarder.fdatestatus7 (edit window)
--     4. at least one of (rating, comment, photo_path) is non-null
--   Inserts via UPSERT on the unique fid (one feedback per forwarder).
--
-- ADMIN READOUT:
--   /admin/reports/delivery-feedback (ops/super/sales_admin/accounting).
--   Reads via createAdminClient (service_role) — same pattern as the
--   rest of the tb_* legacy lane (no anon/authenticated policies needed).
--
-- ISOLATION:
--   1 NEW table · FK to tb_forwarder (cascade delete — if the forwarder
--   is purged, its feedback goes with it). NO touch to legacy tb_*.
--
-- STORAGE:
--   Photos go to the existing `slips` bucket (migration 0007) under the
--   path `{auth.uid()}/delivery_feedback/{fid}_{ts}.{ext}` — reuses the
--   per-user folder RLS already in place (`auth.uid()::text =
--   (storage.foldername(name))[1]`) so no new bucket/policy needed.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Table ──
create table if not exists public.delivery_feedback (
  id           bigserial primary key,
  fid          bigint      not null references public.tb_forwarder(id) on delete cascade,
  -- Legacy userid (tb_users.userID — text PR-code). Snapshot at submission
  -- so a future reassignment can't orphan the row.
  userid       varchar(20) not null,

  -- All three OPTIONAL — customer can skip rating / comment / photo
  -- individually. CHECK constraint below guarantees ≥1 is set so
  -- the table doesn't fill with empty rows.
  rating       smallint    check (rating is null or rating between 1 and 5),
  comment      text        check (comment is null or char_length(comment) <= 500),
  photo_path   text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One feedback per forwarder (UPSERT target).
  constraint delivery_feedback_fid_uniq unique (fid),
  -- At least one content field present (rating OR comment OR photo).
  constraint delivery_feedback_content_present check (
    rating is not null or comment is not null or photo_path is not null
  )
);

-- ── 2) Indexes ──
create index if not exists delivery_feedback_userid_idx
  on public.delivery_feedback (userid);
create index if not exists delivery_feedback_rating_idx
  on public.delivery_feedback (rating) where rating is not null;
create index if not exists delivery_feedback_created_idx
  on public.delivery_feedback (created_at desc);

-- ── 3) updated_at auto-touch (reuse shared trigger fn if present) ──
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists delivery_feedback_updated_at on public.delivery_feedback;
    create trigger delivery_feedback_updated_at
      before update on public.delivery_feedback
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ── 4) RLS — service_role only (matches the rest of the tb_* lane:
--        customer + admin reads/writes both flow through Server Actions
--        that use createAdminClient and validate ownership in app code).
alter table public.delivery_feedback enable row level security;
-- No anon/authenticated policies → default-deny for both. service_role
-- bypasses RLS, so Server Actions still work; a customer with the anon
-- key cannot read/write directly.

-- ── 5) Comments ──
comment on table public.delivery_feedback is
  'Customer delivery feedback (ops-workflow audit 2026-06-05 §32 Phase 4a). One row per tb_forwarder.id, inserted from /service-import/[fNo] after fstatus=7. All three content fields (rating/comment/photo_path) are optional but ≥1 must be set. Access via Server Actions only (service_role); customer ownership = tb_forwarder.userid = caller member_code; admin readout at /admin/reports/delivery-feedback.';
comment on column public.delivery_feedback.rating is
  '1-5 stars · optional (customer can submit only text or only photo).';
comment on column public.delivery_feedback.comment is
  'Free-text comment · optional · max 500 chars.';
comment on column public.delivery_feedback.photo_path is
  'Storage path in the slips bucket — {auth.uid()}/delivery_feedback/{fid}_{ts}.{ext}. Reuses the existing slips bucket RLS (auth.uid()::text = (storage.foldername(name))[1]) so customer can upload without a new bucket policy.';
