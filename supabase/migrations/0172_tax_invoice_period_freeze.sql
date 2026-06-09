-- ════════════════════════════════════════════════════════════
-- 0172 · extend the accounting-period freeze to the LIVE tb_* tax-invoice stores
-- ════════════════════════════════════════════════════════════
-- Companion to the 2026-06-10 period-close snapshot forward-fix
-- (actions/admin/accounting-periods.ts). The V-E9 period-freeze (migration 0056)
-- protects the World-A `tax_invoices` table — but every real ใบกำกับภาษี is issued
-- into the tb_*-native stores tb_forwarder_tax_invoice (mig 0129) +
-- tb_shop_tax_invoice (mig 0152). So once a period was closed, the REAL issued
-- invoices in those stores were still UPDATE/DELETE-able (cancellation, edits) —
-- the closed-book integrity gap the snapshot forward-fix surfaced.
--
-- This extends the EXISTING mechanism: NO new tables, NO new function. It
-- `create or replace`s the same accounting_period_freeze_check() with two added
-- branches, then attaches the trigger to the two stores. Both carry `issued_at`
-- (RD-86 issuance date · not null default now()) + `created_at` + `id`, mirroring
-- the tax_invoices effective-date pattern exactly.
--
-- Scope = the HEADER tables only (the money docs), matching 0056's precedent
-- (which froze tax_invoices but NOT its line/WHT children). The per-class WHT
-- entries (tb_forwarder_wht_entry / tb_shop_wht_entry) stay mutable post-close so
-- the 50-ทวิ certificate chase (cert_status pending→received · runs for weeks)
-- isn't wrongly blocked.
--
-- Behaviour today: ZERO impact — the trigger fires only BEFORE UPDATE/DELETE and
-- only blocks when the row's BKK-month period is `closed`. Prod has 0 closed
-- periods + 0 issued invoices, and issuance is INSERT (the trigger doesn't fire).
--
-- Idempotent (create or replace + drop-trigger-if-exists + create trigger).
-- ════════════════════════════════════════════════════════════

-- 1) Re-define the freeze-check function with the two tb_* branches added.
--    (Body is identical to migration 0056 except the two new elsif branches.)
create or replace function public.accounting_period_freeze_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eff_ts      timestamptz;
  v_yyyymm      text;
  v_is_closed   boolean;
begin
  -- Pick the table-appropriate effective timestamp. NULL falls back to
  -- created_at so a draft can't silently bypass the freeze.
  if tg_table_name = 'tax_invoices' then
    v_eff_ts := coalesce(old.issued_at, old.created_at);
  elsif tg_table_name = 'freight_invoices' then
    v_eff_ts := coalesce(old.issued_at, old.created_at);
  elsif tg_table_name = 'freight_invoice_payments' then
    v_eff_ts := coalesce(old.paid_at, old.created_at);
  elsif tg_table_name = 'wallet_transactions' then
    v_eff_ts := old.created_at;
  elsif tg_table_name = 'tb_forwarder_tax_invoice' then
    -- 0172: live forwarder ใบกำกับ store (mig 0129). issued_at = RD-86 date.
    v_eff_ts := coalesce(old.issued_at, old.created_at);
  elsif tg_table_name = 'tb_shop_tax_invoice' then
    -- 0172: live shop/yuan ใบกำกับ store (mig 0152). issued_at = RD-86 date.
    v_eff_ts := coalesce(old.issued_at, old.created_at);
  else
    -- Safe default for any future table the trigger gets attached to.
    v_eff_ts := old.created_at;
  end if;

  if v_eff_ts is null then
    return coalesce(new, old);
  end if;

  v_yyyymm := public.accounting_period_yyyymm_of(v_eff_ts);

  select status = 'closed'
    into v_is_closed
    from public.accounting_periods
   where period_yyyymm = v_yyyymm;

  -- No row / not closed → allow.
  if v_is_closed is null or v_is_closed = false then
    return coalesce(new, old);
  end if;

  -- Closed period → block (stable errcode for precise app-layer detection).
  raise exception
    'period_closed: % (% / %) belongs to closed accounting period %',
    tg_table_name, tg_op, old.id, v_yyyymm
    using errcode = 'P0001';
end;
$$;

comment on function public.accounting_period_freeze_check() is
  'V-E9 (+0172) — BEFORE UPDATE/DELETE guard. Blocks mutations on financial-table rows whose effective date falls in a CLOSED accounting period. Attached to tax_invoices / freight_invoices / freight_invoice_payments / wallet_transactions / tb_forwarder_tax_invoice / tb_shop_tax_invoice.';

-- 2) Attach the trigger to the two LIVE tb_* tax-invoice stores.
drop trigger if exists tb_forwarder_tax_invoice_period_freeze on public.tb_forwarder_tax_invoice;
create trigger tb_forwarder_tax_invoice_period_freeze
  before update or delete on public.tb_forwarder_tax_invoice
  for each row execute function public.accounting_period_freeze_check();

drop trigger if exists tb_shop_tax_invoice_period_freeze on public.tb_shop_tax_invoice;
create trigger tb_shop_tax_invoice_period_freeze
  before update or delete on public.tb_shop_tax_invoice
  for each row execute function public.accounting_period_freeze_check();

comment on trigger tb_forwarder_tax_invoice_period_freeze on public.tb_forwarder_tax_invoice is
  '0172 — blocks UPDATE/DELETE on forwarder tax invoices whose issued_at falls in a closed accounting period (live tb_* store · the World-B twin of the 0056 tax_invoices freeze).';
comment on trigger tb_shop_tax_invoice_period_freeze on public.tb_shop_tax_invoice is
  '0172 — blocks UPDATE/DELETE on shop/yuan tax invoices whose issued_at falls in a closed accounting period (live tb_* store).';
