-- Migration 0138 — tb_forwarder_invoice (ใบวางบิล / billing-run)
-- ============================================================================
--
-- Pacred R-2 port of legacy `hs-forwarder-invoice.php` (PCS Cargo).
-- The legacy was print-only — submit form → `printAll/` GET endpoint, never
-- persisted an invoice row anywhere. We add 2 new tables to give Pacred the
-- history the legacy lacked, while staying functionally faithful to the
-- legacy workflow (select credit-line customer → tick eligible fStatus=5
-- forwarders → mint doc-no → print + send to customer).
--
-- See: docs/audit/billing-run-port-2026-06-03.md §4 R-2 spec
-- Mirror schema-pattern: supabase/migrations/0129 (tb_forwarder_tax_invoice)
--                        supabase/migrations/0081 (tb_bill / tb_bill_item)
--
-- Doc-no format: FRI{yyMM}-{NNNNN} (Forwarder Invoice · Monthly counter)
--   - FRI = Forwarder Invoice (separate sequence vs FRG/FRC for receipts)
--   - yyMM = 4-digit year+month (e.g. 2606 = June 2026)
--   - NNNNN = 5-digit zero-padded monthly sequence per prefix
--   - Implemented in lib/admin/mint-receipt-doc-no.ts (mintForwarderInvoiceDocNo)
--
-- Status enum: 'issued' → 'paid' (terminal) | 'cancelled' (terminal)
--              'overdue' is computed (date_due < today AND status='issued'),
--              NOT stored — staff can sort/filter by it without a migration.
--
-- RLS: service_role only — Pacred admin actions use createAdminClient().
--      No customer-direct reads on these tables in R-2; the customer-side
--      page (/billing-run) reads via a Server Action that gates on
--      auth.uid() === buyer's profile.id.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. tb_forwarder_invoice (header)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists tb_forwarder_invoice (
  id                 bigserial primary key,
  doc_no             varchar(20)  not null unique,             -- FRI2606-00001
  userid             varchar(20)  not null,                    -- tb_users.userID
  buyer_name         text         not null default '',
  buyer_tax_id       varchar(20)  not null default '',
  buyer_address      text         not null default '',
  buyer_branch       varchar(50)  not null default '',
  is_juristic        boolean      not null default false,

  -- Dates (DATE not TIMESTAMPTZ — legacy admin uses <input type="date">)
  date_issued        date         not null,
  date_due           date         not null,

  -- Money breakdown (mirror legacy add.php summary: Total / CHN / TH / Other / Discount / TotalAmount)
  subtotal_thb       numeric(12,2) not null default 0,         -- Σ items.amount_thb
  delivery_chn_thb   numeric(12,2) not null default 0,
  delivery_th_thb    numeric(12,2) not null default 0,
  other_thb          numeric(12,2) not null default 0,
  discount_thb       numeric(12,2) not null default 0,
  total_thb          numeric(12,2) not null default 0,         -- = subtotal + chn + th + other - discount

  -- Lifecycle
  status             varchar(20)  not null default 'issued'
                       check (status in ('issued','paid','cancelled')),
  note_for_customer  text         not null default '',

  -- Payment trail (filled when status flips to 'paid')
  paid_at            timestamptz,
  paid_by            varchar(50),                              -- admins.id (uuid) or legacy adminID
  payment_method     varchar(30),                              -- bank_transfer / cheque / wallet
  payment_reference  varchar(200),                             -- bank-tx ref · cheque-no · wallet-tx-id

  -- Cancel trail
  cancelled_at       timestamptz,
  cancelled_by       varchar(50),
  cancel_reason      text,

  -- Audit
  issued_at          timestamptz  not null default now(),
  issued_by          varchar(50)  not null,
  created_at         timestamptz  not null default now(),
  updated_at         timestamptz  not null default now()
);

-- Index for the per-customer detail-page lookup + status filter
create index if not exists tb_forwarder_invoice_userid_status_idx
  on tb_forwarder_invoice (userid, status);

-- Index for the date-range admin list filter (issued in last 90d default)
create index if not exists tb_forwarder_invoice_date_issued_idx
  on tb_forwarder_invoice (date_issued desc);

-- Index for the daily overdue-check cron (status='issued' AND date_due < today)
create index if not exists tb_forwarder_invoice_date_due_issued_idx
  on tb_forwarder_invoice (date_due)
  where status = 'issued';

-- Updated-at trigger
create or replace function set_updated_at_tb_forwarder_invoice()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tb_forwarder_invoice_updated_at on tb_forwarder_invoice;
create trigger tb_forwarder_invoice_updated_at
  before update on tb_forwarder_invoice
  for each row execute function set_updated_at_tb_forwarder_invoice();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. tb_forwarder_invoice_item (fan-out: one row per billed forwarder)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists tb_forwarder_invoice_item (
  id            bigserial primary key,
  invoice_id    bigint       not null references tb_forwarder_invoice(id) on delete cascade,
  forwarder_id  int          not null,                         -- tb_forwarder.id (no FK — tb_forwarder is legacy uuid-less)
  amount_thb    numeric(12,2) not null,                        -- snapshot of tb_forwarder.fpaytotal at issue time
  created_at    timestamptz  not null default now(),

  unique (invoice_id, forwarder_id)                            -- a forwarder can't appear twice on the SAME invoice
);

create index if not exists tb_forwarder_invoice_item_invoice_id_idx
  on tb_forwarder_invoice_item (invoice_id);

create index if not exists tb_forwarder_invoice_item_forwarder_id_idx
  on tb_forwarder_invoice_item (forwarder_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS — service_role only (mirror tb_forwarder_tax_invoice pattern)
-- ─────────────────────────────────────────────────────────────────────────

alter table tb_forwarder_invoice      enable row level security;
alter table tb_forwarder_invoice_item enable row level security;

-- Service-role full access (createAdminClient · server-only)
drop policy if exists tb_forwarder_invoice_service_role on tb_forwarder_invoice;
create policy tb_forwarder_invoice_service_role
  on tb_forwarder_invoice for all
  to service_role
  using (true) with check (true);

drop policy if exists tb_forwarder_invoice_item_service_role on tb_forwarder_invoice_item;
create policy tb_forwarder_invoice_item_service_role
  on tb_forwarder_invoice_item for all
  to service_role
  using (true) with check (true);

-- No anon/authenticated policy — customer reads route through a Server Action
-- (gated on auth.uid()) which uses createAdminClient internally.

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Comments — for prod inspection clarity
-- ─────────────────────────────────────────────────────────────────────────

comment on table tb_forwarder_invoice is 'ใบวางบิล (Billing-run / monthly statement). Pacred R-2 port of legacy hs-forwarder-invoice.php (print-only · no persistence). doc_no = FRI{yyMM}-{NNNNN}. See docs/audit/billing-run-port-2026-06-03.md.';

comment on table tb_forwarder_invoice_item is 'Line-items for tb_forwarder_invoice (one row per billed tb_forwarder.id).';

comment on column tb_forwarder_invoice.userid is 'tb_users.userID (logical FK · tb_users uses business-key not uuid).';

comment on column tb_forwarder_invoice.total_thb is 'Final amount due = subtotal + delivery_chn + delivery_th + other - discount. Computed in TypeScript (Server Action), not DB trigger.';

comment on column tb_forwarder_invoice.status is 'issued (default) | paid (paid_at set · terminal) | cancelled (cancelled_at set · terminal). overdue is computed (date_due < today AND status=issued), NOT stored.';
