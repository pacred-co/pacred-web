# 🧾 Juristic (นิติบุคคล) billing + tax flow — completeness audit

**Date:** 2026-05-30 · **By:** เดฟ (3 parallel audit agents · legacy rules + Pacred WHT/tax-invoice + Pacred billing/ใบขน/ใบส่งสินค้า) · cross-validated
**Owner question:** "ระบบบัญชีนิติบุคคล หักเรา 1% ... logic flow ตอนวางบิล เช็คครบยัง · เอาใบขน · ออก VAT/ไม่เอา VAT · ออกใบกำกับภาษี · ออกใบส่งสินค้า"

---

## 🔴 Headline — there are TWO disconnected tax worlds, and they never meet

| | **World B — LIVE money lane** (real data) | **World A — rebuilt tax stack** (built, ~empty in prod) |
|---|---|---|
| Tables | `tb_forwarder` → `tb_receipt` / `tb_receipt_item` · `tb_corporate` | `forwarders`/`profiles`/`corporate` → `tax_invoices` · `withholding_tax_entries` · `customs_declarations` |
| Who's in it | **8,898 real customers** | almost nobody (rebuilt tables not backfilled) |
| Billing trigger | `forwarder-check` `callPriceUser` (fstatus 4→5) + auto-receipt on payment | customer "request tax invoice" on a rebuilt-schema receipt page |
| 1% WHT | ✅ inline `pricePay × 0.99` (juristic AND ≥฿1000) | ✅ full 1–5% model + 50-ทวิ cert gate |
| VAT 7% | ❌ none | ✅ computed (inclusive) |
| ใบกำกับภาษี | ❌ receipt stamped "(ไม่ใช่ใบกำกับภาษี)" | ✅ RD Code-86 compliant |
| ใบขนสินค้า | ❌ | ✅ but parented on **freight_shipments** (different product) |

**The crux:** `actions/admin/forwarder-check.ts` (the real billing button) has **zero** references to `tax_invoices` / `withholding_tax_entries` / `issueTaxInvoice`. And `actions/admin/wht.ts` / `actions/admin/tax-invoices.tsx` resolve their parent via `forwarders.f_no` / `service_orders.h_no` — **never `tb_forwarder`**. The full RD-compliant tax machinery exists but is wired to the empty rebuilt schema, so real `tb_forwarder` juristic customers can't reach it.

---

## ✅/❌ Per the owner's checklist — เช็คครบยัง

| # | Item | Status on the LIVE path | Notes |
|---|---|---|---|
| 1 | **1% WHT (หัก ณ ที่จ่าย)** | ✅ **ครบ + ทำงานจริง** | juristic (`tb_corporate.corporatenumber` exists) **AND** amount ≥ ฿1000 → `rAmount = total × 0.99`. Base = service total (no VAT). Inline "หัก ณ ที่จ่าย 1%" line on ใบเสร็จ. 3 code sites agree (`auto-issue-receipt.ts:264`, `forwarder-invoice.ts:303`, `outstanding.ts:60`). Faithful to legacy `grenrateReceiptF`. |
| 2 | **วางบิล (billing)** | ✅ **ครบ** | 2-click: bulk-bill (`callPriceUser`, fstatus 4→5 + notify) → customer pays → auto-`tb_receipt` (`autoIssueReceiptOnPaymentLand`). Doc-no `{FRC\|FRG}{yyMM}-{NNNNN}`. |
| 3 | **VAT (เอา/ไม่เอา VAT)** | ❌ **ไม่มีบน live path** | No with/without-VAT toggle anywhere in the live receipt chain. VAT 7% exists ONLY in World A (rebuilt tax-invoice, unreachable). |
| 4 | **ใบกำกับภาษี (tax invoice)** | ⚠️ **สร้างแล้ว แต่ไม่เชื่อม** | RD-compliant system is COMPLETE (serial, seller tax-id, VAT row, baht spell-out, credit-note, cancel) — but reads empty rebuilt tables. Real juristic customers get a receipt stamped "(ไม่ใช่ใบกำกับภาษี)", not a tax invoice. |
| 5 | **ใบขนสินค้า (customs declaration)** | ⚠️ **สร้างแล้ว แต่คนละ product** | `customs_declarations` real + full state machine + duty/VAT compute — but parented on `freight_shipments` (FCL/LCL freight), NOT cargo `tb_forwarder`. No with-VAT/without-VAT cargo variant. |
| 6 | **ใบส่งสินค้า (delivery note)** | ✅ **ครบ** | combine-bill/print A4 HTML — consignee + carrier + items + 3 signatures. No prices/tax (warehouse doc, by design). |

**What works end-to-end on real data:** bulk-bill → 1%-WHT receipt (ใบเสร็จรับเงิน) → optional delivery note.
**What does NOT reach real customers:** VAT, ใบกำกับภาษี, customs declaration.

---

## 🧭 Critical context — legacy NEVER had VAT / ใบขน / ใบกำกับภาษี either

Legacy PCS cargo code implemented ONLY: **1% WHT + ใบเสร็จรับเงิน + ใบส่งสินค้า**. VAT, ใบขน, and ใบกำกับภาษี were **dead scaffolding** (`acc-system-cargo.php` = 4 lines, dispatches nothing) — staff did those **manually, off-system**. So:
- Items 1, 2, 6 = faithful-port ✅ DONE.
- Items 3, 4, 5 (VAT / tax invoice / customs) = **genuinely NEW (Phase C)**, not a port gap. The owner's verbal list describes the *manual* process they want the new system to *automate*.

---

## 📌 Decisions for the owner (these gate the fix)

1. **Does the LIVE cargo billing path need to issue real ใบกำกับภาษี (with VAT) + track WHT certs?** Legacy did this manually. If YES → bridge the live `tb_receipt`/`tb_forwarder` flow to the existing tax-invoice + WHT-cert machinery (or rebuild it on `tb_*`). This is the single highest-leverage fix.
2. **VAT story for the live path:** with-VAT vs without-VAT — when, on what base, who chooses? (currently none).
3. **ใบขนสินค้า for cargo:** is it in scope for cargo (ฝากนำเข้า) at all, or only freight (FCL/LCL)? Currently freight-only.

---

## ⚠️ Secondary issues found (fix regardless of the above)

- **WHT base default (World A)** = gross **including** VAT (`wht-panel.tsx:95`); operator must manually lower it. Per RD, WHT base = pre-VAT service amount. If World A is ever used live, default the base to the pre-VAT figure.
- **Juristic detection is inconsistent across code:** `tb_corporate.corporatenumber` (auto-receipt) vs `tb_forwarder.fusercompany='1'` (outstanding) vs `profiles.account_type='juristic'` (World A) vs `tb_users.userCompany='1'` (invoice page). If these disagree for a customer → wrong WHT. Unify on one source of truth.
- **Two receipt UIs collide** on `/service-import/[fNo]/receipt` (World A · `getForwarderByNo` → empty `forwarders` → notFound) vs `/service-import/[fNo]/invoice` (World B · live `tb_forwarder`). The tax-invoice-request panel lives on the dead `/receipt` page → real customers never see it.

---

## 🔧 Recommended fix (if owner says "automate it")

**Bridge World A → live `tb_*`** (highest leverage):
1. Make `issueTaxInvoice` + `createWhtEntry` accept a `tb_forwarder`/`tb_receipt` source (not just `forwarders.f_no`).
2. On the live billing/payment flow, optionally trigger a tax invoice (with the VAT decision) + a WHT entry — driven by a per-customer/per-bill "ออก VAT / ไม่ออก VAT" choice.
3. Unify juristic detection into one helper.
4. Point the customer tax-invoice-request panel at the live `/invoice` page (not the empty `/receipt`).
Effort: medium-large; touches billing + tax-invoice + WHT actions. Needs the owner's VAT-policy answers first.

> Agent transcripts (full evidence + file:line citations) captured in this session 2026-05-30.
