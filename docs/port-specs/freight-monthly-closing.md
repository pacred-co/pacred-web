# Port-spec — Freight monthly closing ritual (V-E9)

> **Status:** 🟡 spec by เดฟ — Phase I2 backend prep for ภูม. Pairs with V-E7 (freight invoices) + V-A8 (ภพ.30 export).
> **Date:** 2026-05-16 night · **Owner:** ภูม (impl) · **Source:** PORT_PLAN Part V `V-E9` + deep-sweep audit §5.1 G.
>
> **Read with:**
> [`docs/port-specs/freight-receipt-and-payment.md`](freight-receipt-and-payment.md) (V-E7 — feeds this ritual) ·
> [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §4 A8 (ภพ.30 reconciliation problem) ·
> [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V.

---

## Context

Legacy PHP `closingAccReportForwarder.php` (32KB) + subdir `pages/closingAccReportForwarder/home.php` implement a **month-end closing ritual** for the accounting team:

1. Staff picks a month (e.g. "May 2026")
2. System queries all `tb_receipt` rows linked to forwarders for that month
3. Shows summary: total invoiced · total received · pending · refunds
4. Status breakdown per receipt + drill-down to source forwarder
5. Once accounting confirms numbers match — **freezes** the period (no more edits to past month's invoices/payments)

Pacred today: `/admin/accounting/closing` page exists (stub, per ภูม night-1 batch) — verify if matches PHP ritual or needs extension.

Without proper closing:
- Accounting can't trust monthly totals (PHP forensics §4 A8: Oct/68 off by ฿15,192 due to manual edits to past-month receipts)
- ภ.พ.30 (Thai VAT return) reconciliation fails
- Future PEAK ERP export (V-F2) has no clean monthly boundary

---

## Data model

### `accounting_periods` — the freeze marker

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `period_year` | smallint | e.g. 2026. |
| `period_month` | smallint check (1..12) | |
| `kind` | text check | `cargo` · `freight` · `combined` — separate close rituals per business line (since they may close at different times). |
| `status` | text check | `open` (default; rows can be edited) · `pending_close` (staff requested, super to approve) · `closed` (frozen; only super can re-open). |
| `gross_invoiced_thb` | numeric(14,2) | snapshot Σ of all invoices issued in period; computed at close. |
| `total_received_thb` | numeric(14,2) | snapshot Σ of all confirmed payments in period. |
| `outstanding_thb` | numeric(14,2) | = gross − received. |
| `refunds_thb` | numeric(14,2) | snapshot Σ of refunds in period. |
| `vat_collected_thb` | numeric(14,2) | snapshot Σ VAT for ภ.พ.30 cross-check. |
| `wht_credited_thb` | numeric(14,2) | snapshot Σ WHT received (V-A6) for ภ.ง.ด credit. |
| `closed_at` · `closed_by_admin_id` | nullable | |
| `reopened_at` · `reopened_by_admin_id` · `reopened_reason` | nullable | when status closed → open (rare; super-only; requires reason). |
| `notes` | text | |
| `created_at` · `updated_at` | timestamptz | |

**Unique:** `(period_year, period_month, kind)` — one row per period × kind.

### Read-only enforcement (the actual "freeze")

Once `status='closed'`, the following tables MUST reject UPDATE/DELETE for rows whose `created_at` (or `issued_at` for invoices) falls within the closed period — enforced via **trigger function**:

- `freight_invoices` (V-E7)
- `freight_invoice_lines` (V-E7)
- `freight_invoice_payments` (V-E7)
- `wallet_transactions` (existing — for cargo side)
- `cargo_shipments` financial fields only (volume_cbm / weight / cargo_type can still update for tracking corrections; but billed_at + total snapshots freeze)
- `tax_invoices` (migration 0034 — already immutable, but trigger reinforces)
- `withholding_tax_entries` (V-A6 — once ADR-0015 locked)

**Trigger sketch:**

```sql
create or replace function freight_freeze_check() returns trigger as $$
declare
  ref_at timestamptz;
  ref_period_y smallint;
  ref_period_m smallint;
  is_closed bool;
begin
  -- pick the relevant timestamp per table
  if TG_TABLE_NAME = 'freight_invoices' then
    ref_at := OLD.issued_at;
  elsif TG_TABLE_NAME = 'freight_invoice_payments' then
    ref_at := OLD.created_at;
  else
    ref_at := OLD.created_at;
  end if;

  ref_period_y := extract(year from ref_at)::smallint;
  ref_period_m := extract(month from ref_at)::smallint;

  select status='closed' into is_closed
    from accounting_periods
   where period_year = ref_period_y
     and period_month = ref_period_m
     and kind in ('freight','combined');

  if is_closed then
    -- Allow super to override (rare; for re-opening case)
    if exists (select 1 from admins where profile_id = auth.uid() and role = 'super') then
      return NEW; -- log via audit; allowed
    end if;
    raise exception 'accounting_period_closed: % %', ref_period_y, ref_period_m
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

-- Attach trigger to each protected table
create trigger freight_invoices_freeze
  before update or delete on freight_invoices
  for each row execute function freight_freeze_check();
-- ...repeat for freight_invoice_lines, freight_invoice_payments
```

> **⚠️ Open question for ก๊อต:** Re-open allowed at all? Some companies have policy "absolutely no edits after close — issue credit-note in current period instead." Recommend: super-only re-open with required reason + audit; max 1 re-open per period.

### RLS

```sql
alter table accounting_periods enable row level security;
create policy accounting_periods_admin_read on accounting_periods for select
  using (is_admin(array['super','accounting','ops']));  -- ops sees status for context but can't mutate
create policy accounting_periods_admin_write on accounting_periods for all
  using (is_admin(array['super','accounting']))
  with check (is_admin(array['super','accounting']));
```

---

## Server actions outline

`actions/admin/accounting-periods.ts` (super + accounting):

```ts
adminRequestPeriodClose(input: { period_year: number; period_month: number; kind: 'cargo'|'freight'|'combined' }): Promise<AdminActionResult<{ id: string }>>
//   open → pending_close
//   computes snapshot totals (gross / received / outstanding / refunds / vat / wht)
//   notifies super for approval

adminApprovePeriodClose(id: string): Promise<AdminActionResult>
//   pending_close → closed
//   re-snapshots totals to capture any late edits since request
//   stamps closed_at + closed_by_admin_id

adminRejectPeriodClose(id: string, reason: string): Promise<AdminActionResult>
//   pending_close → open (revert; staff fixes issues)

adminReopenPeriod(id: string, reason: string): Promise<AdminActionResult>
//   closed → open (super-only)
//   requires reason ≥ 20 chars (this is rare + serious)
//   audit + notify accounting team
```

**Idempotency:** UNIQUE constraint on `(period_year, period_month, kind)` prevents duplicate periods. Request → optimistic `eq('status', 'open')`.

**Audit:** every transition writes `admin_audit_log` per ADR-0014.

---

## UI outline

**Admin (`/admin/accounting/closing`):**
- Calendar grid view: 13 months back (current + 12 prior) per business line (cargo / freight tabs)
- Each cell shows: status pill (open / pending_close / closed) + small totals preview
- Click cell → detail panel:
  - **If open:** "ขอปิดงวด" button (with confirm dialog showing snapshot preview)
  - **If pending_close:** super sees "อนุมัติ" + "ปฏิเสธ (พร้อมเหตุผล)" buttons; accounting sees "รอ super อนุมัติ"
  - **If closed:** read-only summary + super sees "Reopen" button (with required reason textbox)
- Drill-down: click invoice count → full list of invoices in that period
- CSV export per period (for ภ.พ.30 filing)

---

## Migration note

One migration: `accounting_periods` table + the freeze-check trigger function + triggers on V-E7 tables (run AFTER V-E7 migration lands). ภูม assigns the number; likely lands `0049+` (after V-E6/E7/E8 series).

If `/admin/accounting/closing` stub already exists (per ภูม night-1) — verify the page reads `accounting_periods` from this migration; the stub may have used a different data shape. ภูม audits + adjusts.

---

## Acceptance

- Accounting can pick a month + kind (cargo/freight/combined), preview totals snapshot, request close
- Super approves → period flips to closed; trigger blocks all future mutations on financial tables for that period
- Attempted edit by non-super → DB returns `accounting_period_closed: 2026 5` error → UI shows friendly message
- Super can re-open with reason (super-only, audit-logged, max-1-per-period rule TBD)
- CSV export matches ภ.พ.30 line items (verify with accounting team using known historical data)
- The Oct/68 type discrepancy (forensics §4 A8) becomes structurally impossible — past months frozen, current month adjustments go via credit-note (immutable + traceable)

---

## Cross-references

- Schedule → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-E9`
- Pairs with → [`port-specs/freight-receipt-and-payment.md`](freight-receipt-and-payment.md) V-E7
- Pairs with → V-A8 ภ.พ.30 export (future)
- Audit pattern → [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)
- Legacy PHP source → `/Users/dev/Desktop/pcscargo/member/pcs-admin/closingAccReportForwarder.php` + `include/pages/closingAccReportForwarder/home.php`
- Forensics → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §4 A8

**End of V-E9 spec.** ก๊อต: confirm re-open policy (max 1? super-only?). ภูม: implement AFTER V-E7 lands (this depends on freight_invoices tables existing).
