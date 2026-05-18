-- ════════════════════════════════════════════════════════════
-- BK-1.5 (G1) · Link documents to bookings + extend doc_type CHECK for
--               the booking-flow attach-documents selector.
-- ════════════════════════════════════════════════════════════
-- Closes the G1 gap from the BK-1 audit (DocAttachSelector was a
-- placeholder).  Per design [docs/research/booking-flow-system-2026-05-18.md]
-- §6.2:  "a booking's uploads are documents rows tagged with the booking_id,
-- RLS owner-only."
--
-- This migration:
--   1. Adds nullable bookings FK column `booking_id` to public.documents +
--      an index for the per-booking lookup.
--   2. Extends the doc_type CHECK constraint to include 6 booking-attachment
--      types (`booking_*`).  The original 3 juristic-registration types
--      (`company_affidavit`, `vat`, `national_id`) stay untouched — the
--      juristic-check flow keeps working.
--   3. Adds an admin-read RLS policy on public.documents for the standard
--      admin role set, so /admin/bookings/[bookingNo] can list attachments.
--      (Customers continue to read only their own via the existing
--      documents_select_own policy from schema.sql.)
--
-- Idempotent.  Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) Add booking_id column + index ──────────────────────────────────
alter table public.documents
  add column if not exists booking_id uuid references public.bookings(id) on delete set null;

create index if not exists documents_booking_id_idx
  on public.documents(booking_id)
  where booking_id is not null;

-- ── 2) Extend doc_type CHECK ──────────────────────────────────────────
-- The 3 original juristic types + 6 booking types.  Other features that
-- need their own doc_type values can add them via their own ALTER
-- (idempotent drop+add pattern — see 0024 / 0026 for the precedent).
alter table public.documents
  drop constraint if exists documents_doc_type_check;

alter table public.documents
  add constraint documents_doc_type_check
  check (doc_type in (
    -- Juristic registration (original)
    'company_affidavit',
    'vat',
    'national_id',
    -- Booking attachments (BK-1.5)
    'booking_invoice',
    'booking_packing_list',
    'booking_certificate',
    'booking_vat_paw20',
    'booking_national_id',
    'booking_passport'
  ));

-- ── 3) Admin RLS read policy ──────────────────────────────────────────
-- The customer-side documents_select_own policy is unchanged (owner-only).
-- This adds an OR-branch admin policy so the admin booking detail page
-- (which uses createAdminClient anyway for now) plus future RLS-aware
-- admin reads can list a booking's attachments.
drop policy if exists "documents_admin_read" on public.documents;
create policy "documents_admin_read" on public.documents
  for select
  using (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 4) Comments ───────────────────────────────────────────────────────
comment on column public.documents.booking_id is
  'BK-1.5 — when a document is uploaded as a booking attachment (via actions/bookings.ts:uploadBookingDocument), this FK points to the parent booking. NULL for juristic-registration documents + other non-booking uploads. ON DELETE SET NULL so a booking deletion does not cascade away the storage object''s metadata row.';

comment on constraint documents_doc_type_check on public.documents is
  'BK-1.5 — extended from the original 3 juristic types to also accept 6 booking attachment kinds (invoice / packing_list / certificate / vat_paw20 / national_id / passport — each prefixed `booking_`). Add new feature types via the same drop+add idempotent pattern used here.';

comment on policy "documents_admin_read" on public.documents is
  'BK-1.5 — admin (super/ops/sales_admin/accounting) reads ALL documents (PII surface — same role set as /admin/customers). Customer-side select stays scoped to own via documents_select_own.';
