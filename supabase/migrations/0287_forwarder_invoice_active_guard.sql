-- 0287_forwarder_invoice_active_guard.sql
--
-- Money invariant: one tb_forwarder row may belong to at most one ACTIVE
-- (issued/paid) billing-run invoice. Migration 0138 only prevented the same
-- forwarder from appearing twice on one invoice; two concurrent app requests
-- could both pass the preflight SELECT and insert two different invoices.
--
-- The advisory transaction lock serializes writers per forwarder_id. Cancelled
-- invoices intentionally release the row for re-billing without deleting the
-- historical item.

do $$
declare
  duplicate_count integer;
begin
  select count(*)
    into duplicate_count
  from (
    select item.forwarder_id
    from public.tb_forwarder_invoice_item item
    join public.tb_forwarder_invoice invoice on invoice.id = item.invoice_id
    where invoice.status <> 'cancelled'
    group by item.forwarder_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception using
      errcode = '23505',
      message = format(
        '0287 blocked: %s forwarder(s) already belong to multiple active billing invoices',
        duplicate_count
      ),
      hint = 'Reconcile the duplicate money documents explicitly; do not auto-delete invoice history.';
  end if;
end;
$$;

create or replace function public.guard_forwarder_single_active_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_doc_no text;
begin
  -- Stable namespace + the business key. This is transaction-scoped and is
  -- automatically released on commit/rollback.
  perform pg_advisory_xact_lock(28701, new.forwarder_id);

  select invoice.doc_no
    into existing_doc_no
  from public.tb_forwarder_invoice_item item
  join public.tb_forwarder_invoice invoice on invoice.id = item.invoice_id
  where item.forwarder_id = new.forwarder_id
    and invoice.status <> 'cancelled'
  limit 1;

  if existing_doc_no is not null then
    raise exception using
      errcode = '23505',
      message = format(
        'forwarder %s is already on active invoice %s',
        new.forwarder_id,
        existing_doc_no
      ),
      hint = 'Cancel the active invoice first, then issue the replacement.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_forwarder_single_active_invoice() from public;

drop trigger if exists tb_forwarder_invoice_item_active_guard
  on public.tb_forwarder_invoice_item;
create trigger tb_forwarder_invoice_item_active_guard
before insert on public.tb_forwarder_invoice_item
for each row execute function public.guard_forwarder_single_active_invoice();

comment on function public.guard_forwarder_single_active_invoice() is
  'Serializes invoice-item inserts per forwarder and rejects a second non-cancelled billing invoice (money idempotency guard).';
