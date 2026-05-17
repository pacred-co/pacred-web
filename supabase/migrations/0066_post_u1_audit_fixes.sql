-- ════════════════════════════════════════════════════════════
-- Post-U1 audit follow-ups (commits 871450b + 0e652f0 + 185adfd)
-- ════════════════════════════════════════════════════════════
-- Per the audit verdict 🟡 ship-with-followup, this migration closes
-- the two server-side gaps that the audit flagged. The third concern
-- (legacy containers.ts writing only to the legacy table) was fixed
-- in code (the legacy actions now return a deprecation error +
-- /admin/containers/[id] redirects to the spine).
--
-- ── Fix 1: refund_requests transition lock ──────────────────────────
-- Audit MED#2: paid → approved reversal would let admin double-credit
-- the same refund. Add a BEFORE UPDATE trigger that forbids any
-- transition OUT of terminal states (paid, rejected).
--
-- ── Fix 2: freight_invoices single-active-per-shipment ──────────────
-- Audit LOW#3: concurrent adminMarkFreightDelivered calls have a TOCTOU
-- window where both pass the "no existing invoice" pre-check and both
-- INSERT. Add a partial unique index on freight_invoice_id WHERE
-- status != 'cancelled' so the DB collapses the race to one row.
--
-- Both fixes are idempotent + additive. No data migration.
-- ════════════════════════════════════════════════════════════

-- ── Fix 1: refund_requests transition lock ──────────────────────────

create or replace function public.refund_requests_block_terminal_reversal()
returns trigger as $$
begin
  -- Block any transition OUT of terminal states. paid + rejected are
  -- final; the only allowed updates to those rows are no-op (same status)
  -- or admin metadata fixes (e.g. typo in reason). Any other status
  -- change raises.
  if old.status in ('paid', 'rejected') and new.status <> old.status then
    raise exception
      'refund_requests cannot be reopened from terminal state % (id=%, request_no=%) — create a new request for the corrective refund',
      old.status, old.id, old.request_no
      using errcode = '23514';  -- check_violation
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists refund_requests_block_terminal_reversal_trigger on public.refund_requests;
create trigger refund_requests_block_terminal_reversal_trigger
  before update on public.refund_requests
  for each row execute function public.refund_requests_block_terminal_reversal();

comment on function public.refund_requests_block_terminal_reversal() is
  'Audit MED#2 follow-up to commit 0e652f0: blocks status changes OUT of terminal states (paid, rejected). Closes the "re-flip approved then double-credit" hole. Allowed: same-status updates + metadata edits. To correct a wrongful paid/rejected, create a NEW refund_requests row.';

-- ── Fix 2: freight_invoices single-active-per-shipment ──────────────

create unique index if not exists freight_invoices_one_active_per_shipment_uidx
  on public.freight_invoices(freight_shipment_id)
  where status <> 'cancelled';

comment on index public.freight_invoices_one_active_per_shipment_uidx is
  'Audit LOW#3 follow-up to commit 871450b: ensures at most one non-cancelled freight_invoice exists per freight_shipment, closing the TOCTOU race in adminMarkFreightDelivered auto-draft (the existence pre-check is not race-safe). Concurrent inserts now collapse to one row via DB-level constraint.';

-- ── Verify (counts) ─────────────────────────────────────────────────

do $$
declare
  dupe_freight_invoice_count int;
  terminal_refund_count      int;
begin
  -- Surface any pre-existing duplicate freight_invoices that would
  -- prevent the new index from being created. The CREATE INDEX IF NOT
  -- EXISTS above won't fail loudly on dupes — Postgres will warn.
  select count(*) - count(distinct freight_shipment_id) into dupe_freight_invoice_count
    from public.freight_invoices
    where status <> 'cancelled';
  if dupe_freight_invoice_count > 0 then
    raise warning 'freight_invoices has % duplicate non-cancelled rows per shipment — manual cleanup needed before unique index is enforceable', dupe_freight_invoice_count;
  end if;

  select count(*) into terminal_refund_count
    from public.refund_requests
    where status in ('paid', 'rejected');
  raise notice 'refund_requests transition-lock active over % terminal rows', terminal_refund_count;
end$$;
