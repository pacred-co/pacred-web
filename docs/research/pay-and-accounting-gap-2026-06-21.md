# Payment-flow + Accounting-module gap audit — 2026-06-21 (owner brief)

> Source-grounded audit (11-agent Ultracode workflow `pay-and-accounting-gap-audit`) of the
> Pacred payment loop + existing accounting surfaces against the owner's 2026-06-21 brief
> (the 7-menu accounting program + the "every payment = select→QR+amount→slip→2-round บัญชี
> verify→ตัดชำระ, NO wallet" model). Every claim was checked in the actual files. This doc is
> the canonical build plan for the next sessions — the accounting module is multi-session and
> several pieces are owner-decision-gated (D1–D6 below). **NEXT FREE migration = 0198.**

## Owner payment model (verbatim intent)
Customer SELECTS what to pay → clicks pay → sees AMOUNT + a QR → attaches SLIP → admin บัญชี
reviews the slip ROUND 1 then ROUND 2 → confirms → ตัดชำระ DIRECTLY. **NO money enters the
wallet.** เติมเงิน (top-up) removed. Yuan (โอนหยวน) already direct-cut.

## The "สองชั้น" contradiction — resolved
Shipped "สองชั้น" = dup-gate (ชั้น 1) + approve (ชั้น 2) — a fraud guard + a single settle.
The owner model wants a human **ROUND-1 review → ROUND-2 review → settle** state machine. That
does NOT exist: the status enum is `1=pending / 2=approved-settled / 3=rejected` — there is no
value to represent "round-1-done, awaiting round-2." This is the biggest accounting gap (A4).

---

## (A) PAYMENT-FLOW FIXES — by severity

- **A1 — import-bill settle can drive the wallet NEGATIVE (latent).** `submitForwarderPayment`
  inserts `tb_wallet_hs type='4'` without crediting `tb_wallet`; `adminApproveWalletHs`
  (`actions/admin/wallet-trans.ts:263`) + bulk twin (`tb-bulk.ts:186`) debit `-amt` on approve.
  **VERIFIED DORMANT 2026-06-21:** prod has only **1** negative wallet in 8,966 (PR130 −646, a
  separate one-off) and **0** type='4' rows ever approved. Real-in-code, unexercised. Fix =
  force `delta=0` for `typeservice='2'` direct-cut on approve. Fold into the wallet-removal (D1).
- **A2 — `payServiceOrderFromWallet` self-settles with NO slip/admin review** (the #1 wallet
  leak). Reachable from 5 surfaces (detail btn, modal full-wallet btn, list row, list bulk-bar,
  /add bulk-bar). `actions/service-order.ts:921` debits `tb_wallet` + flips `hstatus 2→3` on the
  customer's click. Fix = route the 5 surfaces to the slip flow. **D1-gated** (legacy balances).
- **A3 — slip-pay modal partial-wallet funding.** `shop-order-pay-modal.tsx:178-200` `walletApplied`
  → `submitShopOrderSlipPayment` debits `tb_wallet` (`service-order.ts:1380`). Drop `walletApplied`.
  Bundle with A2 (same modal). **D1-gated.**
- **A4 — NO 2-round accounting verify anywhere** (owner's core design). Every settle is a single
  `1→2` flip; `adminApproveWalletDeposit` (`wallet-hs.ts:801`) sets `adminid` + `adminidupdate`
  to the same admin at once. Fix = migration (status='4' "ตรวจรอบ1 รออนุมัติรอบ2" + `reviewed_by`/
  `reviewed_at`) + `adminReviewRound1*` action + require status='4' before settle + 2-button UI.
  **D2-gated** (same admin both rounds, or two different admins = segregation of duties).
- **A5 — yuan direct-cut slip bypasses the dup-gate.** `findDuplicateSlips` is wired only to
  `tb_wallet_hs`; customer yuan slips land in `tb_payment.imagesslip` (`createYuanPayment`,
  `payment.ts:358`), so `adminUpdateYuanPayment` + `adminBulkApproveYuanPaymentsTb` approve with
  NO dup detection. Fix = a `tb_payment` variant of `findDuplicateSlips` (userid + paydate-day +
  paythb + paystatus∈{1,2}) wired into both yuan approve paths. **SAFE / decision-free — do next.**
- **A6 — static QR, not amount-bound.** Forwarder + shop modal show a static K-Shop QR + bank no.;
  yuan shows NO QR (explicit 2026-06-08 owner note). Owner model says "AMOUNT + QR." **D3-gated.**
- **A7 — orphaned wallet rails:** `createYuanPaymentFromWallet` (`payment-tb.ts:145`, 0 callers →
  delete); `customerPayCreditFromWallet` (`credit.ts:186`), `recordFreightPayment method='wallet'`,
  `adminCreateYuanPaymentManual` → **D4-gated** (keep legacy/credit tools vs retire with wallet).
- **A8 — best-effort status flip on type='8' approve** (`wallet-hs.ts:1011`, logged-only) →
  slip can approve while order stays unpaid. Make transactional or add to the reconcile cron.

## (B) ACCOUNTING MODULE — reuse map + gaps

### ✅ ALREADY EXISTS — extend, never rebuild (the §0e dead-write trap)
| Capability | Canonical surface |
|---|---|
| AR list (ฝากนำเข้า) | `billing-run/` + `actions/admin/billing-run.ts` (tb_forwarder_invoice) |
| Receipt-of-record | `accounting/receipts/` + `tb_receipt` |
| AR aging | `actions/admin/ar-aging.ts` |
| **VAT-by-mode math** | `lib/tax/tax-doc-mode.ts:193` `computeTaxForMode`/`computeMarginVat` — matches the brief, **unwired** |
| WHT 1% | `lib/billing/wht.ts` `computeBillWht` → `lib/tax/wht.ts` |
| ใบกำกับขาย issuance | `lib/admin/{forwarder,shop,yuan}-tax-invoice.ts`; hub `/accounting/etax` |
| Running-numbers | `lib/admin/mint-receipt-doc-no.ts` + freight RPCs + `next_customs_declaration_no` |
| ใบขน | `actions/admin/customs-declarations.ts` + PDF `api/customs-declaration/[id]` |
| Shop AP create | `actions/admin/shop-disbursement.ts` (no pay-out completion) |
| Container AP (full) | `cnt-payment.ts` + `cnt-hs.ts` |
| Pay-with-slip reference | `sales-payouts-tb.ts:358` `adminMarkSalesPayoutPaidTb` (atomic + slip + bank) |
| Reports revenue/profit | `/admin/reports`, `forwarder/shops/yuan-profit`, `profit-analytics`, `reports-cockpit` |
| Inbound 50-ทวิ | `/admin/wht` + `/admin/accounting/wht-certs` |
| RD86 e-Tax XML | `lib/etax/build-xml.ts` + PEAK CSV |

**Dead twins — never write:** `forwarders`, `wallet_transactions`, `service_orders`, `freight_invoices` (0-row). `/admin/accounting/reconcile` reads the dead twins (self-bannered). `actions/admin/wht.ts` queries rebuilt twins — verify before trusting.

### 🔧 GAPS → build phases (smallest first)
- **B1 — wire the VAT engine into AR** (small, high-value): add ค่าสินค้า/ค่าบริการ/VAT7%/ยอดรวม to
  the billing-run create form, computed via `computeTaxForMode`. Migration: extend
  `tb_forwarder_invoice` (service_type/goods_amount/service_amount/vat7_amount) — don't fork a new
  table. **D5-gated** (ใบขน VAT base: service-only vs margin).
- **B2 — shop AP pay-out completion** (small, unblocks): add `markShopDisbursementPaid` by copying
  `adminMarkSalesPayoutPaidTb` (atomic '1'→'2' + slip). No migration. **SAFE / decision-free.**
- **B3 — per-order document registry** (med): read-only "เอกสารของออเดอร์" panel joining
  `tb_receipt` + `tb_*_tax_invoice` + `customs_declarations` + slips by order key. No new stores.
- **B4 — repoint `/admin/accounting/reconcile`** off dead twins → `tb_forwarder`/`tb_wallet_hs`.
- **B5 — generic supplier AP + expense taxonomy** (large): re-point the `disbursements.ts` stub to
  a live AP table (legacy `tb_bill`/`tb_bill_item`); capture supplier-WHT (feeds B7).
- **B6 — bank-statement reconciliation** (large, greenfield): `bank_transactions` + import + matcher.
- **B7 — tax returns ภพ.30 + ภงด.53 + outbound 50-ทวิ** (large): build on `computeTaxForMode`/
  `computeBillWht`; needs B5's supplier-WHT first.

## 🚩 OWNER DECISIONS (do not guess)
- **D1 — wallet retirement scope.** Hard-remove all wallet pay paths now (A1/A2/A3), or keep wallet
  read-only for customers with existing legacy/cashback balances during transition?
- **D2 — 2-round verify shape (A4).** Round-1 a *different human* than round-2 (segregation of
  duties), or the same admin doing two deliberate passes? Determines the `reviewed_by` constraint.
- **D3 — amount-bound QR (A6).** EMVCo PromptPay encoding the exact amount everywhere, or keep
  static QR + typed amount + slip? (A 2026-06-08 note deliberately chose static.)
- **D4 — legacy admin/credit wallet tools (A7).** Keep `customerPayCreditFromWallet`,
  `recordFreightPayment method='wallet'`, `adminCreateYuanPaymentManual`, or retire with the wallet?
- **D5 — ใบขน VAT base.** Brief says ใบขน = VAT7% **from กำไร (margin)**; current code (`tax-doc-mode.ts:213`)
  flags service-only-vs-service+transport+rental unresolved. Accountant sign-off before B1/B7.
- **D6 — freight customer self-pay.** No customer freight pay surface today (admin-recorded only).
  If "EVERY service" needs the slip flow, freight needs B-phase work — confirm scope.

## Recommended sequencing
Money-correctness first: **A5 (safe, do now)** → A1+A2+A3 (after D1) → A4 (after D2 + mig). Then
accounting: **B2 (safe)** → B1 (after D5) → B3 → B4 → B5 → B7 → B6. DEV-SYNC every migration;
dry-run any data backfill; gate with the real exit code (never `| tail`).
