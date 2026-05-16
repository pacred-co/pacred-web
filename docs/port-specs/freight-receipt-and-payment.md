# Port-spec — Freight receipt & payment tracking (V-E7)

> **Status:** 🟡 spec by เดฟ — Phase I2 backend prep for ภูม. Pairs tightly with ADR-0006 (tax-invoice) + ADR-0015 (WHT) + ADR-0016 (freight value model).
> **Date:** 2026-05-16 night · **Owner:** ภูม (impl) · **Source:** PORT_PLAN Part V `V-E7` + deep-sweep audit §5.1.
>
> **Read with:**
> [`docs/port-specs/freight-document-suite.md`](freight-document-suite.md) (V-E1 — `freight_shipments` spine this extends) ·
> [`docs/decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md) (downstream Thai tax invoice) ·
> [`docs/decisions/0015-withholding-tax-model.md`](../decisions/0015-withholding-tax-model.md) (WHT — pairs with this on receipt issuance) ·
> [`docs/decisions/0016-freight-value-model.md`](../decisions/0016-freight-value-model.md) (real vs declared value) ·
> [`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §5.1 H ·
> [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V.

---

## Context

Legacy PHP `tb_receipt` (25 cols) + `tb_receipt_item` model the **freight invoice + payment receipt** lifecycle separately from the cargo wallet system (`wallet_transactions`). Real cases from the ไอแต้ม chat show:

1. A freight job (`freight_shipments`) ships → admin issues a commercial **invoice** (the "ใบแจ้งหนี้"; this is V-E1 Commercial Invoice).
2. Customer pays (sometimes partial; sometimes after withholding tax → V-A6).
3. Admin records the **payment** and issues a **receipt** (PHP "ใบเสร็จรับเงิน" / "ใบกำกับภาษี/ใบเสร็จ" combined RD Code 86 doc per ADR-0006).
4. At month-end, all unsettled invoices feed the **monthly closing report** (V-E9 — separate spec).

Pacred today: forwarder + service-order use **wallet ledger** (`wallet_transactions`) for cargo customer payments. **Freight has no model.** This spec adds the receipt/payment layer specific to freight (which is single-consignee, multi-line, large-value, with WHT — fundamentally different shape from the consolidated-cargo wallet flow).

### Why NOT just extend `wallet_transactions`?

- Freight invoices are multi-line (commercial invoice items); wallet has flat amount.
- Freight payments are often partial + spread across weeks; wallet is one-shot debit/credit.
- Freight needs WHT, RD Code 86 receipt numbering, and joins to `freight_shipments` + `freight_invoice_lines` (per V-E1) — wallet doesn't.
- Freight customers may pay via bank transfer with separate slips per partial — wallet conflates this.

So `freight_invoices` + `freight_invoice_payments` is a **parallel ledger** for freight. Customer-side total balance (when shown) sums BOTH wallet + freight ledger.

---

## Data model

### `freight_invoices` — invoice header (also serves as the "issued receipt" once paid)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `invoice_no` | text unique | format: `INV-{YYMM}-{seq}` per ADR-0006 K-6 numbering rule (atomic via `next_freight_invoice_serial()` SECURITY DEFINER fn — mirror migration 0034). |
| `freight_shipment_id` | uuid FK → `freight_shipments(id)` | required (every freight invoice belongs to one shipment). |
| `profile_id` | uuid FK → `profiles(id)` | customer (consignee). |
| `buyer_name_snapshot` | text | mirror tax_invoices snapshot at issuance. |
| `buyer_tax_id_snapshot` | text | 13-digit. |
| `buyer_address_snapshot` | text | |
| `buyer_branch_snapshot` | text | `00000` for HQ; per Thai RD rule. |
| `subtotal_thb` | numeric(12,2) | Σ invoice lines. |
| `vat_pct` | numeric(4,2) default `7.00` | |
| `vat_amount_thb` | numeric(12,2) | snapshot at issuance — frozen. |
| `total_thb` | numeric(12,2) | `subtotal + vat`. |
| `wht_applies` | bool default false | mirror ADR-0015 flag. |
| `wht_rate_pct` | numeric(4,2) nullable | 1.00 / 1.50 / 2.00 / 3.00 / 5.00 (per ADR-0015 fastlane Q1). |
| `wht_base_thb` | numeric(12,2) nullable | staff-confirmed WHT-able portion. |
| `wht_amount_thb` | numeric(12,2) nullable | `round(wht_base × wht_rate/100, 2)`. |
| `net_expected_thb` | numeric(12,2) | `total - wht_amount` (= `total` if no WHT). |
| `status` | text check | `pending` (issued, awaiting payment) → `partial_paid` → `fully_paid` → `overpaid` (rare) ; `cancelled` (admin void w/ reason). |
| `issued_at` | timestamptz | first generation time — frozen. |
| `issued_by_admin_id` | uuid FK → `profiles(id)` | super/accounting only. |
| `pdf_storage_path` | text | Supabase Storage `freight-invoices/{profile_id}/{invoice_no}.pdf`. |
| `cancelled_at` · `cancelled_by_admin_id` · `cancelled_reason` | nullable | RD Code 86 immutability — cancel + issue replacement (no edit). |
| `due_at` | date | typical T+30; configurable. |
| `notes` | text | |
| `created_at` · `updated_at` | timestamptz | standard. |

**Constraints:**
- `freight_invoices_status_chk`: in the enum
- `freight_invoices_wht_consistency`: `wht_applies=true → wht_rate_pct + wht_base_thb + wht_amount_thb all not null AND wht_rate_pct in (1, 1.5, 2, 3, 5)`
- `freight_invoices_cancelled_consistency`: `status='cancelled' → cancelled_*` all set

### `freight_invoice_lines` — invoice line items

If V-E1 (Commercial Invoice generator per [`freight-document-suite.md`](freight-document-suite.md)) already has a `freight_invoice_lines` table for the commercial-invoice document, **REUSE** that table — add `freight_invoice_id` FK to point to the receipt-side header. Same lines describe both documents.

If V-E1 doesn't have its own line table yet, this spec OWNS it:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `freight_invoice_id` | uuid FK → `freight_invoices(id)` on delete restrict | |
| `position` | smallint | display order. |
| `description` | text | line description (Thai + English). |
| `qty` | numeric(12,3) | |
| `unit` | text | `JOB` / `CBM` / `KGM` / `PCS`. |
| `unit_price_thb` | numeric(12,2) | range-guarded. |
| `line_total_thb` | numeric(12,2) | computed = qty × unit_price; frozen at issuance. |
| `wht_able` | bool default false | per-line flag for V-A6 base computation (sum of `wht_able=true` lines = `wht_base_thb`). |

### `freight_invoice_payments` — per-payment record

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `freight_invoice_id` | uuid FK → `freight_invoices(id)` on delete restrict | |
| `profile_id` | uuid FK → `profiles(id)` | denorm for RLS query speed (must match invoice's profile_id; CHECK). |
| `kind` | text check | `slip_transfer` (bank slip) · `cash` · `cheque` · `wallet_debit` (rare; bridge to wallet ledger) · `wht_credit` (paper credit when customer hands the หนังสือรับรองหัก ณ ที่จ่าย / 50 ทวิ — see ADR-0015). |
| `amount_thb` | numeric(12,2) | positive. |
| `slip_transferred_at` | timestamptz nullable | mirror `wallet_transactions.slip_transferred_at` per V-A1 (actual bank-print time, not approval time). |
| `slip_storage_path` | text nullable | `freight-payment-slips/{profile_id}/{invoice_no}-{seq}.{ext}`. |
| `bank_ref` | text nullable | bank reference number from slip. |
| `wht_cert_no` | text nullable | the 50 ทวิ running number (when kind=`wht_credit`). |
| `wht_cert_storage_path` | text nullable | the certificate file upload (when kind=`wht_credit`) — pairs with ADR-0015 V1 admin-only path. |
| `recorded_by_admin_id` | uuid FK → `profiles(id)` | accounting + super only. |
| `status` | text check | `pending` → `confirmed` → `rejected` (with reason). |
| `rejected_reason` | text nullable | required when status=`rejected`. |
| `note` | text | |
| `created_at` · `updated_at` | timestamptz | |

**Constraints:**
- `freight_invoice_payments_kind_chk`: in enum
- `freight_invoice_payments_status_chk`: in enum
- `freight_invoice_payments_wht_cert_required`: `kind='wht_credit' → wht_cert_no is not null AND wht_cert_storage_path is not null`
- `freight_invoice_payments_amount_positive`: `amount_thb > 0`

### Computed view (optional helper)

`v_freight_invoice_balance` — aggregate per invoice:
- `sum(amount_thb) FILTER (status='confirmed')` = `paid_thb`
- `net_expected_thb - paid_thb` = `outstanding_thb`
- derived status update via trigger: when `paid_thb >= net_expected_thb` → invoice status flips to `fully_paid`.

### RLS policies

```sql
alter table freight_invoices enable row level security;
alter table freight_invoice_lines enable row level security;
alter table freight_invoice_payments enable row level security;

-- Customer: read own invoices + lines + payments (when status != cancelled, or always — TBD)
create policy freight_invoices_customer_read on freight_invoices for select
  using (profile_id = auth.uid());
create policy freight_invoice_lines_customer_read on freight_invoice_lines for select
  using (exists (select 1 from freight_invoices i
                 where i.id = freight_invoice_lines.freight_invoice_id
                   and i.profile_id = auth.uid()));
create policy freight_invoice_payments_customer_read on freight_invoice_payments for select
  using (profile_id = auth.uid());

-- Admin: super + accounting write; ops can read but not mutate financials
create policy freight_invoices_admin_all on freight_invoices for all
  using (is_admin(array['super','accounting']))
  with check (is_admin(array['super','accounting']));
create policy freight_invoice_lines_admin_all on freight_invoice_lines for all
  using (is_admin(array['super','accounting']))
  with check (is_admin(array['super','accounting']));
create policy freight_invoice_payments_admin_all on freight_invoice_payments for all
  using (is_admin(array['super','accounting']))
  with check (is_admin(array['super','accounting']));
create policy freight_invoices_admin_ops_read on freight_invoices for select
  using (is_admin(array['ops','sales_admin']));
```

### Storage buckets (new)

- `freight-invoices/` — private, admin-write customer-read for own; mirror `tax-invoices/` policies (migration 0035).
- `freight-payment-slips/` — private, customer can upload (V2 scope; V1 admin-only), admin read all.
- `wht-certs/` — already proposed by ADR-0015 V-A6.

---

## Server actions outline

`actions/admin/freight-invoices.ts` (super + accounting only via `withAdmin`):

```ts
adminCreateFreightInvoice(input): Promise<AdminActionResult<{ id; invoice_no }>>
//   creates pending invoice from a freight_shipment + N lines
//   atomically allocates invoice_no via next_freight_invoice_serial() RPC
//   if wht_applies → reads ADR-0015 rules to validate base + rate; computes net_expected
//   renders PDF + uploads to freight-invoices/{profile_id}/{invoice_no}.pdf
//   audit + notify customer ('freight_invoice.issued')

adminCancelFreightInvoice(id, reason): Promise<AdminActionResult>
//   pending or fully_paid → cancelled (RD Code 86 — cancel + re-issue, no edit)
//   when status=fully_paid: also cancels related payments (audit each)
//   PDF re-renders with CANCELLED watermark on demand (mirror tax_invoices route pattern)

// Payment recording
adminRecordFreightPayment(input): Promise<AdminActionResult<{ id }>>
//   creates a freight_invoice_payments row (default status=pending)
//   for kind='slip_transfer' or 'cash' or 'cheque': customer paid Pacred
//   for kind='wht_credit': customer handed Pacred the 50 ทวิ certificate
//   for kind='wallet_debit': debit customer's wallet (creates linked wallet_transactions row;
//     reference_type='freight_invoice'; reference_id=invoice_no)

adminConfirmFreightPayment(payment_id): Promise<AdminActionResult>
//   pending → confirmed; recompute invoice's paid_thb sum + auto-flip invoice status if fully paid

adminRejectFreightPayment(payment_id, reason): Promise<AdminActionResult>
//   pending → rejected (e.g., slip amount mismatches, fake slip suspected)

// Receipt PDF generation
//   No separate adminIssueReceipt — RD Code 86 combined receipt-and-tax-invoice = the invoice PDF itself,
//   re-rendered with "RECEIVED" stamp + payment date when status=fully_paid.
//   See PDF section below.
```

**Customer-side (`actions/freight-invoices.ts`):**

```ts
listMyFreightInvoices(filters?): Promise<...>
getFreightInvoice(invoice_no): Promise<...>  // RLS-gated to own
// V2 future: customerUploadPaymentSlip(invoice_no, file): submit a slip the admin reviews
```

**Idempotency:**
- `adminCreateFreightInvoice`: serial atomic via SECURITY DEFINER fn (mirror tax_invoices); guards double-issue per shipment by `freight_shipment_id` UNIQUE (or per-shipment count if multi-invoice shipments allowed).
- All status flips: optimistic `eq('status', expected)` race-safe.

**Audit:** every issue/cancel/payment-record/confirm/reject writes `admin_audit_log` per ADR-0014. Action namespace: `freight_invoice.*` + `freight_payment.*`.

---

## UI outline

**Admin:**
- `/admin/freight/invoices` — list with status filter chips, search by invoice_no / buyer / shipment_no, outstanding-balance column, "due-soon" highlight.
- `/admin/freight/invoices/[id]` — detail with:
  - header snapshot
  - line items (read-only post-issuance)
  - payments table (with confirm/reject buttons for pending)
  - WHT block (when applicable; shows base + rate + amount; "ขอ 50 ทวิ" reminder + upload button)
  - PDF download
  - audit timeline
  - cancel button (super/accounting, requires reason)
- `/admin/freight/shipments/[code]` — surfaces linked invoices inline (cross-link).

**Customer (`/(protected)/freight/invoices`):**
- list of own invoices with status pills
- detail at `/freight/invoices/[invoice_no]` — PDF view + payment history + outstanding amount
- (V2.1+) "ส่งสลิป" button — upload customer-side slip for admin review

---

## PDF template

`components/pdf/freight-invoice.tsx` — RD Code 86 compliant. Reuse `components/pdf/tax-invoice.tsx` layout closely:

- Pacred header (CONTACT + TAX_ID from `components/seo/site.ts`)
- "ใบกำกับภาษี / ใบแจ้งหนี้" title + `invoice_no` (when status=pending/partial_paid)
- Switches to "ใบกำกับภาษี / ใบเสร็จรับเงิน" + "ได้รับเงินแล้ว" stamp + payment date when status=`fully_paid`
- Buyer snapshot
- Line items (same V-E1 commercial invoice format, in Thai for receipt purpose)
- Subtotal / VAT 7% / Total — readThaiBaht spell-out
- WHT block (when applies): "หักภาษี ณ ที่จ่าย {wht_rate}% = {wht_amount} บาท / ยอดสุทธิที่รับ = {net_expected} บาท"
- Footer: payment terms + bank account block (from settings) + Pacred signature
- Watermark "CANCELLED" when status=`cancelled`

Route: `app/api/freight-invoice/[id]/route.ts` — auth + RLS-scoped + admin storage download for issued / on-the-fly re-render with stamps/watermarks based on current status (mirror `app/api/tax-invoice/[id]/route.ts`).

---

## Migration note

Three new tables in one migration: `freight_invoices` + `freight_invoice_lines` + `freight_invoice_payments` (+ `next_freight_invoice_serial()` fn). Plus storage bucket creation in a second migration (mirror 0034 + 0035 split).

**Migration numbers:** ภูม assigns; after V-A6 WHT (0044) + V-E6 quotation (0045) → freight invoices likely lands at `0046+`.

Pairs with the WHT migration (V-A6) — needed before V-E7 invoice can write WHT columns. If V-A6 lands first, this spec just references the WHT columns; if V-E7 lands first, ภูม folds the WHT columns in here directly + later V-A6 mirrors them onto `service_orders` / `forwarders`.

---

## Acceptance

- Admin can issue a freight invoice from a shipment + N lines; PDF renders with Pacred legal header + RD Code 86 fields.
- Invoice number is atomic, monotonic, monthly-reset (`INV-YYMM-NNNN`).
- WHT-able invoices compute net_expected correctly; UI surfaces WHT block on the PDF.
- Admin can record payments (slip / cash / cheque / wallet / WHT credit); confirm/reject with audit.
- When sum(confirmed payments) ≥ net_expected → invoice flips to fully_paid; PDF re-renders with "RECEIVED" stamp.
- Cancel writes audit + reason; cancelled invoice PDF shows CANCELLED watermark.
- Customer sees own invoices + payments in portal; can download PDF.
- Receipt-side flow respects [ADR-0006](../decisions/0006-tax-invoice-flow.md) immutability rules.

---

## Cross-references

- Schedule + ranking → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-E7`
- Pairs with WHT design → [ADR-0015](../decisions/0015-withholding-tax-model.md)
- Pairs with downstream tax invoice → [ADR-0006](../decisions/0006-tax-invoice-flow.md) + migration `0034`
- Pairs with freight value model → [ADR-0016](../decisions/0016-freight-value-model.md)
- Pairs with commercial-invoice PDF lines → [`port-specs/freight-document-suite.md`](freight-document-suite.md) V-E1
- Status-transition + audit pattern → [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)
- Tax-invoice precedent (numbering + storage + PDF route) → migrations `0034` + `0035` · `components/pdf/tax-invoice.tsx` · `app/api/tax-invoice/[id]/route.ts`
- Deep-sweep finding → [`docs/audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §5.1 H
- Legacy PHP source → `/Users/dev/Desktop/pcscargo/member/pcs-admin/closingAccReportForwarder.php` + tables `tb_receipt` / `tb_receipt_item`

**End of V-E7 spec.** ภูม: implement AFTER V-A6 (WHT) lands; the WHT columns share their definition. ก๊อต: confirm RLS gate (proposed: super + accounting only for financial mutations; ops read-only).
