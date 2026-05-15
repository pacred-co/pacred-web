# ADR-0015 — Withholding-tax (ภาษีหัก ณ ที่จ่าย) model

**Status:** 🟡 **DRAFT** — เดฟ scaffold 2026-05-16. ก๊อต to review + lock. ภูม implements as **V-A6** after lock.
**Date:** 2026-05-16
**Phase:** Part V — Legacy Cargo Forensics backlog (task `V-A6`)
**Owner:** เดฟ (scaffold author) · ก๊อต (review + lock) · ภูม (implementation)

> **ADR-number note:** 0011-0013 are reserved for ก๊อต Sprint 7+ Track D (per [ADR-0014](0014-customer-self-service-state-transitions.md) reservation note). 0014 = state transitions. This ADR slots in at **0015**.

---

## Context

[`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §4 **A6** identified withholding tax as the **single most-repeated complaint** across 8 months of the legacy-system chat. The legacy PHP system has **no model for it at all**.

**The Thai tax reality.** When a **juristic** customer (company) pays a service provider, Thai law requires the *payer* to withhold a percentage of the fee and remit it to the Revenue Department on the provider's behalf:

- Pacred services attract **1%** (ค่าขนส่ง / freight & transport) or **3%** (ค่าบริการ / general service) withholding. (5% = rent, not typical here.)
- The customer withholds `W`, transfers `Net = Gross − W`, and must issue Pacred a **หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ)** for `W`. Pacred uses that certificate as a **tax prepayment credit** when filing — so the certificate is *money*; losing it = losing the credit.

**What breaks today (from the chat):**
1. The customer transfers `Net`, but the system expects `Gross` → **the slip cannot be attached / the payment cannot be approved** ("ยอดไม่ตรง... แนบสลิปไม่ได้").
2. The receipt total (`Gross`) ≠ the amount actually received (`Net`) → "Diff" — accounting cannot reconcile.
3. Staff **cannot collect the 50 ทวิ certificate** from customers — "ตามแทบไม่ได้เลย" — so Pacred silently loses tax credits. They explicitly asked for a **gate: do not release the receipt until the certificate is uploaded.**
4. It compounds the ภพ.30 reconciliation gap (forensics A8 — Oct/68 off by ฿15,192).

**Hard requirement** (verbatim staff ask, chat 11/12/2025 + 30/3/2026): *"ถ้าไม่แนบใบหัก ยังไม่ได้รับใบเสร็จ"* — receipt issuance must be gated on the WHT certificate.

This ADR pairs tightly with [ADR-0006 — tax-invoice flow](0006-tax-invoice-flow.md) and migration `0034_tax_invoices.sql` (the tax-invoice header already holds a financial snapshot).

---

## Decision points

1. **Where does WHT live** — on the payment record, on the invoice, or in its own table?
2. **What is WHT computed on** — the full invoice, or only the WHT-able service portion?
3. **How is the rate chosen** — fixed, or staff-entered with validation?
4. **How does the receipt/tax-invoice gate work** — hard block, or overridable?
5. **How does reconciliation (V-A3) treat a WHT order** — `Net` received must count as "fully settled".

---

## Options considered

### Option A — WHT as columns on the payment/settlement record
Add `wht_*` columns wherever an order is settled.
- ➕ Minimal migration.
- ➖ The settlement record differs per flow (`wallet_transactions` of kind `order_payment` vs `import_payment`, `yuan_payments`, future direct-pay) → the columns get **duplicated in 3+ tables**; the receipt gate needs a 3-way query; the accounting export (V-A8/PEAK) has no single source.

### Option B — dedicated `withholding_tax_entries` table ✅ recommended
One row per WHT event, FK to the parent order (`order_h_no` *or* `forwarder_f_no`) and, once issued, the `tax_invoice_id`.
- ➕ One canonical place → one gate query, one export query (feeds V-A8 + the PEAK API V-F2).
- ➕ Works identically for shop-order and forwarder flows.
- ➕ Clean audit + soft state (`pending` → `received`).
- ➖ Slightly more build than A — but A's "3 copies" cost more overall.

### Option C — WHT as a negative line on the invoice
- ❌ **Rejected.** WHT is *not* a discount. Modelling it as a negative line distorts revenue recognition and the VAT base. The service was `Gross`; the receipt must say `Gross`.

---

## Decision

**Adopt Option B — a dedicated `withholding_tax_entries` table.** WHT is a *payment-settlement* concept layered onto an order; the invoice/order gross and its VAT are **unchanged** (the receipt always shows `Gross`).

### Schema sketch — migration `0039_withholding_tax.sql`

```sql
create table public.withholding_tax_entries (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete restrict,
  -- exactly one parent order (mirror tax_invoices_one_parent_order, migration 0034)
  order_h_no          text references public.service_orders(h_no),
  forwarder_f_no      text references public.forwarders(f_no),
  tax_invoice_id      uuid references public.tax_invoices(id),      -- linked once issued

  gross_invoice_thb   numeric(12,2) not null,   -- full invoice total (receipt shows this)
  wht_base_thb        numeric(12,2) not null,   -- the WHT-able service portion (staff-confirmed)
  wht_rate_pct        numeric(4,2)  not null check (wht_rate_pct in (1,1.5,2,3,5)),
  wht_amount_thb      numeric(12,2) not null,   -- = round(wht_base_thb * wht_rate_pct/100, 2)
  net_expected_thb    numeric(12,2) not null,   -- = gross_invoice_thb - wht_amount_thb

  cert_status         text not null default 'pending'
                        check (cert_status in ('pending','received','waived')),
  cert_number         text,                     -- the customer's 50 ทวิ running no.
  cert_storage_path   text,                     -- uploaded certificate (bucket 'wht-certs')
  cert_received_at    timestamptz,
  waived_reason       text,                     -- required when cert_status='waived'

  recorded_by_admin   uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint wht_one_parent_order check (
    (order_h_no is not null) <> (forwarder_f_no is not null)
  ),
  constraint wht_waived_has_reason check (
    cert_status <> 'waived' or waived_reason is not null
  )
);
```

- **No row = WHT not applicable** (personal customers, or juristic customers who do not withhold). A row's existence *is* the "WHT applies" flag.
- RLS: customer reads own (`profile_id = auth.uid()`); super/accounting full access (mirror `tax_invoices` policies, migration 0034).
- Storage: new private bucket `wht-certs`, path `{profile_id}/{order}/...` (mirror the `slips` / `tax-invoices` pattern).

### Rules (load-bearing)

1. **The invoice/order gross and VAT never change.** WHT lives only in this table. The receipt/tax-invoice always shows `gross_invoice_thb`.
2. **WHT base = the service-fee portion, staff-confirmed.** Do not auto-apply the rate to the whole invoice — reimbursed pass-through costs (ค่าสินค้า / ค่าออกแทน) are typically not WHT-able. V1 keeps this as one staff-entered `wht_base_thb` field (no line-level WHT yet).
3. **Rate is staff-entered, validated** to `{1, 1.5, 2, 3, 5}`. Default suggestion by service: cargo/forwarder → `1`, pure service → `3`. Staff can override within the allowed set.
4. **Receipt / tax-invoice issuance gate:** if a `withholding_tax_entries` row exists for the order and `cert_status = 'pending'`, **block issuance**. Allow when `cert_status` is `received`, or `waived` (super/accounting only, `waived_reason` required, logged per [ADR-0014](0014-customer-self-service-state-transitions.md) audit pattern).
5. **Reconciliation (V-A3):** a WHT order counts as **fully settled** when payments received total `net_expected_thb` — *not* `gross_invoice_thb`. The `wht_amount_thb` is "received" in the form of the tax credit, not cash. V-A3 must read this table.
6. **`cert_status` transitions are audited** — `pending → received` (cert uploaded) and `pending → waived` both write an `admin_audit_log` row.

---

## Consequences

**Positive**
- Juristic customers can pay correctly — the slip matches `net_expected_thb`, the payment approves, the receipt reconciles.
- Staff get the certificate-collection **gate they explicitly asked for** — Pacred stops silently losing tax credits.
- One canonical table → the V-A8 accounting export and the V-F2 PEAK API have a single, clean source for WHT.
- Reconciliation (V-A3) becomes correct for juristic orders.

**Negative**
- ภูม must thread WHT into the pay-from-wallet / admin-mark-paid actions and the receipt + tax-invoice issuance actions (the gate).
- One more migration + bucket + admin sub-UI.

**Neutral**
- Personal customers are unaffected (no row, no gate).
- Line-level WHT (different WHT-ability per invoice line) is **deferred** — V1 uses a single staff-confirmed `wht_base_thb`.

---

## V1 scope (what ภูม builds for V-A6, after ก๊อต locks)

In: migration `0039` · `wht-certs` bucket · Zod validator `lib/validators/withholding-tax.ts` · admin UI to record an entry + mark cert received/waived · the receipt + tax-invoice **issuance gate** · the V-A3 reconciliation read.
Deferred: customer self-upload of the certificate (V1.1) · 50 ทวิ OCR · line-level WHT base · auto-generating Pacred's own ภ.ง.ด.53 summary.

## Open questions for ก๊อต (lock these)

1. Confirm the allowed rate set — is `1.5` / `2` ever used for Pacred services, or just `{1, 3}`?
2. Should the customer be able to self-upload the 50 ทวิ certificate in V1, or admin-only first?
3. Does `waived` need a second-approver, or is a single super/accounting + logged reason enough?
4. Bucket: dedicated `wht-certs`, or reuse `slips`?

## Cross-references

- Problem source → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §4 A6 + §5
- Task / schedule → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V `V-A6`
- Pairs with → [ADR-0006 — tax-invoice flow](0006-tax-invoice-flow.md) + migration `0034_tax_invoices.sql`
- Audit pattern for the `waived` override → [ADR-0014](0014-customer-self-service-state-transitions.md)
- Reconciliation consumer → PORT_PLAN `V-A3` (payment↔order reconciliation)

---

**End of ADR-0015 (DRAFT).** ก๊อต: review, answer the open questions, flip Status to Accepted. ภูม: do not implement V-A6 until Status = Accepted.
