-- ════════════════════════════════════════════════════════════
-- G2e-2 (R3) · tax_invoices.credit_note_for_id — bidirectional credit-note link
-- ════════════════════════════════════════════════════════════
-- Per ADR-0006 §7 + RD Code 86 — when admin needs to refund a paid invoice
-- (not just typo correction — that uses the existing cancel→reissue path),
-- they cancel the original AND issue a "ใบลดหนี้" (credit note) that
-- references the original.
--
-- Original schema (0034) shipped one-direction link via `credit_note_id`
-- pointing FROM the cancelled original TO the credit note.  To make the
-- credit note self-identifying (without an indirect lookup) this adds
-- the inverse pointer:  credit_note_for_id  FROM the credit note  TO  the
-- original tax invoice.
--
-- A row's identity then maps cleanly:
--   credit_note_id     IS NOT NULL  →  original-that-has-been-credited
--   credit_note_for_id IS NOT NULL  →  this row IS a credit note
--   both NULL                       →  normal invoice (default)
--
-- The original `credit_note_id` column is kept (back-compat + the customer
-- detail page already reads it).  The new column is purely additive.
--
-- Idempotent.  Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- 1) Add the inverse-pointer column
alter table public.tax_invoices
  add column if not exists credit_note_for_id uuid references public.tax_invoices(id);

-- Index for "find the credit note for an original invoice" / customer
-- portal "show all credit notes I have received".
create index if not exists tax_invoices_credit_note_for_idx
  on public.tax_invoices(credit_note_for_id)
  where credit_note_for_id is not null;

-- 2) Bidirectional consistency constraint
-- A credit note (credit_note_for_id IS NOT NULL) MUST be issued (status='issued'
-- with a serial) — never pending or cancelled.
alter table public.tax_invoices
  drop constraint if exists tax_invoices_credit_note_is_issued;

alter table public.tax_invoices
  add constraint tax_invoices_credit_note_is_issued check (
    credit_note_for_id is null
    or status = 'issued'
  );

-- 3) Comments
comment on column public.tax_invoices.credit_note_for_id is
  'G2e-2 — when this row IS a credit note (ใบลดหนี้), points to the original cancelled tax invoice it credits.  Inverse of credit_note_id (which points FROM the original TO this credit note).  Both columns populated bidirectionally on issuance.';

comment on constraint tax_invoices_credit_note_is_issued on public.tax_invoices is
  'G2e-2 — a credit note (credit_note_for_id NOT NULL) is always issued, never draft/cancelled (creating a draft credit note has no business meaning — issuance is atomic).';
