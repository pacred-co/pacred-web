# ADR-0028 — ฝากสั่งซื้อ pays by QR + slip (not forced wallet top-up); wallet becomes an optional discount

**Status:** **Phase 1 + Phase 2 SHIPPED + money-loop VERIFIED** (2026-06-06 · เดฟ).
Phase 1 = pure QR+slip (zero wallet touch). Phase 2 = the optional wallet discount
"หักจาก wallet เท่าไหร่ก็ใส่" — **DEBIT-AT-SUBMIT + REFUND-ON-REJECT** (not the held-on-
approve sketch below — debit-at-submit reserves the balance so it can't drop before
approval; the reject path re-credits the `[WALLET:x]` tag). Verified on TEST order
P22309/PR038 (฿49.21, wallet 50.8): (A) หัก wallet 20 → submit debits 50.8→30.8, slip
row amount=29.21 [WALLET:20] → approve → order PAID + wallet UNCHANGED at 30.8
(paid 20+29.21=bill ✓); (B) หัก wallet 15 → submit 50.8→35.8 → REJECT → wallet
REFUNDED to 50.8, order stays unpaid. Restored clean. `pnpm verify` + `build` EXIT 0.
**Owner directive (verbatim):** *"ยกเลิกระบบเติมเงินเข้ากระเป๋า … flow จะเปลี่ยนแค่ตอนชำระเงินของบริการฝากสั่งซื้อ ตอนจะกดชำระเงิน มันดันต้องเติมกระเป๋า wallet อย่างเดียว เราจะเอาระบบนั้นออก แล้วเอา QR มาให้ลูกค้าสแกนจ่าย แล้วแนบสลิปต่อได้เลยใน flow เดียว ให้อิงแบบตอนจะกดชำระของบริการฝากนำเข้า … กระเป๋าตังให้เอาไว้เป็น cashback … ลูกค้าอยากเอายอดในกระเป๋าตังใช้เป็นส่วนลด … เลือกได้ว่าจะหักจาก wallet เท่าไหร่ก็ใส่ไป อย่าให้บัคเรื่องเงินๆทองๆ ของานละเอียด"*

> ⚠️ **MONEY-CRITICAL. Do NOT ship to `main` (Vercel auto-deploys live) until the FULL loop is browser-tested on a TEST order** (customer submit slip → admin approve → order paid + wallet correct + receipt). The owner explicitly demanded "ของานละเอียด อย่าให้บัคเรื่องเงิน".

## Goal

1. **Shop-order (`/service-order/[hNo]`) payment** stops forcing wallet top-up. Replace `PayFromWalletButton` (which bounces a short customer to `/wallet/deposit`) with a **PromptPay QR + inline slip-upload** modal — EXACTLY like the proven forwarder (`/service-import`) flow.
2. **Wallet/cashback becomes OPTIONAL** at checkout: the customer may choose to apply some of their wallet/cashback balance as a partial discount ("หักจาก wallet เท่าไหร่ก็ใส่"), then pay the remainder by QR+slip.
3. **Hide** the standalone "เติมเงิน" deposit entry-points ("มันสื่อสีเทาเกินไป ซุกๆไว้") — but ONLY after #1 ships (else a short customer cannot pay at all).

## The model to mirror — forwarder QR+slip (PROVEN, in prod)

`forwarder-pay-modal.tsx` → `getForwarderPaymentQr` (→ `lib/promptpay.ts buildPromptPayQrDataUrl`) → `uploadForwarderSlip` (→ `slips` bucket, `{uid}/forwarder_payment/…`) → `submitForwarderPayment` inserts `tb_wallet_hs` **status='1' (PENDING)** with `imagesslip=slipPath`, **does NOT touch `tb_wallet`**, **does NOT flip order status**. Admin later verifies the slip via `adminApproveWalletHs`/`adminBulkApproveWalletHs` → flips `status '1'→'2'`, flips the order status, issues the receipt, settles any held cashback.

## 🚨 THE TRAP (why this is "ของานละเอียด", found 2026-06-06)

`tb_wallet_hs.type` has CREDIT vs DEBIT semantics baked into the approve path
(`actions/admin/tb-bulk.ts` ~L161, `wallet-trans.ts`):
`type '1'/'2' → wallettotal += amount` (CREDIT) · `type '4'/'7' → wallettotal -= amount` (DEBIT).

- The CURRENT shop-order self-pay uses **`type='2'` + `status='2'`** and decrements `tb_wallet` **MANUALLY** in `payServiceOrderFromWallet` — it never goes through the admin-approve path, so the "type='2'=credit" rule never bites it.
- **If we naively insert a shop-order slip as `type='2' status='1'` and let the admin approve it, the approve path will treat type='2' as a CREDIT and ADD `amount` to the customer's wallet** — a real money bug (free money), the exact thing the owner forbade.

**Correct approach:** a shop-order slip is a BANK-TRANSFER payment — it must NOT credit OR debit the wallet on approve (the money arrived in the bank, not the wallet). So the approve path needs an explicit shop-order branch that:
- recognises the row as a shop-order slip (proposed sentinel: a NEW `typeservice='1'` + `type='2'` + `imagesslip != ''` + `depositnamebank` starting `KBANK-` + `paydeposit=''`), and
- on approve: **skip the wallet delta**, flip `tb_header_order.hstatus '2'→'3'` (+ `hdate3`, `paydeposit='1'`), issue the receipt (shop-order receipt path), settle held cashback `[CB:…]`.
- on reject: flip `status→'3'/reject`, refund any held cashback `[CB:…]`, leave the order at `'2'` (unpaid).

A SAFER alternative to avoid the credit/debit ambiguity entirely: introduce a dedicated shop-slip `type` (e.g. a new `type='9'` mapped to "no wallet delta") so the existing `type 1/2/4/7` math is never touched. **Decide this before coding** — it's the load-bearing money decision.

## Wallet-as-partial-discount ("หักจาก wallet เท่าไหร่")

To avoid a "debit-then-reject-refund" race on `tb_wallet`, use the **HELD pattern** (same as forwarder cashback): at submit, do NOT move the wallet; stamp the chosen amount in the note as `[WALLET:<thb>]` (and/or `[CB:<thb>]` for cashback). The slip `amount` = bill − walletApplied. On **approve**, debit the held `[WALLET:X]` from `tb_wallet` (recording a `type='2'/status='2'` wallet-debit twin via the proven `payServiceOrderFromWallet` mechanics) + settle `[CB:X]` via `spendCashbackAtCheckout`. On **reject**, nothing was moved → nothing to refund. This keeps every money move gated behind the single admin-approve, eliminating the half-paid/refund race.

## Implementation plan (files)

- **Build** `ShopOrderPayModal` (mirror `forwarder-pay-modal.tsx`): QR + bill + slip upload + optional slip-date + a "ใช้ยอดในกระเป๋า/cashback เป็นส่วนลด" amount selector (0…min(walletAvail, bill), live "เหลือจ่าย" recompute) + confirm.
- **Build** actions: `getShopOrderPaymentQr` (wrap `getForwarderPaymentQr`), `uploadShopOrderSlip` (mirror `uploadForwarderSlip`, path `{uid}/shop_payment/…`), `submitShopOrderPayment(hNo,{slipPath,slipDate,walletApplied,cashBackApplied})` (insert PENDING `tb_wallet_hs`, note tagged `[WALLET:x][CB:y]`, NO wallet/status move).
- **Wire admin approve/reject** (`adminApproveWalletHs` + `adminBulkApproveWalletHs` + the reject path) to the shop-order branch above (skip-wallet-delta + flip hstatus + receipt + settle held wallet/CB; reject refunds held).
- **Keep** `payServiceOrderFromWallet` for "ถ้ายอดถึง" full-wallet instant-pay (the owner allows wallet when balance suffices).
- **Hide** (only after the above ships): the `/wallet/deposit` links in `service-order/[hNo]/page.tsx`, `m/dashboard/mobile-launchpad.tsx`, `wallet/{page,history}`, `service-payment/yuan-payment-form.tsx`, `how-to-use`. Keep `/wallet` itself as the cashback wallet.

## Canonical tables (no §0e dead-twins)

`tb_wallet_hs` (PENDING slip rows · live), `tb_wallet.wallettotal` (settled balance), `tb_cash_back`/`tb_cash_back_hs` (cashback · `spendCashbackAtCheckout`/`refundCashbackOnReject`), `tb_header_order.hstatus` (order state), `slips` bucket (RLS `{uid}/*`). Receipt via `autoIssueReceiptOnPaymentLand`.

## Gate (before deploy)

`pnpm verify` + `pnpm build` EXIT 0 · route-smoke · **+ a browser-tested full money loop on a TEST shop order** (submit slip with a partial `[WALLET:x]` → admin approve → assert: order `hstatus='3'`, `tb_wallet` decremented by exactly x, slip `tb_wallet_hs` `status='2'`, receipt issued; then a reject case asserts the wallet is untouched). Only then push to `main`.
