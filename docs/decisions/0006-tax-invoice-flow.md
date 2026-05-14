# ADR-0006 — Tax invoice flow + storage contract

**Status:** Accepted (design contract; implementation deferred to Phase G)
**Date:** 2026-05-16
**Phase:** Pre-Phase G (admin back-office implementation prep)
**Owner:** เดฟ + ก๊อต (per `docs/team.md` §6); ภูม owns implementation when scheduled

---

## Context

Pacred customers (especially juristic / corporate) need to issue tax
invoices for orders placed. Thai Revenue Department (RD) compliance
requires specific fields, monthly serial numbering, and immutable
records once issued.

The numbering format was locked in [ADR-0005 K-6](0005-launch-operational-decisions.md):
**`INV-YYYYMM-NNNN`** with monthly counter reset.

This ADR locks **the rest of the contract** so ภูม can implement against a
stable spec when Phase G admin operations enter the sprint.

## Design contract

### 1. Issue trigger

A tax invoice is issued **on customer request** (not auto-issued). Default
path:

1. Customer's `service-order` / `forwarder` reaches `status='completed'`
   AND `payment.status='paid'`.
2. Customer goes to `/(protected)/service-order/[hNo]/receipt` or
   `/(protected)/service-import/[fNo]/receipt` and clicks "ขอใบกำกับภาษี"
   (Request Tax Invoice). Only renders if `profiles.account_type='juristic'`
   AND tax invoice not yet issued for this document.
3. Server action `requestTaxInvoice({ order_type, order_id })` validates the
   above + reads `profiles.tax_id` + `profiles.company_name` (required for
   issuance — surface a form to fill if missing) + creates a `tax_invoices`
   row in `status='pending'`.
4. Admin (role `super` or `accounting`) reviews + clicks "ออกใบกำกับภาษี"
   in `/admin/tax-invoices/[id]`. Server action `issueTaxInvoice(id)`:
   - Validates required fields per §3 below.
   - Reserves the next serial via the `tax_invoice_seq` lock (§4).
   - Generates PDF via `@react-pdf/renderer` template (§5).
   - Uploads PDF to `tax-invoices/` Storage bucket.
   - Updates row to `status='issued'`, stamps `serial_no` + `issued_at`.
   - Audit log entry via `logAdminAction()`.
5. Customer can download from the same receipt page once `status='issued'`.

### 2. Required Thai RD fields

Every tax invoice MUST include (per RD Code 86):

| Field | Source | Notes |
|---|---|---|
| ใบกำกับภาษี (Tax Invoice header) | Template | Fixed text |
| Serial number | `tax_invoices.serial_no` | `INV-YYYYMM-NNNN` |
| Issue date | `tax_invoices.issued_at` | Thai Buddhist year format (พ.ศ.) in display, ISO in DB |
| Seller info (Pacred): name, address, tax ID, branch | `pacred-info.md` constants | Branch defaults to "สำนักงานใหญ่" |
| Buyer info: name, address, tax ID, branch | `tax_invoices.buyer_*` columns (snapshot at issuance — does NOT track customer profile changes later) | Buyer can be juristic OR personal-with-tax-ID |
| Line items: description, qty, unit price, amount, VAT amount | From source order; snapshot in `tax_invoice_lines` | VAT inclusive vs exclusive: see §6 |
| VAT 7% | Computed | Pacred is VAT-registered |
| Total | Computed | THB; show ทั้ง numeric + readThaiBaht spell-out |
| Payment method | `tax_invoices.payment_method` | "PromptPay", "Bank Transfer", "Wallet", etc. |
| Authorised signature | Template footer | "ผู้รับเงิน" stamp + เดฟ digital signature (image asset) |

### 3. Schema

```sql
-- Numbering generator — one row per month
create table public.tax_invoice_seq (
  period_yyyymm text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- Tax invoice header
create table public.tax_invoices (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete restrict,
  -- Source order pointer (one of order_h_no or forwarder_f_no must be set; CHECK constraint)
  order_h_no      text references service_orders(h_no),
  forwarder_f_no  text references forwarders(f_no),
  -- Buyer snapshot at issuance (NOT joined to profiles — RD requires immutable record)
  buyer_name      text not null,
  buyer_address   text not null,
  buyer_tax_id    text not null,
  buyer_branch    text default 'สำนักงานใหญ่',
  -- Issuance state
  status          text not null check (status in ('pending','issued','cancelled')) default 'pending',
  serial_no       text unique,           -- INV-YYYYMM-NNNN — null while pending
  issued_at       timestamptz,
  issued_by_admin uuid references admins(profile_id),
  -- Financial snapshot
  subtotal_thb    numeric(12,2) not null,
  vat_thb         numeric(12,2) not null,  -- 7% of subtotal (or computed per line in vat-exclusive mode)
  total_thb       numeric(12,2) not null,
  vat_mode        text not null check (vat_mode in ('inclusive','exclusive')) default 'inclusive',
  payment_method  text not null,
  -- Storage
  pdf_storage_path text,                  -- e.g., "{user_id}/{INV-...}.pdf" — null until issued
  -- Cancellation
  cancelled_at    timestamptz,
  cancelled_by_admin uuid references admins(profile_id),
  cancellation_reason text,
  credit_note_id  uuid references tax_invoices(id),  -- self-ref when this row is a credit note
  -- Meta
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.tax_invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  tax_invoice_id  uuid not null references tax_invoices(id) on delete cascade,
  position        int not null,
  description     text not null,
  qty             numeric(12,2) not null,
  unit_price_thb  numeric(12,2) not null,
  amount_thb      numeric(12,2) not null,
  vat_thb         numeric(12,2) not null
);

-- RLS: customer can read own; admin can read+write all
alter table tax_invoices enable row level security;
create policy tax_invoices_self_read on tax_invoices for select
  using (profile_id = auth.uid());
create policy tax_invoices_admin_all on tax_invoices for all
  using (is_admin(array['super','accounting']))
  with check (is_admin(array['super','accounting']));

alter table tax_invoice_lines enable row level security;
create policy tax_invoice_lines_via_parent on tax_invoice_lines for select
  using (
    exists(
      select 1 from tax_invoices ti
      where ti.id = tax_invoice_lines.tax_invoice_id
        and (ti.profile_id = auth.uid() or is_admin(array['super','accounting']))
    )
  );
create policy tax_invoice_lines_admin_write on tax_invoice_lines for all
  using (is_admin(array['super','accounting']))
  with check (is_admin(array['super','accounting']));

-- Updated-at trigger (reuse existing set_updated_at function)
create trigger tax_invoices_updated_at before update on tax_invoices
  for each row execute function set_updated_at();
```

### 4. Numbering generator

Atomic via Postgres function:

```sql
create or replace function next_tax_invoice_serial()
returns text language plpgsql security definer as $$
declare
  yyyymm text := to_char(now() at time zone 'Asia/Bangkok', 'YYYYMM');
  seq int;
begin
  -- Lock-free upsert + increment (Postgres SERIALIZABLE handles concurrent calls)
  insert into tax_invoice_seq (period_yyyymm, next_seq)
    values (yyyymm, 2)
    on conflict (period_yyyymm) do update
      set next_seq = tax_invoice_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'INV-' || yyyymm || '-' || lpad(seq::text, 4, '0');
end;
$$;
```

`security definer` lets even non-admin contexts call it (server action
already has admin-checked at app layer; this just keeps the function
callable). Concurrent issuance serialises on the upsert lock.

### 5. PDF generation

Reuses the existing `@react-pdf/renderer` infrastructure (registered Sarabun
font, `components/pdf/styles.ts`, `lib/pdf/register-fonts.ts`).

New file: `components/pdf/tax-invoice.tsx` — separate template from
`forwarder-receipt.tsx` / `shop-order-receipt.tsx`. Pacred branding comes
from `CONTACT` + `ADDRESSES` constants (per the PCS scrub runbook
discipline).

Server route: `GET /api/tax-invoice/[id].pdf` — `requireAuth()` +
`select ... from tax_invoices where id=:id and profile_id=auth.uid()` —
streams PDF for the customer. Admin equivalent at `/api/admin/tax-invoice/[id].pdf`
with `requireAdmin(["super","accounting"])`.

### 6. VAT mode (inclusive vs exclusive)

- **Inclusive (default)** — `total = subtotal_inclusive_of_vat`, so
  `vat = total * 7 / 107`. This is how Pacred presents prices to retail
  customers — the displayed "ราคา" includes VAT.
- **Exclusive** — `total = subtotal + vat`, `vat = subtotal * 0.07`. Used
  when an enterprise customer explicitly requests VAT-exclusive pricing.

The customer's choice surfaces as a radio button in the `requestTaxInvoice`
form. Default = `inclusive`.

### 7. Cancellation / credit note

A tax invoice cannot be edited once `status='issued'` (RD compliance).
To correct an error:

1. Admin cancels: `cancelTaxInvoice(id, reason)` — sets `status='cancelled'`,
   stamps `cancelled_at` + `cancelled_by_admin` + `cancellation_reason`.
   The PDF in Storage stays — append "CANCELLED" watermark at re-render.
2. Admin issues a **credit note** (ใบลดหนี้) — a NEW `tax_invoices` row
   with a fresh serial (different month possibly), negative amounts, and
   `credit_note_id` pointing to the original. PDF template renders title
   "ใบลดหนี้" instead of "ใบกำกับภาษี".
3. (Optional) Issue a corrected tax invoice as a fresh row — also a new
   serial.

The chain (original → cancellation → credit note → corrected) is
auditable via DB rows + audit log entries.

### 8. WHT (withholding tax) handling

Out of scope for this ADR. Defer to a follow-up when first B2B juristic
customer needs WHT issuance. Brief sketch for future implementer:

- B2B service buyers (juristic-to-juristic) often withhold 1% / 3% / 5%
  per Section 50 of RD Code.
- Required: `ภ.ง.ด.53` form (monthly aggregate) + `หนังสือรับรองการหักภาษี` per transaction.
- Storage: similar `wht_certificates` table + PDF template.
- Numbering: separate `WHT-YYYYMM-NNNN` (similar pattern).

### 9. RLS + admin gate consistency

Per [ADR-0005 K-7](0005-launch-operational-decisions.md), wallet deposit
approver = `super` OR `accounting`. Tax invoice issuance + cancellation
inherit the same role gate. Audit-log every state transition via
`logAdminAction()`.

## Implementation phases

Phase G2 admin back-office sprint:

1. **G2a — Schema** (~1h): the migration above + tax_invoice_seq + RLS.
2. **G2b — Customer request flow** (~3-4h): `requestTaxInvoice` server action + form on receipt pages + `tax_invoices` row creation.
3. **G2c — Admin issuance flow** (~4-6h): `/admin/tax-invoices` list + detail + `issueTaxInvoice` server action + PDF template + Storage upload.
4. **G2d — Customer download** (~1h): `/api/tax-invoice/[id].pdf` route.
5. **G2e — Cancellation + credit note** (~3-4h): admin actions + credit-note PDF variant.
6. **G2f — Audit + tests** (~2-3h): integration test for the full issue → download → cancel → credit-note chain.

Total estimate: **~14-19h** as a sprint slice. Block on K-6 (numbering)
locked already; block on K-7 (approver) locked already; no other
external blockers.

## Pacred-side checklist for first issuance

Before the first real tax invoice goes out:

- [ ] `profiles` columns `tax_id`, `company_name`, `address` populated for
      juristic customers (already supported by register flow)
- [ ] Pacred's own tax ID + branch + address confirmed in `pacred-info.md`
      Pending list (Pacred owner provides — Part Q Bundle 1)
- [ ] เดฟ digital-signature image asset uploaded to `public/images/signatures/`
- [ ] Accounting role granted to whoever issues invoices day-to-day
- [ ] Test issuance on a staging Supabase project before flipping in prod

## References

- ADR-0005 K-6 — numbering format (`INV-YYYYMM-NNNN`)
- ADR-0005 K-7 — admin approver role (super + accounting)
- `docs/pacred-info.md` — pending Pacred tax ID + legal name
- Thai Revenue Department Code 86 — tax invoice required fields
- Thai Revenue Department Section 50 — WHT context (future scope)
- `components/pdf/forwarder-receipt.tsx` + `shop-order-receipt.tsx` —
  existing PDF templates to fork pattern from
- `lib/utils/thai-number.ts` `readThaiBaht` — spell-out helper for total
- Part S2 K-8 — sprint-slice unblocker
