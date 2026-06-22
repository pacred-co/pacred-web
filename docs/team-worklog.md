# 🛠 Team worklog — who's building what RIGHT NOW (collision registry)

> **Purpose (owner 2026-06-22):** *"ทำงานกันเป็นทีม … อยากให้รู้ว่าเรื่องนี้ชนกันนะ … แบบที่ชนกันตรงๆ จริงจังๆ … จะได้ไม่เสียเวลา … ต้องรู้ว่าใครทำเรื่องไหน … ทุกคนใช้โค้ดเดียวกัน ใช้แผนเดียวกัน."*
>
> This is the **single place** every dev declares what they're touching, so we catch a REAL collision (same file / same DB table-change / same migration number / same feature-route) before two people redo or clobber each other's work. A shared *area* (both in "accounting") is **not** a collision — only a direct overlap is. Update your row when you START and when you FINISH. Read it before you start anything.
>
> **The collision skill that drives this:** [`.claude/skills/team-collision-check/SKILL.md`](../.claude/skills/team-collision-check/SKILL.md).

## How to use (30 seconds, every time)
1. **Before starting:** read the ACTIVE table below + `git log origin/dave-pacred..origin/<teammate-branch> --stat` for what they touched. If your feature/files/table/migration overlaps a teammate's ACTIVE row → coordinate FIRST (see the skill).
2. **Claim it:** add/update your ACTIVE row — feature, the key files/tables, your migration number (reserve from the [migration ledger](runbook/migration-ledger.md)), branch.
3. **When done:** move your row to DONE (or delete it) so the registry shows only live work.

## Shared anchors (the "แผนเดียวกัน / โค้ดเดียวกัน")
- **Trunk:** everyone bases on `dave-pacred` (= the integration branch); เดฟ promotes to `main` on the owner's go.
- **Migration numbers:** reserve the NEXT FREE here + in [`docs/runbook/migration-ledger.md`](runbook/migration-ledger.md) so two devs never grab the same number. **NEXT FREE migration = 0201.** (0199 = admin AD#### code scheme · 0200 = customer_quotations [was ภูม's 0199, renamed on merge] — both applied prod+dev 2026-06-22.)
- **Plans:** the accounting build = [`docs/research/pay-and-accounting-gap-2026-06-21.md`](research/pay-and-accounting-gap-2026-06-21.md) (B1-B7). Port plan = [`docs/PORT_PLAN.md`](PORT_PLAN.md). UX standard = [`docs/learnings/self-explaining-row-design.md`](learnings/self-explaining-row-design.md) + AGENTS §0g/§0h.

---

## 🟢 ACTIVE — being worked on now
| Dev | Feature | Key files / tables / migration# | Branch | Started | Notes |
|---|---|---|---|---|---|
| _(none claimed — add your row before starting)_ | | | | | |

## ✅ RECENTLY DONE (keep ~2 weeks, then prune)
| Dev | Feature | Key files / migration# | Merged to | When |
|---|---|---|---|---|
| เดฟ | **Integrated ภูม + ปอน** — Poom-pacred 8c (quotation /q share-link + PEAK shop-doc toggle + billing-run show-already-billed + ภูม's price-save 4→5) + InwPond007 (quote receipt-style + รหัสลูกค้า). Resolved 0199 migration collision (→0200) + auto-advance dup + quote-tab conflict (kept both). gate typecheck/lint/build/test 0 | many · mig 0200 prod+dev | main | 2026-06-22 |
| เดฟ | **Forwarder price→bill flow** — บันทึกทุกแถว auto-advances fstatus 4→5 (รอชำระเงิน · `adminAdvanceForwarderToWaitPayment`, 4→5-only idempotent) + page-level "🧾 สร้างใบวางบิล" button at fstatus 5/6 (`createForwarderOrderBill` derives the tracking group → reuses `createBillingRunInvoice`) | `actions/admin/forwarder-step.ts` · `billing-run.ts` · `create-order-bill-button.tsx` · per-tracking editor · no mig | main | 2026-06-22 |
| เดฟ | **Task F — zone-aware in-Thailand delivery selector** — เหมาๆ in-zone ฿100/PRF · ต่างจังหวัด/นอกเขต Flash-by-weight + J&T/ไปรษณีย์ ALL **บังคับ COD** · รับเอง ฿0. Composes existing flash-price/bkk-zip/thai-shipby-rules. | `lib/forwarder/domestic-shipping.ts`(+test) · `actions/admin/forwarder-domestic-ship.ts` · `domestic-shipping-selector.tsx` · forwarders/[fNo]/page.tsx · no mig | main | 2026-06-22 |
| เดฟ | **Forwarder billing preview fix** — ราคานำเข้าจีน-ไทย preview now sums per-line (= the real bill 4324.05, was whole-shipment 4083.96) | `per-tracking-editor-client.tsx` · no mig | main | 2026-06-22 |
| เดฟ | **Confirm-dialog fix** — `await confirm()` was INSIDE `startTransition` → dialog never opened → buttons silently dead (forwarder step ถอย/ขยับ + 11 more handlers: cnt-cost · freight quote/lead · withdrawal · mark-ordered · lead-kanban · tag-chips…). Moved confirm BEFORE the transition. Live-verified dialog opens. | `forwarder-step-revert.tsx` + 9 files · no mig | main · verified live | 2026-06-22 |
| เดฟ | **Admin code SEPARATE from customer PR** — staff get own AD#### scheme (trigger gates on employee_code). Re-coded 22 existing staff PR→AD001–AD022 + cascaded fdadminid/fdadmincreator/tb_users. Customer PR stays clean; freed slots reclaimed. | `supabase/migrations/0199_admin_code_scheme_ad.sql` · `scripts/recode-staff-to-ad-2026-06-22.mjs` · **mig 0199 prod+dev** | main · verified (0 staff on PR · driver ownership intact · new staff→AD023) | 2026-06-22 |
| เดฟ | **Sales-rep data CONNECT** — staff↔sales-roster across the 3 stores (profiles/admins/tb_admin). `adminCreateNew`+`adminChangeRole`+`adminSetSalesRepFlag` now mirror every staff into `tb_admin` (no hollow accounts) + auto-flag sales-role. Data-fix: pupu→rep + 4 hollow staff backfilled (0 hollow left). | `lib/admin/ensure-legacy-admin.ts` (new) · `actions/admin/admins.ts` · `tb_admin` (data) · no mig | main · verified pupu live (dropdown + public card) | 2026-06-22 |
| ภูม | **P0 sweep** — platform-wide `tb_users` lowercase→camelCase (42703 · 16+ surfaces: reports/wallet/cron/sales-payout/notifications/customers) | reports/* · wallet · cron/refresh-active-customers · sales-payouts-tb · etc. | main · verified (user-all 158 rows) | 2026-06-22 |
| เดฟ | Team skills: keep-context · team-collision-check + worklog | `.claude/skills/*` · this file | main | 2026-06-22 |
| เดฟ | Accounting **B3** — per-order doc registry (read-only · `lib/admin/order-documents.ts` + panel on shop detail) | `tb_shop_tax_invoice`/`tb_receipt`/`customs_declarations` · no mig | main · verified empty-state | 2026-06-22 |
| เดฟ | Accounting B2 — shop AP pay-out (`markShopDisbursementPaid`) | `actions/admin/shop-disbursement.ts` · `tb_shop_pay_h` · no mig | main | 2026-06-22 |
| เดฟ | UX: self-explaining rows + 11px floor + `<PageHeader>` (~50 pages) | `components/admin/page-header.tsx` + many admin pages | main | 2026-06-22 |
| ภูม | P0: `/admin/customers` blank fix — `tb_users` img col = `userPicture` (not userimage) | `customers/page.tsx` · service-order detail | main | 2026-06-22 |
| เดฟ | Payment-loop closure (D1 wallet-removal · A4 2-round · slip-queue 1-row · PDF slips) | `actions/admin/wallet-hs.ts` · `tb-bulk.ts` · mig 0197/0198 | main | 2026-06-22 |

## 🟡 NEXT / QUEUED (reserved so no one else starts it)
| Dev | Feature | Will touch (files / tables / migration#) | Note |
|---|---|---|---|
| เดฟ | Accounting **B1** — wire VAT into AR billing-run | `actions/admin/billing-run.ts` · `tb_forwarder_invoice` (extend) · **mig 0199** | money+migration · D5-gated (done) · do FRESH-CONTEXT (money path) |
| เดฟ | Accounting **B3+** — wire `getForwarderDocuments` into the forwarder/[fNo] detail | `forwarders/[fNo]/page.tsx` (faithful customer-port · light add) | helper ready · small follow-up |
| 🔴 **COLLISION** | Accounting **B4** — reconcile repoint off dead twins | `accounting/reconcile/page.tsx` | **IN ภูม's ACTIVE dead-twin/column sweep lane** — coordinate with ภูม BEFORE touching (don't both rewrite the same money-reconcile queries · 42703 risk). |
| _open_ | B5 supplier AP · B6 bank reconcile · B7 ภพ.30/ภงด.53 | per the gap doc | large · multi-session |
