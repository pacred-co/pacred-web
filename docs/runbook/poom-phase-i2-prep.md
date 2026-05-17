# 🚀 Phase I2 readiness notes — ภูม post-launch quick-start

> **Purpose:** เมื่อ launch ผ่าน + ภูม pickup Phase I2 (freight stack V-E6..V-E12 + admin polish V-G1..V-G7) — เปิด doc นี้ → เห็น sequence ที่ recommended + dependency map + per-item readiness checklist. ไม่ต้องอ่าน 8 specs จาก scratch.
>
> Last reviewed: 2026-05-16 night-5 (ภูม via Claude) — distilled from 8 port-specs ใน [`docs/port-specs/`](../port-specs/).
> Use with: [`docs/briefs/poom.md`](../briefs/poom.md) "Phase I2" section + each spec for the full design.

---

## 🗺️ Dependency map — ✅ ALL ก๊อต-side blockers cleared 2026-05-17

```
ก๊อต lock ADR-0015 (WHT) ✅ DONE          → V-A6 WHT impl ✅ unblocked → V-E7 receipt + V-E8/H1/H2 commission
ก๊อต lock ADR-0016 (freight value) ✅ DONE → V-E1/V-E2 impl ✅ unblocked → V-E7 receipt billing
ก๊อต RBAC (interpreter role) ✅ ack       → V-H1 interpreter impl ✅ unblocked → V-E8 commission

V-E10 QA/QC (no deps)             → unblocks V-E7 (billing gate: qa_status='pass'|'fail_minor'|'waived')
V-E6 quotation (no deps, super-only V1 approval per RBAC ack 2026-05-17) → opens freight sales funnel (independent of billing)
V-E1 commercial invoice           → V-E7 (receipt joins invoice lines)
V-E1 commercial invoice           → V-E3/E4 Form E + D/O (same freight_shipments spine)
```

**Implication:** ทุก ก๊อต-side blocker ✅ cleared. ภูม Phase I2 ลุยได้เต็มที่ — no external waits left. Internal sequencing only (V-A6 → V-E10 → V-E6 → V-E1/E7 → V-E3/E4 → V-E8/H1/H2 → V-E9 → V-E11/E12).

---

## 📋 Recommended sequence (per brief)

1. **V-A6 WHT** — ~6-8h — ทันที พอ ก๊อต lock ADR-0015 (อนุญาตให้ juristic ลูกค้าจ่ายแบบหัก ณ ที่จ่าย)
2. **V-E10 QA/QC inspection** — ~6-8h — prereq ของ V-E7 (billing gate). ไม่ต้องรอ ก๊อต
3. **V-E6 Quotation workflow** — ~15-20h — เปิด freight sales funnel
4. **V-E1 commercial invoice** + **V-E7 receipt/payment** — ~25-35h combined — full freight billing loop
5. **V-E3 Form E + V-E4 D/O generator** — ~10-15h — เมื่อมี freight customer จริง
6. **V-E8/H1/H2 commission** — ~20-30h — เมื่อ commission accrual สะสมพอ
7. **V-E9 monthly closing** — ~10-15h — เมื่อ accounting ขอ
8. **V-E11 ใบขนสินค้า + V-E12 role dashboards** — polish ทีหลัง
9. **V-G items** à la carte (V-G7 audit verifications safest to ship anytime)

**Total estimate:** ~150-200h freight + ~32-40h admin polish = ~200-240h Phase I2.

---

## ✅ Per-item readiness checklist

### V-A6 — WHT (ภาษีหัก ณ ที่จ่าย) ✅ SHIPPED 2026-05-17 (commit e95c0bc)
**Blocker:** ✅ ALL CLEAR (ADR-0015 locked 2026-05-16 night, 4 Qs resolved)
**Spec:** [`decisions/0015-withholding-tax-model.md`](../decisions/0015-withholding-tax-model.md) — see "Resolved questions" section at the bottom for the locked answers
**Migration:** ✅ `0044_withholding_tax.sql` shipped — needs `supabase db push` on dev/prod
**Code touch (all done):**
- ✅ `actions/admin/tax-invoices.tsx::issueTaxInvoice` — WHT cert gate + tax_invoice_id backfill + pipe wht to PDF
- ✅ `actions/admin/wht.ts` — 5 actions: createWhtEntry / uploadWhtCert / markWhtCertReceived / waiveWhtCert / cancelWhtEntry
- ✅ `lib/validators/withholding-tax.ts` — Zod schemas + WHT_RATES const + computeWhtNumbers helper
- ✅ `app/(admin)/admin/tax-invoices/[id]/wht-panel.tsx` — admin panel (create / pending / received / waived states)
- ✅ `components/pdf/tax-invoice.tsx` — optional `wht` field renders WHT block under totals
- ✅ `app/api/tax-invoice/[id]/route.tsx` — cancelled re-render pulls WHT too
- ✅ `app/(protected)/service-(import|order)/[id]/receipt/page.tsx` — WHT info banner + Net total rows
- ✅ Storage bucket `wht-certs` (DEDICATED) + RLS policies in migration 0044
**Test list:** see `poom-test-playbook-2026-05-16.md` section **BB**
**Follow-ups (deferred to V1.1):** customer self-upload of cert · 50 ทวิ OCR · line-level WHT base · auto-generate Pacred's ภ.ง.ด.53 summary

### V-E10 — QA/QC intake inspection ✅ SHIPPED 2026-05-17 (commit fb99a68)
**Blocker:** none (purely additive)
**Spec:** [`port-specs/freight-qa-qc-inspection.md`](../port-specs/freight-qa-qc-inspection.md)
**Migration:** ✅ `0045_freight_qa_inspections.sql` shipped — needs `supabase db push` on dev/prod
**V1 scope:** cargo_shipments-only (freight_shipment_id reserved nullable; follow-up migration after V-E1 adds FK + relaxes XOR)
**Code touch (all done):**
- ✅ `supabase/migrations/0045_freight_qa_inspections.sql` — table + RLS + bucket `qa-inspection-photos` + next_qa_inspection_no() fn
- ✅ `lib/validators/qa-inspection.ts` — QA_OUTCOMES + QA_DAMAGE + Zod refinements
- ✅ `actions/admin/qa-inspections.ts` — createQaInspection (waived super-only), updateQaInspectionNotes, uploadQaPhoto, isCargoShipmentQaPassed (V-E7 gate consumer)
- ✅ `lib/notifications/templates.ts::qaFailed` — fail_minor/fail_major customer notif
- ✅ `/admin/warehouse/qa-inspections/page.tsx` — pending queue + recent inspections
- ✅ `/admin/warehouse/qa-inspections/new/page.tsx` + form — radio cards + photo multi-upload
- ✅ `/admin/warehouse/qa-inspections/[id]/page.tsx` — detail + photo gallery (signed URLs)
- ✅ `/shipments/[code]/page.tsx` — customer QA status panel
**Test list:** see playbook section **CC**
**V-E7 gate integration:** call `isCargoShipmentQaPassed(cargo_shipment_id)` from V-E7 `adminCreateFreightInvoice` → reject `qa_not_passed` if false

### V-E6 — Freight quotation workflow ✅ V1 SHIPPED 2026-05-17 (commit a0c9c78)
**Blocker:** none
**Spec:** [`port-specs/freight-quotation.md`](../port-specs/freight-quotation.md)
**Migration:** ✅ `0048_freight_quotes.sql` shipped — needs `supabase db push` on dev/prod
**V1 shipped:**
- ✅ `0048_freight_quotes.sql` — freight_quotes + freight_quote_items + freight_quote_seq + next_freight_quote_no() + RLS
- ✅ `lib/validators/freight-quote.ts` — 7-status enum + 4 transport modes + 11 incoterms + 9 units + computeQuoteTotals
- ✅ `actions/admin/freight-quotes.ts` — 11 actions (create/update header + 3 item CRUD + 6 status flips + convert stub)
- ✅ `/admin/freight/quotes` — list + new + detail (inline-edit items + status action buttons + audit timeline)
- ✅ Sidebar group "Freight" with V-E6 link
**V1 deferred (= V-E6.1):**
- Customer portal at /(protected)/freight/quotes
- PDF rendering (components/pdf/freight-quote.tsx + /api/freight-quote/[id]/route.ts)
- LINE notification on send
- Header-edit UI (V1 = delete-and-recreate)
- adminConvertQuoteToShipment body (V-E1 dep — replaces the stub once `0050_freight_shipments` ships)
**Test list:** see playbook section **FF**
**Approval RBAC:** ✅ use existing `super` role for V1 (เดฟ + ลูกพี่ ack 2026-05-17) — no new `manager` role pre-launch.

### V-E1 — Commercial invoice + packing list ✅ V1 SHIPPED 2026-05-17 (commit 6478efe)
**Blocker:** ✅ ALL CLEAR (ADR-0016 locked 2026-05-16 night, 5 Qs resolved)
**Spec:** [`port-specs/freight-document-suite.md`](../port-specs/freight-document-suite.md) + [ADR-0016 §"Field model"](../decisions/0016-freight-value-model.md)
**Migrations:** ✅ `0050_freight_shipments.sql` + ✅ `0051_freight_invoices.sql` — needs `db push` on dev+prod
**V1 shipped:**
- ✅ Migration 0050 — `freight_shipments` + `freight_parties` (per role) + `freight_job_seq` + `next_freight_job_no()` (A{YY}{NNNNN} yearly reset) + RLS + V-E10 FK backfill (freight_qa_inspections.freight_shipment_id)
- ✅ Migration 0051 — `freight_invoices` + `freight_invoice_lines` + `freight_invoice_seq` + `next_freight_invoice_serial()` (FI{YYMMDD}-{NNNN} daily reset) + partial-unique (one issued invoice per shipment) + RLS
- ✅ `lib/validators/freight-shipment.ts` — Zod for shipment + invoice + line + computeValueBlock helper (derives commercial_value_thb / duty_thb / vat_base_thb / vat_thb per ADR-0016)
- ✅ `actions/admin/freight-shipments.ts` — 8 actions (create / update with ADR-0016 Q3 declared_value role-gate / upsert party / 4 status flips / cancel)
- ✅ `actions/admin/freight-invoices.ts` — 6 actions (create draft / line CRUD ×3 / issue with snapshot + serial / cancel)
- ✅ `/admin/freight/shipments` — list (status chips + search) + new (header+logistics) + detail (parties + invoice + line items + status actions + value-block read-only + audit timeline)
- ✅ V-E6 `adminConvertQuoteToShipment` stub → real INSERT (UNIQUE source_quote_id race-safe via 23505 catch)
- ✅ Sidebar Freight group expanded with V-E1 link
**V1 deferred (= V-E1.1):**
- Customer-side portal `/(protected)/freight/shipments`
- PDF generators: components/pdf/freight-commercial-invoice.tsx + freight-packing-list.tsx + freight-form-e.tsx + freight-do-letter.tsx + /api/freight-invoice/[id]/route.ts
- Customer-picker dropdown in new shipment form (V1 = paste profile UUID)
- Inline value-block editor on detail page (V1 = read-only display)
- WHT freight integration (V-A6 was cargo-only; V-A6.1 adds freight_shipment_id support)
- QA gate enforcement on freight invoice issuance (FK now exists; gate logic = V-E7)
**Test list:** see playbook section **HH**
**Next sequence:** V-E7 receipt + payment (~15-20h) — all prereqs (V-A6 ✅ + V-E10 ✅ + V-E1 ✅) cleared.

### V-E7 — Receipt + payment tracking ✅ V1 SHIPPED 2026-05-17 (เดฟ)
**Blocker:** ✅ ALL CLEAR (V-E1 0050/0051 shipped + V-A6 0044 shipped)
**Spec:** [`port-specs/freight-receipt-and-payment.md`](../port-specs/freight-receipt-and-payment.md)
**Migration:** ✅ `0052_freight_invoice_payments.sql` shipped — needs `db push` on dev+prod
**V1 shipped:**
- ✅ Migration 0052 — `freight_invoice_payments` (partial-pay ledger) + `freight_invoices.payment_status` + `fully_paid_at` columns + RLS + storage bucket `freight-payment-slips`
- ✅ `lib/validators/freight-payment.ts` — Zod schemas + 3 enums + `computeInvoicePaymentStatus` + `freightInvoiceTotalThb` + `roundThb`
- ✅ `actions/admin/freight-invoice-payments.ts` — 5 actions (recordFreightPayment / uploadFreightPaymentSlip / voidFreightPayment / listFreightPayments / getFreightReceiptGate)
- ✅ `components/pdf/freight-receipt.tsx` — RD Code 86 receipt (invoice ↔ receipt title switch, RECEIVED stamp, CANCELLED watermark)
- ✅ `app/api/freight-receipt/[id]/route.tsx` — RLS-scoped on-the-fly PDF render
- ✅ Payment panel on `/admin/freight/shipments/[id]` (ledger + record-payment form + void + receipt download)
- ✅ `freightReceipt` i18n namespace (TH+EN parity) + `lib/validators/freight-payment.test.ts`
**V1 design decisions (beyond pre-locked):**
- **payment_status vs status split** — 0051's `freight_invoices.status` is the DOCUMENT lifecycle (draft/issued/cancelled); V-E7 added a SEPARATE `payment_status` column (unpaid/partial/paid/overpaid) recomputed from the ledger. The two axes are independent.
- **Receipt total = landed cost** — `freight_invoices` has no single total column; the payable THB total is computed as `commercial_value_thb + duty_thb + vat_thb` (ADR-0016 landed-cost block). `freightInvoiceTotalThb` helper.
- **WHT gate = defensive no-op** — `withholding_tax_entries` (0044) has no freight FK, so `getFreightReceiptGate` always allows; it's the single choke-point V-A6.1 will wire.
- **Recompute in the action** — payment_status + fully_paid_at recomputed in the server action after every insert/void (F-11 pattern, no trigger).
**V1 deferred (= V-E7.1):**
- Customer-side freight receipt portal (`/(protected)/freight/invoices`)
- `wallet` method auto-debit (needs `wallet_transactions.reference_type` enum extension)
- V-A6.1 — add `freight_invoice_id` to `withholding_tax_entries` + wire the WHT cert gate
**Follow-up:** V-A6.1 (freight↔WHT linkage) — see WHT gate note above.

### V-E8 + V-H1 + V-H2 — Commission withdrawal (one combined batch)
**Blocker:** ✅ ALL CLEAR (ADR-0015 WHT locked + E-5 interpreter role ack-approved 2026-05-17)
**Spec:** [`port-specs/commission-withdrawal.md`](../port-specs/commission-withdrawal.md)
**Migration:** `0053_commissions.sql` — **ภูม owns** — 4 tables + `admins.role` enum extension (interpreter role per E-5 ack):
- `commission_tiers` (per-role/per-service rate lookup)
- `commission_accruals` (earned-but-unpaid)
- `commission_withdrawals` (request → admin approve → paid)
- `commission_withdrawal_items` (link withdrawal ← accruals)
- + `alter table admins drop constraint + add constraint admins_role_check check (role in (...,'interpreter'))` — bundle inline per [E-5 resolution](../runbook/poom-handoff-2026-05-16.md)
**Code touch:**
- `actions/admin/commissions.ts` (new) — bulk-accrue (cron) · request-payout · approve+slip-upload · mark-paid
- `lib/auth/require-admin.ts:20` — extend `AdminRole` union with `"interpreter"` (single line)
- `/admin/commissions/*` pages (request form · admin approval queue · history)
- `/commissions/me/*` (interpreter/sales-rep self-serve request flow)
- Background cron `/api/cron/commission-accrue` (daily — scans closed orders → writes accruals)
**Effort:** ~20-30h
**Pre-implementation check:**
- [x] ADR-0015 locked (WHT 15% rate applied here — locked 2026-05-16 night)
- [x] `interpreter` role ack-approved (E-5 resolved 2026-05-17 — bundle inline in `0053_commissions.sql`)
- [ ] Existing `team_leaders` table mapped → new `commission_tiers` (per-existing-row migration) — ภูม design call per spec

### V-E9 — Monthly closing ritual
**Blocker:** none (additive)
**Spec:** [`port-specs/freight-monthly-closing.md`](../port-specs/freight-monthly-closing.md)
**Migration:** ~`0054_accounting_periods.sql` + read-only trigger
**Effort:** ~10-15h
**Pre-implementation check:**
- [ ] At least 1 closed accounting month of freight data (otherwise feature has nothing to freeze)

### V-E11 — Customs declaration UI (ใบขนสินค้า)
**Blocker:** none (internal-only V2 — no Thai Customs API integration yet)
**Spec:** [`port-specs/freight-customs-declaration.md`](../port-specs/freight-customs-declaration.md)
**Effort:** ~10-12h

### V-E12 — Role dashboards (7 per-role)
**Blocker:** ก๊อต RBAC review (some new roles)
**Spec:** [`port-specs/cargo-and-freight-dashboards.md`](../port-specs/cargo-and-freight-dashboards.md)
**Effort:** ~20-25h

---

## 🛠 V-G admin polish bundle — pick à la carte

| Item | LOC | Time | Independent? | Risk |
|---|---|---|---|---|
| V-G1 Bulk forwarder actions | ~250 | 3-4h | yes | touches hot revenue path; ship after launch stable |
| V-G2 Bulk transfer customers | ~150 | 2-3h | yes | mild (touches profile.adminID_sale) |
| V-G3 Admin broadcast popup | ~300 | 4h | LINE Messaging API live needed | depends LINE prod live |
| V-G4 Cargo TOS version mgmt | ~200 | 3h | yes — `actions/tos.ts` already exists | low (extends existing) |
| V-G5 Org 5 contact CRUDs | ~250 | 4-6h | yes | additive — very low |
| V-G6 New admin reports (4) | ~400 | 6-8h | yes | additive — safe |
| V-G7 Audit feature-parity (6 verifications) | ~50 each | 1h each = 6h | yes — pure docs | zero — just verification |

**Safest first picks post-launch:** V-G7 audit (zero risk) · V-G5 contact CRUDs · V-G6 new reports.
**Wait-and-see:** V-G1 + V-G2 (touch hot paths) · V-G3 (LINE dep).

---

## 🧱 Migration numbering map — ✅ reconciled 2026-05-17 (post ภูม V-E6 merge)

> **Actual on-disk state.** ภูม owns the fast-moving Phase-I2 block `0044`-`005x`
> (freight/commission stack). เดฟ's member_code + security-keystone migrations
> are numbered **clear of ภูม's block** (`0060`-`0064`) so the two devs never
> collide. Migrations apply in **sorted version order**, so the `0054`-`0059`
> gap is harmless — `0060`+ simply runs last. ภูม's next free = **`0054`**.

| Number | Item | Owner | Status |
|---|---|---|---|
| `0041` | bill_to_name_override | ภูม | ✅ shipped + run on dev + prod |
| `0042` | cargo_containers.close_at | ภูม | ✅ shipped + run on dev + prod |
| `0043` | slip_transferred_at | ภูม | ✅ shipped + run on dev + prod |
| `0044` | **withholding_tax** (V-A6) | ภูม | ✅ **SHIPPED 2026-05-17** — needs `db push` on dev+prod |
| `0045` | **freight_qa_inspections** (V-E10) | ภูม | ✅ **SHIPPED 2026-05-17** — needs `db push` |
| `0046` | **org_contacts** (V-G5) | ภูม | ✅ **SHIPPED 2026-05-17** — needs `db push` |
| `0047` | **tos_versions** (V-G4) | ภูม | ✅ **SHIPPED 2026-05-17** — needs `db push` |
| `0048` | **freight_quotes + items** (V-E6) | ภูม | ✅ **SHIPPED 2026-05-17** — needs `db push` |
| `0049` | **wallet_order_payment_unique** (G9 / F-11 fix) | ภูม | ✅ **SHIPPED 2026-05-17** (commit 53c11f8) — needs `db push` before public launch 2pm |
| `0050` | **freight_shipments + freight_parties** (V-E1 part 1) | ภูม | ✅ **SHIPPED 2026-05-17** (commit 6478efe) — needs `db push` |
| `0051` | **freight_invoices + freight_invoice_lines** (V-E1 part 2) | ภูม | ✅ **SHIPPED 2026-05-17** (commit 6478efe) — needs `db push` |
| `0052` | **freight_invoice_payments** (V-E7) | เดฟ | ✅ **SHIPPED 2026-05-17** — needs `db push` |
| `0053` | **freight_invoice_wht** (U2-3 — WHT gate for freight invoices) | ภูม | ✅ **SHIPPED 2026-05-18** (commit 98a4c85) — needs `db push` |
| `0054` | **commissions** (4 tables + interpreter role) (V-E8/H1/H2) | ภูม | ✅ **SHIPPED 2026-05-18** (commit 998a94f) — needs `db push` |
| `0055` | **broadcasts** (V-G3 admin push popup) | ภูม | ✅ **SHIPPED 2026-05-18** (commit 0fe8ec7) — needs `db push` |
| `0056` | **accounting_periods + period_close_event + freeze trigger** (V-E9) | ภูม | ✅ **SHIPPED 2026-05-18** (commit 0a1b584) — needs `db push` |
| `0057` | **customs_declarations + lines + serial** (V-E11) | ภูม | ✅ **SHIPPED 2026-05-18** (commit eb74715) — needs `db push` |
| `0058`-`0059` | *(reserved headroom for ภูม's block — fill sequentially)* | ภูม | — |
| `0060` | **member_code_3digit** (PR00001→PR001) | เดฟ | ✅ **SHIPPED 2026-05-17** — needs `db push` |
| `0061` | **money_idempotency_guards** (cost_adj kind + 3 partial-unique) | เดฟ | ✅ **SHIPPED 2026-05-17** — needs `db push` |
| `0062` | **rls_role_pin_money_pii** (W-1 security keystone) | เดฟ | ✅ **SHIPPED 2026-05-17** — needs `db push` before `dave→main` deploy |
| `0063` | **wallet_freight_invoice_reference** (W-3 freight wallet-pay) | เดฟ | ✅ **SHIPPED 2026-05-17** — needs `db push` |
| `0064` | **wallet_overdraw_guard** (H-1/S-5 BEFORE-trigger) | เดฟ | ✅ **SHIPPED 2026-05-17** — needs `db push` |

> ⚠️ **19 migrations (`0044`-`0057` + `0060`-`0064`) shipped to git but NOT yet
> applied to Supabase.** ภูม applies them on dev + prod — `supabase db push`
> (or paste each into the SQL Editor in ascending number order). Dependency
> chains: `0050`/`0051` reference `0045`/`0048`; `0052` references `0051`;
> `0053` references `0051`; `0054` extends `admins.role` enum (independent);
> `0055` adds FK on `notifications` (independent); `0056` adds DB-level
> BEFORE-trigger on tax_invoices/freight_invoices/freight_invoice_payments/
> wallet_transactions; `0057` references `0050` (freight_shipments FK) +
> `hs_codes`; `0063` references `0051` and `0052`. Number order satisfies
> every dependency.

**Next free number for ภูม = `0058`.**

**Phase I2 sequence: 8/8 ✅ COMPLETE** (V-A6 + V-E10 + V-E6 + V-E1 + V-E7 +
V-E8 + V-E9 + V-E11). Phase I2 backlog now fully shipped — next phase per
UPGRADE_PLAN §1 = U1 wire-the-flow bridges (after §0 gate: ภูม apply all 19
migrations + live functional verification).

**Note:** `0044`-`0059` block = ภูม (freight/commission stack). `0060`
(member_code) = เดฟ — deliberately numbered clear of ภูม's block so the two devs
never collide on a migration number again. Single-owner per migration — ภูม
spec'd the freight/commission schemas in the ADRs, so no "เดฟ structural lane"
handoff needed.

---

## 🎯 Day-1 post-launch action

Open this doc → confirm:
1. ก๊อต lock status of ADR-0015 + ADR-0016 + interpreter RBAC
2. เดฟ structural lane status (V-A6 WHT migration? V-E1 freight_shipments?)
3. Pick highest unblocked item from sequence (V-E10 likely)

ลุยตามได้เลย — spec อ่านแล้ว pattern เข้าใจ.
