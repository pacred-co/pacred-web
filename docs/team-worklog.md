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
- **Migration numbers:** reserve the NEXT FREE here + in [`docs/runbook/migration-ledger.md`](runbook/migration-ledger.md) so two devs never grab the same number. **NEXT FREE migration = 0210.** (0199 admin AD#### · 0200 customer_quotations · 0201-0203 ปอน imported_leads CRM · 0204-0205 CMS articles · 0206 ปอน cms_articles_tags · 0207 เดฟ forwarder advance_bill_confirmed [B advance-billing] · 0208 ภูม cart_cap 151→10000 · 0209 ภูม invoice+receipt mao_fee_thb [เหมาๆ แยกบรรทัด · บิล=ใบเสร็จตรงกัน] — all applied prod+dev 2026-06-23/24.)
- **Plans:** the accounting build = [`docs/research/pay-and-accounting-gap-2026-06-21.md`](research/pay-and-accounting-gap-2026-06-21.md) (B1-B7). Port plan = [`docs/PORT_PLAN.md`](PORT_PLAN.md). UX standard = [`docs/learnings/self-explaining-row-design.md`](learnings/self-explaining-row-design.md) + AGENTS §0g/§0h.

---

## 🟢 ACTIVE — being worked on now
| Dev | Feature | Key files / tables / migration# | Branch | Started | Notes |
|---|---|---|---|---|---|
| **ภูม** | **Admin dashboard tab-strip → legacy PCS fidelity** — ทำ 14 แท็บ (`/admin` CEO dashboard) ให้เหมือน legacy เป๊ะ: ชื่อ/ลำดับ/count + **คอลัมน์ตารางเฉพาะต่อแท็บ** (ตอนนี้ใช้ 4-col generic ทุกแท็บ · legacy = 6 layouts: users 6 / wallet 4-7 / payShop 6 / shop 8 / forwarder 9 / payment 9) | `app/[locale]/(admin)/admin/page.tsx` (~1600 บรรทัด · money-dashboard) · no mig | Poom-pacred | 2026-07-04 | owner-directed · legacy src `pcs-admin/include/pages/home/Cargo/CEO/*` · ⚠️ shared high-traffic file — ping ก่อนแตะ |

## ✅ RECENTLY DONE (keep ~2 weeks, then prune)
| Dev | Feature | Key files / migration# | Merged to | When |
|---|---|---|---|---|
| เดฟ | **Integrate round-3 (2026-06-23)** — ภูม Poom 6c (drivers `รับเองหน้าโกดัง` self-pickup tab + batch auto-complete-on-full-delivery + 4th tab · iTAM parser real Shipment-Report layout fix · ภูม also hardened my `ensure-legacy-admin` to clear adminPicture = next/image crash fix) + ปอน InwPond007 3c (CRM leads round-2: stats/editable cells/tabs/pagination/distribute · admin profile-pic `usable-image-src` guard · header-nav). **Applied ปอน mig 0201-0203 (imported_leads + note + pr_code) prod+dev.** 0 conflicts · gate typecheck/lint/build/test 0 | drivers/* · taem-parser · imported_leads · mig 0201-0203 | main | 2026-06-23 |
| เดฟ | **Integrate round-2 (close)** — ภูม Poom-pacred 6c (mark-paid advances forwarder 5→6 + syncs ใบเสร็จ '3'→'1' + links 3 docs + clickable invoice link · ภูม also enhanced my `CreateOrderBillButton`) + ปอน InwPond007 5c (admin/leads รับเอง/CS/SLA/กดโทร · customer profile cover+avatar · create-form CS+magic-login `/k/[token]` · quote share-link). 0 conflicts · 0 new migrations · gate typecheck/lint/build 0 | billing-run.ts · leads · profile · customer-magic-link · no mig | main | 2026-06-22 |
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
> **OWNER WORK-SPLIT 2026-06-22:** "บัญชี + โกดัง ให้ภูมิทำ" → **accounting (Phase B · 7 menus · task #43) + warehouse (โกดัง) are ภูม's lane.** เดฟ does NOT start them (hand off cleanly · no collision). NEXT FREE migration = **0201**.
>
| Dev | Feature | Will touch (files / tables / migration#) | Note |
|---|---|---|---|
| **ภูม** | **Accounting Phase B (ALL)** — B1 VAT→AR billing-run (`computeTaxForMode` → billing-run · tb_forwarder_invoice extend · **mig 0201**) · B3+ wire `getForwarderDocuments` into forwarder/[fNo] · B4 reconcile repoint off dead twins · B5 supplier AP · B6 bank reconcile · B7 ภพ.30/ภงด.53 | `actions/admin/billing-run.ts` · `accounting/*` · `lib/admin/order-documents.ts` (helper ready) · gap doc `docs/research/pay-and-accounting-gap-2026-06-21.md` | owner-assigned · money+migration · the helpers B2/B3 already shipped (reuse) |
| **ภูม** | **Warehouse (โกดัง)** — `/admin/warehouse/*` · intake/measure/sack/ship flows | `admin/warehouse/*` · `tb_*` warehouse tables | owner-assigned |
| _open_ | ปอน's quotation receipt palette → fold into `components/quote/quote-paper.tsx` (cosmetic) | `quote-paper.tsx` | low-pri cosmetic follow-up from the merge |
