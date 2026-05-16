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
**Spec:** [`port-specs/freight-document-suite.md`](../port-specs/freight-document-suite.md) (combined w/ V-E3 + V-E4) + [ADR-0016 §"Field model"](../decisions/0016-freight-value-model.md#field-model-sketch--final-table-layout-part-of-the-v-e1-freight-schema-migration) for shipment-level fields
**Migration:** ✅ `0050_freight_shipments.sql` (+ freight_parties + freight_job_seq + V-E10 QA FK backfill) + `0051_freight_invoices.sql` (+ freight_invoice_lines + freight_invoice_seq) shipped — needs `db push` on dev/prod
**New entities:** `freight_shipments` (cargo spine for freight, w/ `commercial_value_*` + `declared_customs_value_thb` + `exchange_rate` + `vat_plan_label` per ADR §"Field model") + `freight_invoices` + `freight_invoice_lines`
**Rules per ADR-0016 locked:** `rate_source` enum = `{'staff_entered'}` V1 · Option A (committed plan only, what-if = calculator UI) · declared-value edit = super+accounting + `declared_value_basis` + audit log · duty rate = snapshot from `hs_codes` at issuance, overridable + logged
**Effort:** ~10-15h (spine alone; receipt/payment is V-E7 separate)

### V-E7 — Receipt + payment tracking
**Blocker:** V-E1 (freight_invoices) + V-A6 WHT (ADR-0015) + V-E10 (QA gate)
**Spec:** [`port-specs/freight-receipt-and-payment.md`](../port-specs/freight-receipt-and-payment.md)
**Migration:** ~`0052_freight_invoice_payments.sql` + `next_freight_invoice_serial()` SECURITY DEFINER fn
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
> (freight/commission stack). เดฟ's member_code migration was moved **out of that
> block to `0060`** so ภูม can keep numbering freight migrations sequentially
> without colliding with เดฟ. Migrations apply in **sorted version order**, so the
> `0052`-`0059` gap is harmless — `0060` simply runs last. ภูม's next free = **`0052`**.

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
| `0049` | **wallet_order_payment_unique** (G9 / F-11 fix) | ภูม | ✅ **SHIPPED 2026-05-17** (commit 53c11f8) — needs `db push` on dev+prod before public launch 2pm |
| `0050` | **freight_shipments + parties** (V-E1) | ภูม | ✅ **SHIPPED 2026-05-17** (commit 6478efe) — needs `db push` |
| `0051` | **freight_invoices + lines** (V-E1) | ภูม | ✅ **SHIPPED 2026-05-17** (commit 6478efe) — needs `db push` |
| `0052` | freight_invoice_payments (V-E7) | ภูม | ⬜ next — dep 0051 + V-E10 QA-pass gate |
| `0053` | commissions (4 tables + interpreter role) (V-E8/H1/H2) | ภูม | ⬜ dep 0044 + E-5 interpreter role ack |
| `0054` | accounting_periods (V-E9) | ภูม | ⬜ post-launch |
| `0055`-`0059` | *(reserved headroom for ภูม's freight block — fill sequentially)* | ภูม | — |
| `0060` | **member_code_3digit** (PR00001→PR001) | เดฟ | ✅ **SHIPPED 2026-05-17** — needs `db push` |

> ⚠️ **9 migrations (`0044`-`0051` + `0060`) shipped to git but NOT yet applied
> to Supabase.** ภูม applies them on dev + prod — `supabase db push` (or paste
> each into the SQL Editor in ascending number order). `0050`/`0051` reference
> `0045`/`0048`, so number order satisfies every dependency.

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
