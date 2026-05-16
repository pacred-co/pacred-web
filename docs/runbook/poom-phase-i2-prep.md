# 🚀 Phase I2 readiness notes — ภูม post-launch quick-start

> **Purpose:** เมื่อ launch ผ่าน + ภูม pickup Phase I2 (freight stack V-E6..V-E12 + admin polish V-G1..V-G7) — เปิด doc นี้ → เห็น sequence ที่ recommended + dependency map + per-item readiness checklist. ไม่ต้องอ่าน 8 specs จาก scratch.
>
> Last reviewed: 2026-05-16 night-5 (ภูม via Claude) — distilled from 8 port-specs ใน [`docs/port-specs/`](../port-specs/).
> Use with: [`docs/briefs/poom.md`](../briefs/poom.md) "Phase I2" section + each spec for the full design.

---

## 🗺️ Dependency map — who blocks whom

```
ก๊อต lock ADR-0015 (WHT)          → V-A6 WHT impl ✅ unblocks → V-E7 receipt + V-E8/H1/H2 commission
ก๊อต lock ADR-0016 (freight value) → V-E1/V-E2 impl ✅ unblocks → V-E7 receipt billing
ก๊อต confirm RBAC (interpreter role) → V-H1 interpreter impl ✅ unblocks → V-E8 commission

V-E10 QA/QC (no deps)             → unblocks V-E7 (billing gate: qa_status='pass'|'fail_minor'|'waived')
V-E6 quotation (no deps)          → opens freight sales funnel (independent of billing)
V-E1 commercial invoice           → V-E7 (receipt joins invoice lines)
V-E1 commercial invoice           → V-E3/E4 Form E + D/O (same freight_shipments spine)
```

**Implication:** V-E10 + V-E6 are the only items with **zero blockers** post-launch — both can start day-1. V-A6 + V-E1 unblock the bulk; ก๊อต lock-pending.

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

### V-A6 — WHT (ภาษีหัก ณ ที่จ่าย)
**Blocker:** ก๊อต lock ADR-0015 (4 open Qs in DRAFT)
**Spec:** [`decisions/0015-withholding-tax-model.md`](../decisions/0015-withholding-tax-model.md)
**Migration:** ~`0044_wht_model.sql` (เดฟ structural lane?) — confirm with เดฟ before writing
**Code touch:**
- `actions/admin/tax-invoices.tsx::issueTaxInvoice` — WHT branch
- `tax_invoices` table — add `wht_*` columns
- 50-ทวิ document upload — Supabase Storage bucket
**Pre-implementation check:**
- [ ] ADR-0015 Status flipped to "Accepted"
- [ ] 4 open Qs answered (in ADR diff)
- [ ] เดฟ confirms whether ภูม writes the migration OR เดฟ does

### V-E10 — QA/QC intake inspection
**Blocker:** none (purely additive)
**Spec:** [`port-specs/freight-qa-qc-inspection.md`](../port-specs/freight-qa-qc-inspection.md)
**Migration:** ~`0045_freight_qa_inspections.sql` (mine)
**New entities:**
- table `freight_qa_inspections` (15 cols + 4 CHECK constraints + RLS for customer-read-own + warehouse-write)
- Storage bucket `qa-inspection-photos/`
**Code touch:**
- `actions/admin/qa-inspections.ts` (new) — 3 actions: create / update_outcome / waive
- `/admin/warehouse/qa-inspections/page.tsx` (new) — list view
- `/admin/warehouse/qa-inspections/[id]/page.tsx` (new) — detail + photos
- `lib/warehouse/qa.ts` (new) — typed client
**Effort:** ~6-8h
**Pre-implementation check:**
- [ ] Verify `freight_shipments` table EXISTS (V-E1 prereq) OR plan for cargo-only first
- [ ] If freight_shipments not yet shipped, the FK column stays nullable + V-E10 keys to `cargo_shipments` only initially

### V-E6 — Freight quotation workflow
**Blocker:** none
**Spec:** [`port-specs/freight-quotation.md`](../port-specs/freight-quotation.md)
**Migration:** ~`0046_freight_quotes.sql` (mine)
**New entities:**
- `freight_quotes` (28 cols including approval workflow fields)
- `freight_quote_items` (per-line)
**Code touch:**
- `actions/admin/freight-quotes.ts` (new) — draft / submit / approve / reject / convert-to-shipment
- `/admin/freight/quotes/page.tsx` (list with status chips)
- `/admin/freight/quotes/[id]/page.tsx` (detail + 3-step approval UI)
- `/admin/freight/quotes/new/page.tsx` (create form)
- Optional customer-side accept: `/quotes/[token]/page.tsx` (public/protected)
**Effort:** ~15-20h
**Pre-implementation check:**
- [ ] Confirm `freight_shipments` table to convert TO exists (otherwise impl just keeps `converted_to_shipment_id` nullable until V-E1 ships)
- [ ] RBAC review with ก๊อต — who can approve? (spec says CEO/Manager; need `super` + new `manager` role?)

### V-E1 — Commercial invoice + packing list
**Blocker:** ก๊อต lock ADR-0016 (5 open Qs)
**Spec:** [`port-specs/freight-document-suite.md`](../port-specs/freight-document-suite.md) (combined w/ V-E3 + V-E4)
**Migration:** ~`0047_freight_shipments.sql` + `0048_freight_invoices.sql` (เดฟ structural?)
**New entities:** `freight_shipments` (cargo spine for freight) + `freight_invoices` + `freight_invoice_lines`
**Effort:** ~10-15h (spine alone; receipt/payment is V-E7 separate)

### V-E7 — Receipt + payment tracking
**Blocker:** V-E1 (freight_invoices) + V-A6 WHT (ADR-0015) + V-E10 (QA gate)
**Spec:** [`port-specs/freight-receipt-and-payment.md`](../port-specs/freight-receipt-and-payment.md)
**Migration:** ~`0049_freight_invoice_payments.sql` + `next_freight_invoice_serial()` SECURITY DEFINER fn
**New entities:** `freight_invoice_payments` (partial-pay ledger)
**Code touch:**
- `actions/admin/freight-invoices.ts` (new) — create invoice (with QA-pass gate) · record payment · issue receipt PDF
- `components/pdf/freight-receipt.tsx` (new) — RD Code 86 compliant
- `/admin/freight/invoices/*` pages
**Effort:** ~15-20h
**Pre-implementation check:**
- [ ] V-E10 QA gate live (server-side reject `qa_not_passed`)
- [ ] V-A6 WHT live (wht_* fields populated on invoice issuance)
- [ ] `next_freight_invoice_serial()` fn deployed (mirror migration 0034 `next_tax_invoice_serial`)

### V-E8 + V-H1 + V-H2 — Commission withdrawal (one combined batch)
**Blocker:** ADR-0015 WHT (15% on payouts > 5k per Thai law) + ก๊อต RBAC for new `interpreter` role
**Spec:** [`port-specs/commission-withdrawal.md`](../port-specs/commission-withdrawal.md)
**Migration:** ~`0050_commissions.sql` (4 tables: tiers · accruals · withdrawals · withdrawal_items)
**New entities:**
- `commission_tiers` (per-role/per-service rate lookup)
- `commission_accruals` (earned-but-unpaid)
- `commission_withdrawals` (request → admin approve → paid)
- `commission_withdrawal_items` (link withdrawal ← accruals)
**Code touch:**
- `actions/admin/commissions.ts` (new) — bulk-accrue (cron) · request-payout · approve+slip-upload · mark-paid
- `lib/auth/require-admin.ts` — extend `AdminRole` with `"interpreter"` (waits on ก๊อต)
- `/admin/commissions/*` pages (request form · admin approval queue · history)
- `/commissions/me/*` (interpreter/sales-rep self-serve request flow)
- Background cron `/api/cron/commission-accrue` (daily — scans closed orders → writes accruals)
**Effort:** ~20-30h
**Pre-implementation check:**
- [ ] ADR-0015 locked (WHT 15% rate applied here)
- [ ] ก๊อต confirms `interpreter` role addition to admins.role enum
- [ ] Existing `team_leaders` table mapped → new `commission_tiers` (per-existing-row migration)

### V-E9 — Monthly closing ritual
**Blocker:** none (additive)
**Spec:** [`port-specs/freight-monthly-closing.md`](../port-specs/freight-monthly-closing.md)
**Migration:** ~`0051_accounting_periods.sql` + read-only trigger
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

## 🧱 Migration numbering map (proposed — confirm with เดฟ)

| Number | Item | Owner | Status |
|---|---|---|---|
| `0041` | bill_to_name_override | ภูม | ✅ shipped + run on dev |
| `0042` | cargo_containers.close_at | ภูม | ✅ shipped + run on dev |
| `0043` | slip_transferred_at | ภูม | ✅ shipped + run on dev |
| `0044` | WHT model (V-A6) | เดฟ structural? | 🔴 pending ก๊อต ADR-0015 lock |
| `0045` | freight_qa_inspections (V-E10) | ภูม | ⬜ post-launch |
| `0046` | freight_quotes + items (V-E6) | ภูม | ⬜ post-launch |
| `0047` | freight_shipments (V-E1) | เดฟ structural? | 🔴 pending ก๊อต ADR-0016 lock |
| `0048` | freight_invoices + lines (V-E1/E7) | ภูม | 🔴 dep 0047 + 0044 |
| `0049` | freight_invoice_payments (V-E7) | ภูม | 🔴 dep 0048 |
| `0050` | commissions (4 tables, V-E8/H1/H2) | ภูม | 🔴 dep 0044 (WHT) + ก๊อต RBAC |
| `0051` | accounting_periods (V-E9) | ภูม | ⬜ post-launch |

**Note:** numbers tentative — confirm with เดฟ before allocating. Pattern from earlier: ภูม picked 0041-0043 then เดฟ took 0044 for WHT when she writes it.

---

## 🎯 Day-1 post-launch action

Open this doc → confirm:
1. ก๊อต lock status of ADR-0015 + ADR-0016 + interpreter RBAC
2. เดฟ structural lane status (V-A6 WHT migration? V-E1 freight_shipments?)
3. Pick highest unblocked item from sequence (V-E10 likely)

ลุยตามได้เลย — spec อ่านแล้ว pattern เข้าใจ.
