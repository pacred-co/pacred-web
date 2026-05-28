# 🚢 Pacred — Port Plan & Work Split

> **เป้าหมาย:** Port ระบบ PHP `pcs-cargo` ทั้งระบบ (customer + admin) → Next.js + Supabase
> **กติกา:** อ่านเอกสารนี้ครั้งเดียวจบ — **ไม่ต้องกลับไปดูไฟล์ PHP ต้นฉบับอีก**
> **วันที่:** 2026-05-13 · **เวอร์ชัน:** 1.0
>
> 🚀 **Post-launch?** This is the *launch* plan. The post-launch upgrade
> roadmap (the §0 verification gate · wire-the-flow · revenue/margin · ecosystem
> tools · supervisory layer) lives in → [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md).

---

## 🗺 What's still live in this file

The launch sprint (Parts O–U) has shipped — that history is archived (see
the split note below). **The two active backlogs that remain here:**

- **Part V** — Legacy Cargo Forensics → revenue-ready backlog (`V-A..V-H`)
- **Part W** — Gap-hunt backlog (`W-1..W-8` + Tier-2 tail)

For day-to-day execution sequencing, [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) is the
live doc. Parts Q/R/T owner-blocker + vendor-cutoff context (R1 ✅ Option F
resolved, ADR [`0003`](decisions/0003-china-search-vendor-cutoff.md)) now lives
in the Parts O–U archive.

---

## 📊 TL;DR — สรุป 5 บรรทัด

| | สถานะปัจจุบัน |
|---|---|
| ✅ **Customer-facing (ฝั่งลูกค้า)** | **~85% เสร็จ** — auth, dashboard, orders, forwarders, wallet, payment ทำงานได้จริง |
| ✅ **Admin HR** | **100% เสร็จ** — org chart, employees, recruitment, attendance, training, policies, audit |
| 🟡 **Admin Operations** | **~40% เสร็จ** — list views มี, ปุ่ม approve/reject/edit ส่วนใหญ่ยังไม่ครบ |
| 🔴 **Admin Finance/Reports** | **~10% เสร็จ** — accounting, reports เป็น stub |
| 🔴 **API Integrations** | **0% เสร็จ** — JMF/TTP/Sheets/PDF generation ยังไม่ทำ |

**Critical gaps สำหรับ launch:** PDF receipts (จริงๆ), admin forwarder/order status workflow, admin wallet approve, rate management UI

---

## 🎯 แผนแบ่งงาน

```
ปอน (podeng)  → ปิด customer-facing gaps + UI polish     [~3 sprints]
ภูม (Poom)    → admin operations ทั้งหมด                  [~4 sprints]
เดฟ (dave)    → integrations + critical infra + coordination [~3 sprints]
```

**Total estimated:** ~3-4 สัปดาห์ ถ้า full-time

---

<!-- PORT_PLAN_SPLIT_MARKER_2026_05_16 -->

> 📚 **Historic context moved to `docs/sprints/` archives** to keep this
> file under the 2000-line agent-read limit:
> - **Parts A–N** (PHP-port survey · gap analysis · early sprint plans
>   D–H · env decisions · tracking · production-readiness audits) →
>   [`docs/sprints/archive-a-to-n.md`](sprints/archive-a-to-n.md) (moved 2026-05-16)
> - **Parts O–U** (Sprint 5+ role restructure · Day-3 checkpoint ·
>   Sprint 6 / Track A / Track G shipped log · owner blockers ·
>   vendor cutoff · ก๊อต hand-off batch · Cargo Revenue Sprint brief ·
>   chat/legacy deficiency audit) →
>   [`docs/sprints/archive-o-to-u.md`](sprints/archive-o-to-u.md) (moved 2026-05-18)
>
> **What stays here = the still-active backlog: Part V (cargo-forensics)
> + Part W (gap-hunt) below.** The live execution roadmap is
> [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md).

---

# 🔬 Part V — Legacy Cargo Forensics → revenue-ready backlog (2026-05-16)

> **Source:** [`docs/audit/cargo-ops-forensics-2026-05-16.md`](audit/cargo-ops-forensics-2026-05-16.md)
> — decoded from the ไอแต้ม (legacy system developer) LINE chat + 10 real
> China-cargo spreadsheets เดฟ handed over (invoices · packing lists · Form E ·
> D/O letter · warehouse loading manifests). That doc is the **why**; this Part
> is the **schedule**.
>
> Revenue lens: 🔴 = unblocks cargo revenue now · 🟠 = daily ops pain · 🟡 = fix soon.
> Default owner = ภูม (cargo backend). Each task keeps its forensics ID (A1…F3).

## V-A — Money & accounting integrity

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-A1 | Payment record stores the **slip transfer time** (editable + audited) — not the approval-click time | ภูม | 🟠 | ⬜ |
| V-A2 | Order/payment **status rollback** with reason + audit row — staff self-serve, no dev (ADR-0014) | ภูม | 🔴 | ⬜ |
| V-A3 | Payment↔order **reconciliation** — a matched slip auto-clears "เครดิตค้างนำเข้า"; mismatch surfaced to staff | ภูม | 🔴 | ⬜ |
| V-A4 | Rate-entry **validation** — exchange/price rate range-guarded; block the "เรทเบิ้ล" (doubled-rate) class of error | ภูม | 🟠 | ⬜ |
| V-A5 | **Manual adjustment line** on an invoice (±amount, reason, audited) — ends the per-cent dev tickets | ภูม | 🟡 | ⬜ |
| V-A6 | **Withholding-tax model** — invoice gross → WHT 1%/3% → net paid; receipt issuance **gated on WHT-certificate (50 ทวิ) upload**. Design = [ADR-0015](decisions/0015-withholding-tax-model.md) (✅ LOCKED 2026-05-16 — PORT_PLAN was stale). ✅ V1 SHIPPED: migration `0044_withholding_tax.sql` (full `withholding_tax_entries` schema per ADR §Decision) + `actions/admin/wht.ts` (6 actions: createWhtEntry, markCertReceived, waiveCert, cancelEntry, uploadCert, listEntries) + `actions/wht.ts` customer cert upload + tax-invoice WhtPanel on `/admin/tax-invoices/[id]` + GATE wired at `actions/admin/tax-invoices.tsx:113` and `actions/admin/freight-invoices.ts:340` (refuses issuance while `cert_status='pending'`) + customer receipt pages render WHT row + accounting dashboard MTD sum. **Sprint-15-prelude added** `/admin/wht` centralized chase queue (pending/received/waived filter chips · aged-days red ≥30d · 4 status counts · link to parent) — closes the "ตามแทบไม่ได้เลย" staff gap from ADR §Context. Pairs w/ ADR-0006 + migration 0034. | ภูม + เดฟ | 🔴 | ✅ V1 |
| V-A7 | Receipt-number cleanup — one canonical number, drop the error-prone `-N` suffix | ภูม | 🟡 | ⬜ |
| V-A8 | Accounting export reconcilable with **ภพ.30** (sales-tax report = filed VAT return) | ภูม | 🟡 | ⬜ |

## V-B — Self-serve reports

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-B1 | Admin report screens (zero dev tickets): pending-import payments · credit-pending imports · containers awaiting TH warehouse · debtors · refunds issued · month's orders — CSV export each | ภูม | 🟠 | ⬜ |

## V-C — Order-lifecycle flexibility

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-C1 | **Post-lock refund** path — refund over-collected shipping when the carrier changes after "preparing to ship" | ภูม | 🔴 | ⬜ |
| V-C2 | Bill-header (buyer name) **editable by staff**, audited | ภูม | 🟠 | ⬜ |
| V-C3 | "ตัดตู้" UX — enforce + explain the container close-date (วันที่ปิดตู้) before assigning parcels | ภูม | 🟠 | ⬜ |

## V-D — Container & volume integrity (revenue-critical)

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-D1 | Store CBM **per source** (received / queue / manifest) on `cargo_shipments`; surface the diff to staff **before billing** (real case GZE260422-1: 16.79 vs 21.28) | ภูม | 🔴 | ⬜ |
| V-D2 | One **canonical cargo-type enum**; map both legacy sets (API `A/M/X/O/Z` + manifest `G/T/F`) onto it | ภูม | 🟠 | ⬜ |
| V-D3 | Link the Pacred container code ↔ the carrier's physical container number | ภูม | 🟡 | ⬜ |
| V-D4 | Split-receipt expected-vs-received box count — migration 0037 (U1-5) schema ✅; wire the UI | ภูม | 🟠 | ⬜ |

> 📐 **Schema spec for V-D1/D2/D3** → [`docs/port-specs/cargo-volume-reconciliation.md`](port-specs/cargo-volume-reconciliation.md) — เดฟ prep (proposed columns + canonical cargo-type enum + legacy mapping); ภูม implements + finalises.

## V-E — Freight (FCL/LCL) document suite — net-new (Phase I2)

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-E1 | Commercial **Invoice + Packing List** generator — ✅ V1 SHIPPED 2026-05-17 (commit 6478efe). freight_shipments + parties + invoices + lines + 14 admin actions + admin list/new/detail + V-E6 convert wired. PDF generators + customer portal = V-E1.1 follow-up. | ภูม | 🟠 | ✅ V1 |
| V-E2 | Freight **value model** — `real_value` vs `declared_value` vs `vat_plan` ("แผน VAT" 1/2/…); VAT 7% on the declared figure. Design = [ADR-0016](decisions/0016-freight-value-model.md) (🟡 DRAFT — ก๊อต to lock) | ภูม impl · ก๊อต lock ADR-0016 | 🟠 | ⬜ |
| V-E3 | **Form E** (ASEAN-China FTA Certificate of Origin) generator — 12-box form, HS code, origin criterion. ✅ V1 SHIPPED 2026-05-17 (commit `98a4c85`). `components/pdf/freight-form-e.tsx` + `app/api/freight-invoice/[id]/form-e/route.tsx` + admin download button on shipment-detail. Pure templating over `freight_shipments`/`freight_invoice_lines` — no new schema. Audited 2026-05-25 by Sprint-13 Agent M. | ภูม | 🟡 | ✅ V1 |
| V-E4 | **D/O exchange letter** generator (sea) — B/L no, vessel/voyage, container no, telex-release wording. ✅ V1 SHIPPED 2026-05-17 (same commit `98a4c85` as V-E3). `components/pdf/freight-do-letter.tsx` + `app/api/freight-invoice/[id]/do-letter/route.tsx`. Pure templating; carrier-name lookup from B/L prefix; Thai พ.ศ. dates. Audited 2026-05-25. | ภูม | 🟡 | ✅ V1 |
| V-E5 | Range-guard **every numeric import** — legacy invoice sheets carry int32-overflow garbage (`-2146826xxx`) | ภูม | 🟡 | ⬜ |

> 📐 **Schema + generation spec for V-E1/E3/E4** → [`docs/port-specs/freight-document-suite.md`](port-specs/freight-document-suite.md) — เดฟ prep (the `freight_*` tables + Invoice/PL · Form E · D/O generators); value/VAT math in [ADR-0016](decisions/0016-freight-value-model.md).

## V-E6..V-E12 — Freight expansion (NEW from deep-sweep 2026-05-16)

> Discovered in deep-sweep of PHP `pcs-admin/include/pages/{home/Freight, home/CargoAndFreight, hs-forwarder-invoice, forwarder-quotation, closingAccReportForwarder, withdraw-commission-*}` — 12 subdirs the prior audits never explored. Full inventory + new tables → [`docs/audit/php-deep-sweep-2026-05-16.md`](audit/php-deep-sweep-2026-05-16.md) §5. All Phase I2 — post-Monday-launch.

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-E6 | **Quotation workflow** — ✅ V1 SHIPPED 2026-05-17 (commit a0c9c78). freight_quotes + items + 7-state workflow + 11 admin actions + admin list/new/detail UI + audit timeline. Convert-to-shipment stub (V-E1 dep). Customer portal + PDF deferred to V-E6.1. 📐 spec [`port-specs/freight-quotation.md`](port-specs/freight-quotation.md). | ภูม | 🟠 | ✅ V1 |
| V-E7 | **Receipt & payment tracking** — payment ledger w/ withholding-tax + RD Code 86. Schema `freight_invoices` + `freight_invoice_lines` + `freight_invoice_payments` (was `tb_receipt*`). 📐 spec → [`port-specs/freight-receipt-and-payment.md`](port-specs/freight-receipt-and-payment.md). ✅ V1 SHIPPED (migrations `0052_freight_invoice_payments.sql` + `0053_freight_invoice_wht.sql`). `actions/admin/freight-invoice-payments.ts` (670 lines · record/void/uploadSlip/listPayments/getReceiptGate) + `lib/validators/freight-payment.ts` + admin payments panel embedded in `shipment-detail-client.tsx` + customer surfaces `/freight/receipts/{print/[id], history}` + receipt PDF at `app/api/freight-receipt/[id]/route.tsx`. Audited 2026-05-25 by Sprint-13 Agent N. | ภูม | 🟠 | ✅ V1 |
| V-E8 | **Commission withdrawal** — interpreter (ล่าม) + sales rep. Schema `commission_tiers` + `commission_accruals` + `commission_withdrawals` + `commission_withdrawal_items` (was `tb_withdraw_comm_*`). Includes WHT 15% on >5k payments per Thai law (Revenue Code §50). 📐 spec → [`port-specs/commission-withdrawal.md`](port-specs/commission-withdrawal.md) (covers V-E8 + V-H1 + V-H2 combined). PHP ref `pages/withdraw-commission-{interpreter,sale}/` | ภูม | 🟠 | ⬜ |
| V-E9 | **Monthly closing ritual for forwarder accounting** — `accounting_periods` with status=open\|closing\|closed + frozen-via-trigger; read-only past periods. 📐 spec → [`port-specs/freight-monthly-closing.md`](port-specs/freight-monthly-closing.md). ✅ V1 SHIPPED (migration `0056_accounting_periods.sql` 324 lines · `accounting_periods` + `period_close_event` + DB-level freeze trigger). `actions/admin/accounting-periods.ts` 428 lines (openPeriod/requestClose/finalizeClose/adminReopenPeriod) + `/admin/accounting/periods/{page.tsx, [period_yyyymm]/page.tsx, period-detail-actions.tsx, open-period-button.tsx}`. Audited 2026-05-25 by Sprint-13 Agent N. | ภูม | 🟠 | ✅ V1 |
| V-E10 | **QA/QC intake inspection** — pre-billing gate; checklist (damage / missing / quality); pass→release, fail→rework. Schema `freight_qa_inspections` (was `tb_check_forwarder`). 📐 spec → [`port-specs/freight-qa-qc-inspection.md`](port-specs/freight-qa-qc-inspection.md). ✅ V1 SHIPPED (migration `0045_freight_qa_inspections.sql` + FK backfill in `0050_freight_shipments.sql` §6). `actions/admin/qa-inspections.ts` (createQaInspection/updateQaInspectionNotes/uploadQaPhoto/isCargoShipmentQaPassed/`isFreightShipmentQaPassed`) + `/admin/warehouse/qa-inspections/{page.tsx, new/page.tsx, [id]/page.tsx}`. **QA-gate WIRE landed Sprint-13** (`eb3cd85`) — `adminCreateFreightInvoice` now blocks invoice INSERT when QA not passed (V-E10 pre-billing gate was a "V1 stub" comment before; wired now). | ภูม | 🟡 | ✅ V1 |
| V-E11 | **Customs declaration UI (ใบขนสินค้า)** — internal-only V2 (no Thai Customs API integration yet — Phase III). Schema `freight_customs_declarations` + lines. 📐 spec → [`port-specs/freight-customs-declaration.md`](port-specs/freight-customs-declaration.md). ✅ V1 SHIPPED (migration `0057_customs_declarations.sql`). `actions/admin/customs-declarations.ts` (full CRUD + draft/submit/mark_accepted) + `/admin/freight/declarations/{page.tsx, [id]/page.tsx, [id]/declaration-detail-client.tsx}`. Audited 2026-05-25 by Sprint-13 Agent O. | ภูม | 🟡 | ✅ V1 |
| V-E12 | **CargoAndFreight role dashboards** — 7 per-role dashboards (Super · Accounting · Warehouse · SalesAdmin · Driver · Interpreter · Ops fallback) via single-route dispatch. 📐 spec → [`port-specs/cargo-and-freight-dashboards.md`](port-specs/cargo-and-freight-dashboards.md). PHP ref `pages/home/{CargoAndFreight,Freight}/` (mostly placeholder; Pacred build largely net-new) | ภูม + ก๊อต | 🟡 | ⬜ |

## V-G — Admin bulk ops + workflow polish (NEW from deep-sweep)

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-G1 | **Bulk forwarder actions** — multi-shipment status update / driver assignment / cancel. 📐 spec → [`port-specs/admin-polish-bundle.md`](port-specs/admin-polish-bundle.md) §V-G1. PHP ref `forwarder-action.php` | ภูม | 🟡 | ⬜ |
| V-G2 | **Bulk transfer customers to sales rep** — currently per-customer only at `/admin/customers/[id]/transfer-rep`. 📐 spec → [`port-specs/admin-polish-bundle.md`](port-specs/admin-polish-bundle.md) §V-G2. PHP ref `transferSalesCustomers.php` | ภูม | 🟡 | ⬜ |
| V-G3 | **Admin push broadcast (popup)** — admin send notifications TO users via ad-hoc UI. ✅ V1 SHIPPED (commits `ca3626d` + `08afee6` + `f0bc812` audit follow-ups). migration `0055_broadcasts.sql` (broadcasts table + notifications.broadcast_id FK + RLS super/sales_admin) · validators `lib/validators/broadcast.ts` · server actions `actions/admin/broadcasts.ts` (create/schedule/send-now/cancel + audience-paged fan-out) · admin pages `/admin/broadcasts/{list,new,[id]}` + client action panel · cron `/api/cron/send-scheduled-broadcasts` (every 5 min, race-safe optimistic lock). V1 = in-app notifications only; LINE push fan-out deferred to V-G3.2 (needs LINE Messaging API quota wiring). 📐 spec → [`port-specs/admin-polish-bundle.md`](port-specs/admin-polish-bundle.md) §V-G3. PHP ref `popup.php` | ภูม | 🟡 | ✅ V1 |
| V-G4 | **Cargo TOS version management UI** — ✅ V1 SHIPPED 2026-05-17 (commit c0af160). tos_versions + tos_acceptances tables + /admin/settings/tos-versions admin UI (create/edit/activate/per-version acceptance count). V1 = backend management only; customer gate still reads CURRENT_TOS_VERSION from lib/tos.ts (V-G4.1 wires DB read). | ภูม | 🟡 | ✅ V1 |
| V-G5 | **Organization 5 contact CRUDs** — ✅ V1 SHIPPED 2026-05-17 (commit 8befff5). org_contacts table + /admin/settings/contacts (tabs per kind). V1 = backend management only; customer-side wire to footer + JSON-LD = V-G5.1 follow-up. | ภูม | 🟢 | ✅ V1 |
| V-G6 | **New admin reports** — ✅ SHIPPED 2026-05-17 (commit fe6d013). 4 routes: /admin/reports/{forwarder-volume, sales-by-rep, hs-code-revenue, user-sales-history[/[customer_id]]}. All pure SELECT, period filter, CSV export. Zero schema changes. | ภูม | 🟡 | ✅ |
| V-G7 | **Audit feature-parity verifications** — ✅ ALL 6 SHIPPED 2026-05-17. Bundle: [`parity-hs-customrate`](audit/parity-hs-customrate.md) · [`parity-forwarder-driver`](audit/parity-forwarder-driver.md) · [`parity-settings-vip`](audit/parity-settings-vip.md) · [`parity-admin-table`](audit/parity-admin-table.md) · [`parity-time-attendance`](audit/parity-time-attendance.md) · [`parity-admin-profile`](audit/parity-admin-profile.md). 5/6 = 🟢 covered, 1/6 = 🟡 partial (admin-profile self-service gap → V-G9 follow-up). | ภูม | 🟢 | ✅ |

## V-H — Role models for commission (NEW from deep-sweep)

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-H1 | **Interpreter (ล่าม) role** — extend `admins.role` enum + commission accrual per-job + withdrawal workflow + WHT calc. 📐 spec → [`port-specs/commission-withdrawal.md`](port-specs/commission-withdrawal.md) (combined w/ V-E8 + V-H2). PHP ref `withdraw-commission-interpreter/` + `tb_set_comm_interpreter` lookup | ก๊อต confirms RBAC → ภูม | 🟠 | ⬜ |
| V-H2 | **Sales rep commission finalize** — currently partial via `team_leaders` + `/admin/sales-payouts`. Add: approval workflow detail, rejection_reason, slip upload, WHT math. 📐 spec → [`port-specs/commission-withdrawal.md`](port-specs/commission-withdrawal.md). PHP ref `withdraw-commission-sale/` | ภูม | 🟠 | ⬜ |

> 📐 **Spec docs shipped (เดฟ night-5):**
> - **Freight stack (V-E):** V-E6 quotation · V-E7 receipt+payment · V-E8/H1/H2 commission · V-E9 monthly closing · V-E10 QA/QC · V-E11 customs declaration · V-E12 role dashboards
> - **Admin polish (V-G):** V-G1..V-G7 combined in [`admin-polish-bundle.md`](port-specs/admin-polish-bundle.md)
> - **Tooling/setup:** [`docs/setup/line-liff-create-guide.md`](setup/line-liff-create-guide.md) — DV-2 LIFF Console step-by-step
>
> All 8 specs in [`docs/port-specs/`](port-specs/) + [`docs/setup/line-liff-create-guide.md`](setup/line-liff-create-guide.md) ready for ภูม Monday pickup. Estimated total V2 long-phase: ~150-200h freight stack (V-E6+) + ~32-40h admin polish (V-G).
> 📋 **Full inventory + 17 new tables + false-alarm filter** → [`docs/audit/php-deep-sweep-2026-05-16.md`](audit/php-deep-sweep-2026-05-16.md).

## V-F — Strategic / dependency

| # | Task | Owner | Rev | Status |
|---|---|---|---|---|
| V-F1 | Migration burn-down to remove the **ไอแต้ม single-point-of-failure** (China product API + server + SMS all bill through one freelancer) — tracked in [`runbook/legacy-cutover-tracker.md`](runbook/legacy-cutover-tracker.md) (8 dependencies, F1-1…F1-8) | เดฟ + ก๊อต | 🔴 | 🏗 |
| V-F2 | PEAK / ERP accounting-export API (follows V-A8) | เดฟ | 🟡 | ⬜ |
| V-F3 | Legacy-infra resilience — fragile 3rd-party server, pay-or-die; cut over before any contract lapse | ก๊อต | 🟡 | ✅ review [`audit/v-f3-legacy-infra-resilience-2026-05-16.md`](audit/v-f3-legacy-infra-resilience-2026-05-16.md) by เดฟ; ก๊อต confirms legacy retirement date |

## V-ADM1 — Admin UI polish (เดฟ instruction, 2026-05-16)

ภูม: small `/admin` theme cleanup so the back office matches the rest of the app —
- **remove the right-hand sidebar** entirely;
- **left sidebar → white background** (`bg-white dark:bg-surface`);
- every other surface → adopt the **same theme tokens** as the public site + customer portal (`bg-surface` / `text-foreground` / `border-border` — no admin-only palette);
- apply the public/customer **body background** (the radial red-cloud gradient in [`app/globals.css`](../app/globals.css)) to `/admin` too.

Full hand-off + acceptance criteria → [`docs/briefs/poom.md`](briefs/poom.md).

## Cross-links

- The **why** behind every V task → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](audit/cargo-ops-forensics-2026-05-16.md) §4-5
- Schema spine for V-D* → [`docs/architecture/container-centric-model.md`](architecture/container-centric-model.md)
- V-A6 WHT pairs with → [`docs/decisions/0006-tax-invoice-flow.md`](decisions/0006-tax-invoice-flow.md) + migration `0034`
- Audit-row pattern for V-A2 / V-C* → [`docs/decisions/0014-customer-self-service-state-transitions.md`](decisions/0014-customer-self-service-state-transitions.md)
- Permanent decoded model → [`docs/learnings/pacred-domain-knowledge.md`](learnings/pacred-domain-knowledge.md)

**End of Part V.** Each ✅ shipped → tick the table + commit `docs(port-plan): V-N shipped — <description>`. New cargo-forensics findings → append rows here, never rewrite history.

---

# 🕳 Part W — Gap-hunt backlog (2026-05-17)

> **Source:** the 5-angle source-code gap-hunt + the chained synthesis in
> [`docs/research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md)
> — read that doc for the **why** (the 4 chains: the P0 security keystone, the
> wallet-leak chain, the "islands with no bridges" theme). This Part is the
> **schedule**: every genuinely *unplanned* `G-*` finding across the 5 gap docs,
> **deduped** against `R-1..R-19` ([`docs/research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md))
> and Part V (`V-A..V-H`), consolidated into one ranked list.
>
> Revenue/launch lens: 🔴 = launch-week or post-launch P0 · 🟠 = post-launch P1 ·
> 🟡 = post-launch P2/P3. Effort: **S** ≤3 d · **M** 1–2 wk · **L** 2–4 wk.
> Owner TBD — assign at planning. Each row keeps its gap-doc source IDs.

## W-1..W-8 — ranked backlog

| # | What | Why | Sev | Effort | Depends on | Launch-blocker | Source |
|---|---|---|---|---|---|---|---|
| **W-1** | **Security keystone** — role-pin every money/PII/order RLS policy (`is_admin(array[...])`, never bare); add `requireAdmin([roles])` to the 11 ungated finance pages; make the `createAdminClient` ownership check un-skippable via a `lib/` helper; add a DB-level money-mutation audit trigger. ✅ V1 SHIPPED — migration `0062_rls_role_pin_money_pii.sql`: §1-2 re-pins every money/PII/order RLS policy with explicit role arrays (`['super','accounting','ops']` etc) — closes the `driver`/`warehouse` direct-PostgREST exploit S-1; §3 adds `audit_wallet_transaction()` SECURITY DEFINER fn + `wallet_tx_audit_trigger` AFTER INSERT/UPDATE on `wallet_transactions` → writes to `admin_audit_log` regardless of code path (catches the non-action write path that `logAdminAction` structurally cannot). `lib/auth/owned-write.ts` provides `assertOwnedProfileId` + `assertOwnsRecord` helpers for createAdminClient ownership checks. Admin layout `requireAdmin()` at `app/[locale]/(admin)/layout.tsx` gates ALL `/admin/*` pages — the "11 ungated finance pages" concern was misframed (per-page gates not needed when layout gate covers all). Sprint-18 audit confirmed: 2026-05-25 query found only 2 bare `is_admin()` remaining on money/PII tables (`containers` — legacy, being deprecated; `forwarder_driver` — driver-role table). Other 19 bare-`is_admin()` are operational tables (HR/audit/CSV/work-items) out of W-1 money/PII/order scope. Audited 2026-05-25 by Sprint-18 solo audit — PORT_PLAN was stale. | Money is reachable (read), movable (write) + un-attributed: a low-trust `driver`/`warehouse` admin JWT passes RLS to every wallet/order/tax table, the finance pages have no page gate, and direct PostgREST writes leave no `admin_audit_log` row | 🔴 P0 | M | none | ✅ V1 already in prod | sec S-1·S-2·G-6 · admin H-1·H-2·H-7 |
| **W-3** | **Wallet-integrity guard** — add `freight_invoice` to `wallet_transactions.reference_type` CHECK + a real debit in `recordFreightPayment`; sum **pending+completed** debits in every balance check; add a status-transition guard to `adminUpdateYuanPayment` + fire the refund credit for a *completed* wallet-tx; atomic non-negative-balance mechanism (`SELECT … FOR UPDATE` in a DB fn, not a naive CHECK). ✅ V1 SHIPPED — migration `0063_wallet_freight_invoice_reference.sql` (adds 'freight_invoice' to reference_type CHECK + `wallet_tx_freight_payment_uniq` partial-unique index) + `0064_wallet_overdraw_guard.sql` (`wallet_available_balance(profile, bucket)` SQL fn = completed PLUS open pending debits + `wallet_assert_no_overdraw()` BEFORE trigger with row `FOR UPDATE` lock). `debitWalletForFreightPayment` writes a real debit at `actions/admin/freight-invoice-payments.ts:169` with available-balance pre-check + 23505 idempotent retry; `adminUpdateYuanPayment` has status-transition allow-list at `actions/admin/yuan-payments.ts:12+` + refund branch at L267 fires the reversal debit. `getWalletAvailableBalance` in `lib/wallet/balance.ts` is the app-layer mirror of the DB function. Audited 2026-05-25 by Sprint-16 solo audit — PORT_PLAN was stale. | One bug class leaking money: freight wallet-pay flips invoice `paid` with no debit; stacked pending debits overdraw to negative; yuan refund→re-completed never re-debits | 🔴 P0/P1 | M | none | ✅ V1 already in prod | sec G-3·S-5 · customer H-1 · rev-flow H-1·H-2 |
| **W-2** | **Wire the flow** — unify the 2 container tables (`cargo_containers` canonical, migrate `containers`, repoint `forwarders.container_id`, redirect `/admin/containers`); propagate container status onto `forwarders`/`service_orders` via a documented enum; arrival→billing gate (block `mark*Paid` until container-no + final CBM confirmed); freight `quote.convert`→shipment + `markDelivered`→invoice wiring + `freight_invoices` partial-unique index; order auto-close action + trigger. ✅ V1 SHIPPED (with Sprint-16 prod-state recovery). Container unify = `0059_container_unify.sql` (cargo_containers canonical + legacy_container_id backfill key + `forwarders.cargo_container_id` + `service_orders.cargo_container_id` FK columns). Spine = `0016_phase_h_upgrades.sql` (legacy `containers`) + `0033_containers.sql` (`cargo_containers` + `cargo_shipments` + tracking + status_history). Quote→shipment = `actions/admin/freight-quotes.ts:467+` (`freight_quote.auto_convert_on_accept` on accept-status flip). markDelivered→invoice + order auto-close = `0078_warehouse_cascade_rpc.sql` (`service_order.auto_close_on_delivery` fires when all items delivered). freight_invoices partial-unique = `wallet_tx_freight_payment_uniq` in 0063. **Sprint-16 finding (2026-05-25)**: cargo spine parent tables (cargo_containers + cargo_shipments + legacy containers) had been **DROPPED from prod** at some point — only orphan child tables (cargo_container_status_history + cargo_shipment_tracking, no FK to parent) survived. Sprint-11 MOMO sync + Sprint-13 V-E10 QA + Sprint-13 V-E11 customs would all 500 at runtime against missing parent. Sprint-16 re-applied 0016+0033+0059 via psql (all idempotent CREATE TABLE IF NOT EXISTS · backfill processed 0 rows · empty tables, no data loss). New `docs/learnings/parallel-agent-sprints.md` L-PAS-05 captures the "migrations in repo not applied to prod" pattern. | Pacred-web is correct islands with no edges: container `delivered` never closes the order, the customer portal reads a frozen status, freight jobs reach `delivered` un-billed, no order ever auto-closes — the legacy "ของอยู่ไหน" leak rebuilt inside Pacred. Precondition for `R-1` having value | 🟠 P1 | L | container-unify must precede `R-1`/`R-10` | ✅ Re-applied 2026-05-25 | rev-flow Stages 4·6·7·9 · admin H-3 |
| **W-4** | **MOMO JMF sync made runnable** — fill the `sync.ts` upsert loop, add `app/api/cron/momo-jmf-sync/route.ts`, add the 7th `vercel.json` cron, capture the real `?api=` endpoint names | `lib/integrations/momo-jmf/` has a typed client but the sync body is a stub with **zero callers and no cron** — it cannot run at all; every container is hand-typed. MOMO is Pacred's only digital container-status source | 🔴 P0 | L | the `?api=` endpoint capture + the MOMO-1 call | No (manual entry covers launch; P0 immediately after) | integrations G-1 |
| **W-5** | **Refund money path** — one credit-writing action (`kind='refund'`) covering cancel-after-paid, yuan refund of a *completed* payment, carrier-change over-collection (`V-C1`); plus a customer-facing claim/issue entry ("ตกหล่น" — type, photos, status lifecycle) that can link an `R-9` warehouse discrepancy row | Statuses say "refunded" while no money moves; cancelling a paid order orphans the wallet debit; customers have no channel but LINE to report a missing/damaged item or request a refund | 🟠 P1 | M | `V-C1`; loosely `R-9` | No | rev-flow H-3 · admin G-6 · customer G-C2 |
| **W-6** | **Admin supervisory layer** — audit-log search/filter/export + per-target history; staff RBAC console (capability view, section scoping, `super`-holder review); notification delivery log; admin global search (customer / h_no / f_no / container); cron-health panel; bulk-action failed-id summary rows | The admin can write money but nobody can answer "who changed this / can I trust the team with RLS-bypass UI"; `admin_audit_log` is write-only with no query UI; `super` proliferation has no review surface; failed LINE pushes vanish silently | 🟠 P1 | M | pairs with W-1 (audit trigger) | No | admin G-1·G-2·G-5·G-7·G-9·H-5·H-6 |
| **W-7** | **Customer credit line (เครดิตสินค้า / "pay later")** — `profiles.credit_limit` + a credit-charge ledger kind + a credit-outstanding view + a "pay my credit" action + an admin grant/limit + aging screen | `wallet.credit_balance` + the `/wallet` "เครดิต — วงเงินเครดิตจาก Pacred" card are rendered but **no code earns, grants, or spends credit** — the largest customer-facing dead surface; the legacy portal had a real credit line as a repeat-importer retention lever | 🟠 High | L | a small ADR (eligibility + limit rules + overdue handling); feeds `R-7` | No | customer G-C1 |
| **W-8** | **Freight WHT gate + per-container cost basis** — add `freight_invoice_id` to `withholding_tax_entries` + relax the XOR CHECK so `getFreightReceiptGate` stops being a permanent no-op; add a `container_costs` carrier-rate-card table (cost per cabinet × cargo type) | A juristic freight customer can pull a receipt with no 50-ทวิ cert on file (the ADR-0015 control simply does not exist for freight); Pacred has no record of what a container *cost* it → margin-blind on the cargo side; feeds `R-7` | 🟠 P1 | M | feeds `R-7` (which must be 2 tables: rate card + AP ledger) | No | sec G-1·G-4 · rev-flow Stage 8 |

## W-9+ — Tier 2 tail (post-launch P2/P3)

Lower-severity unplanned items; schedule interleaved with `R-3..R-19`. Grouped by source doc — see [`PACRED-MASTER-STRATEGY.md` §4.2](research/PACRED-MASTER-STRATEGY.md) and the per-doc detail:

- **Customer** ([`gap-customer.md`](research/gap-customer.md)) — G-C3 delivery-acknowledgement ("ยืนยันรับสินค้าครบถ้วน"); G-C4 tax invoice for ฝากโอน (yuan); G-C5 per-shipment forwarding-instruction recap; G-C6 pre-payment self-service order edit; H-2/H-3/H-4/H-6 wallet-tx + order lifecycle UX (post-debit-failure visibility, customer cancel of a pending deposit/withdraw, stray-`cancelled`-order cleanup, slip-rejection-with-reason loop); H-5 `how-to-use` stub content.
- **Admin** ([`gap-admin.md`](research/gap-admin.md)) — G-3 ops-facing container cost-entry; G-4 view-as-customer / session tools; G-8 export hub + scheduled reports; G-10 editable business config (OTP TTL, min-deposit, feature flags, cashback %); H-4 widen the reconcile `kind` match.
- **Integrations** ([`gap-integrations-tools.md`](research/gap-integrations-tools.md)) — G-3 resolve the hCaptcha prod-fail-mode doc contradiction (decide **before** the launch checklist); G-4 clear the 2 Sentry deprecation warnings; G-5 webhook-receiver harness (`app/api/webhooks/`, signature-verifying); G-6 real ship-tracking feed (vs the hand-typed `vessel_voyage` string); G-7 PEAK; G-8 NetBay; G-9 fuel-cost calculator; G-10 Customs Trader Portal; G-11 driver/warehouse scan + capacity layer; G-13 flag (do NOT scrub) the dead legacy carrier env stubs.
- **Schema/security** ([`gap-schema-security.md`](research/gap-schema-security.md)) — S-3 rate-limit `confirmPasswordResetByPhone` (+ `confirmPhoneChange`, `registerPersonal`); S-4 add an edge route-protection check in `proxy.ts`; S-6 IP/global cap on `requestOtp` (SMS-cost abuse); S-7 `admins` default-deny guard test; S-8 transactional money-audit insert; G-5 yuan-refund / cancel slip+reason parity; G-7 audit-log retention column + `tax_id` DBD-verification gate before tax-invoice issuance.

> **Dedup.** `gap-revenue-flow`'s own `W-1..W-8` numbering is folded into the
> Part W ids above (its container/propagation/billing items ⇒ **W-2**; its
> deposit/refund items ⇒ **W-3**+**W-5**; its yuan-guard/orphan-report ⇒
> **W-3**+**W-6**). Items already in `R-1..R-19` / `V-A..V-H` are **not**
> re-listed here — Part W is strictly the *delta* the 5 gap-hunts found.

## Cross-links

- The **why** + the 4 chains + phasing → [`docs/research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md)
- The earlier `R-1..R-19` roadmap this extends → [`docs/research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md)
- Pacred-identity guardrail (legitimate-path-only — load-bearing) → [`docs/research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md) §4
- Security audits W-1 corrects → [`docs/audit/owasp-2026-05.md`](audit/owasp-2026-05.md) · [`docs/audit/rls-and-audit-log-2026-05-16.md`](audit/rls-and-audit-log-2026-05-16.md)

**End of Part W.** Each ✅ shipped → tick the table + commit `docs(port-plan): W-N shipped — <description>`. New gap-hunt findings → append rows here, never rewrite history.

---

# L-contact-refactor tracker

> **AUDIT — 2026-05-18.** Per [`AGENTS.md`](../AGENTS.md) §7, all company info
> (phone · email · address · legal name · tax ID · slogan · LINE OA · social)
> **must be imported** from [`components/seo/site.ts`](../components/seo/site.ts) —
> never hardcoded. This section is the audit of residual hardcoded values found
> as string literals in `.ts`/`.tsx` files **outside** `site.ts`.
>
> **Status: NOT YET FIXED — audit only.** Fixing touches frontend files owned
> by ปอน + ภูม; the migration must be coordinated to avoid merge collisions.
> Each row below = `file:line` · the hardcoded value · the `site.ts` constant
> it should import. Tests + `docs/` are out of scope; `lib/bkk-zip.ts` (a
> Bangkok zip-code dataset) is **not** an address leak and is excluded.

## LC-1 — Phone numbers (highest count)

`site.ts` constants: `CONTACT.phoneDisplay` (`066-125-3007`) · `CONTACT.phoneCompanyDisplay` (`02-421-3325`) · `CONTACT.phoneCsDisplay` (`066-090-1217`); `tel:` hrefs should derive from `CONTACT.phone` / `.phoneCompany` / `.phoneCs` (E.164).

| # | File:line | Hardcoded value | Should use |
|---|---|---|---|
| LC-1a | `components/sections/contact-sales.tsx:27,37,48` | `066-125-3007` · `02-421-3325` · `066-090-1217` | `CONTACT.phoneDisplay` · `.phoneCompanyDisplay` · `.phoneCsDisplay` |
| LC-1b | `components/sections/import-export-banner.tsx:12-14,142,151` | same 3 numbers + `tel:0661253007` | same — `tel:` href from `CONTACT.phone` |
| LC-1c | `components/sections/clearance-banner.tsx:17-19,148,158` | same 3 numbers + `tel:0660901217` | same — `tel:` href from `CONTACT.phoneCs` |
| LC-1d | `components/sections/purchase-banner.tsx:22-24,106,116` | same 3 numbers + `tel:0661253007` | same — `tel:` href from `CONTACT.phone` |
| LC-1e | `components/ui/sales-carousel.tsx:19-21` | same 3 numbers | `CONTACT.phoneDisplay` · `.phoneCompanyDisplay` · `.phoneCsDisplay` |
| LC-1f | `lib/booking-data.ts:37-39` | same 3 numbers | same (file already imports `LINE_OA` — extend to `CONTACT`) |
| LC-1g | `components/sections/pricing-section.tsx:25` | `const HOTLINE = "066-125-3007"` | `CONTACT.phoneDisplay` |
| LC-1h | `components/knowledge/article-content.tsx:6` | `const HOTLINE = "066-125-3007"` | `CONTACT.phoneDisplay` |
| LC-1i | `components/sections/floating-tabs.tsx:13` | `const OFFICE_PHONE = "024213325"` | derive from `CONTACT.phoneCompany` |
| LC-1j | `app/[locale]/(public)/warehouses/thailand/page.tsx:147,151` | `tel:0661253007` + `066-125-3007` | `CONTACT.phone` / `.phoneDisplay` |
| LC-1k | `app/[locale]/(public)/about/page.tsx:209,213` | `tel:0661253007` + `066-125-3007` | `CONTACT.phone` / `.phoneDisplay` |
| LC-1l | `app/[locale]/(public)/customs-clearance-shipping-suvarnabhumi/page.tsx:374,505` | `066-125-3007` (×2) | `CONTACT.phoneDisplay` |
| LC-1m ⚠️ | `components/sections/clearance-promo.tsx:115,119` | `tel:0661310253` + `066-131-0253` | **STALE** — `066-131-0253` is **not** in `CONTACT`; reconcile (likely → `CONTACT.phoneDisplay`) before migrating |
| LC-1n ⚠️ | `components/sections/warehouse-detail.tsx:186,190` | `tel:0661310253` + `066-131-0253` | **STALE** — same as LC-1m |
| LC-1o ⚠️ | `components/sections/footer.tsx:174` | `066-131-0253` | **STALE** — footer should show a canonical `CONTACT.*` number; `066-131-0253` is unknown to `site.ts` |
| LC-1p ⚠️ | `app/[locale]/(public)/faq/page.tsx:115,220` | `066-131-0253` (TH + EN copy) | **STALE** — reconcile to a `CONTACT.*` number |

## LC-2 — Emails

`site.ts` constants: `CONTACT.email` / `.emailSales` (`sales@pacred.co`) · `.emailDocs` · `.emailAcc` etc.

| # | File:line | Hardcoded value | Should use |
|---|---|---|---|
| LC-2a | `components/sections/clearance-process.tsx:9` | `sales@pacred.co` (in step copy) | `CONTACT.emailSales` |
| LC-2b ⚠️ | `app/[locale]/(public)/faq/page.tsx:115,220` | `contact@pacred.co` (TH + EN copy) | **STALE** — `contact@pacred.co` is **not** in `CONTACT`; reconcile (likely → `CONTACT.email`) |
| LC-2c | `lib/notifications/index.ts:151` | `"Pacred <noreply@pacred.co>"` fallback `From:` | low priority — `noreply@` is an infra address, not in `CONTACT`; consider a `CONTACT.emailNoReply` constant or leave as-is |

> Note: `lib/logger.ts:145` (`redactEmail("admin@pacred.co")`) is a JSDoc usage
> example, not a live company value — **excluded**.

## LC-3 — Tax ID · LINE OA · Social URLs

| # | File:line | Hardcoded value | Should use |
|---|---|---|---|
| LC-3a | `components/sections/navbar.tsx:81,86,91,96` | the 4 social URLs (Facebook · YouTube · TikTok · Instagram) | `SOCIAL.facebook` · `.youtube` · `.tiktok` · `.instagram` |
| LC-3b | `components/sections/footer.tsx:31-34` | `const YOUTUBE_URL/FACEBOOK_URL/TIKTOK_URL/INSTAGRAM_URL` | `SOCIAL.*` |
| LC-3c | `components/sections/customs-video-clips.tsx:13` | `const YOUTUBE_CHANNEL = "https://www.youtube.com/@PacredShipping"` | `SOCIAL.youtube` |
| LC-3d | `components/sections/blog.tsx:20` | `const YOUTUBE_CHANNEL = "https://www.youtube.com/@PacredShipping"` | `SOCIAL.youtube` |
| LC-3e | `app/[locale]/(public)/about/page.tsx:194-195` | office address (`28/40 หมู่บ้าน สิริ ...`) — note typo `เอเวนิว` vs `อเวนิว` in `ADDRESSES` | `ADDRESSES.office.full` (also fixes the typo divergence) |
| LC-3f | `app/[locale]/(public)/warehouses/thailand/page.tsx:35` | `const ADDRESS_TH = "48/3 หมู่ 12 ..."` | `ADDRESSES.warehouseTh.full` |

> **Tax ID** (`0105564077716` = `TAX_ID`): only one hit —
> `app/[locale]/(admin)/admin/freight/quotes/new/new-quote-form.tsx:90` — and it
> is an input **placeholder** (illustrative hint, not a rendered company value).
> Low priority; leave or swap to `{TAX_ID}` for consistency. Likewise the form
> placeholders in `admin/settings/contacts/contacts-manager.tsx:112` and
> `admin/hr/employees/[id]/edit-form.tsx:112` are illustrative placeholders, not
> company-data leaks — lowest priority.

## Summary

- **~24 sites** carry hardcoded company values across `.ts`/`.tsx` (excluding
  `docs/`, tests, `site.ts`, and the `lib/bkk-zip.ts` zip dataset).
- **Genuine refactor targets: ~21** — the 16 phone-number files (LC-1a..1p),
  2 email copy sites (LC-2a..2b), and ~6 social/address files (LC-3a..3f).
- **4 rows flagged ⚠️ STALE** — `066-131-0253` (LC-1m/1n/1o/1p) and
  `contact@pacred.co` (LC-2b) are values **absent from `site.ts`**; the team
  must first decide the canonical value, then migrate.
- **3 lowest-priority** — form placeholders (tax-ID + 2 contact-manager hints)
  are illustrative, not rendered company data.
- **Owner:** split between ปอน (frontend `components/` + `app/(public)`) and
  ภูม (`lib/`, `actions/`). **Do not start until the V-G5.1 `org_contacts`
  customer-side wiring is scoped** — that work also touches footer/JSON-LD and
  may supersede some of these sites.

**End of L-contact-refactor tracker.** When a row is migrated → tick it + note
the commit; when all rows clear, delete this section.
