# ADR-0004 — Payment gateway selection for beta launch (D-7)

**Status:** Accepted (deferred — PromptPay-only for beta; gateway pick post-beta)
**Date:** 2026-05-16 (decision locked by เดฟ); ADR written 2026-05-16
**Phase:** Pre-launch (Part Q decision-list item D-7)
**Owner:** เดฟ + ก๊อต + Pacred owner (gateway pick) — เดฟ + ก๊อต for the
"defer to post-beta" framing.

---

## Context

Pacred needs to take customer money. The legacy PHP system (`pcs-cargo`)
used PromptPay for top-ups (manual: customer transfers + uploads slip,
admin approves) plus Alipay for yuan transfers (similarly manual).
Pacred has reproduced both flows in the Next.js port — `actions/wallet.ts
::createDeposit` + `actions/payment.ts::createYuanPayment` + admin
approve in `actions/admin/wallet.ts`.

For credit-card / digital-wallet flows we need an integrated payment
gateway. Three Thai-friendly options:

- **Omise** — Thai-native, simple SDK, supports cards + TrueMoney + WeChat
  Pay + PromptPay redirect
- **2C2P** — Industry standard for Thai e-commerce, enterprise feature
  set, more complex integration
- **Stripe Thailand** — International brand, best DX, lower coverage of
  Thai-specific wallet methods

The question is: do we need an integrated gateway before beta, or can
beta launch on PromptPay-only and we add the gateway after?

## Options considered

| # | Option | Effort | Pros | Cons |
|---|---|---|---|---|
| **A** | Omise integration before beta | ~40-60h M2.1 build | Customer cards work day-1; lower friction sign-up | Adds 6-8 weeks to beta timeline; risk of integration bugs at launch |
| **B** | 2C2P before beta | ~50-80h | Enterprise compliance posture | Heaviest integration; overkill for beta-scale traffic |
| **C** | Stripe TH before beta | ~30-50h | Cleanest DX | Lowest Thai-wallet coverage; arguable mismatch vs Pacred's customer base |
| **D** | **PromptPay-only for beta; gateway decision deferred to post-beta** | 0h (current state) | Beta ships now. Real customer demand data informs which gateway. Vast majority of Pacred-style cargo customers prefer slip-upload anyway. | Customers without bank apps can't pay. (Estimate: < 5% of Thai cargo-buyer demographic.) Manual admin approval queue scales linearly with order volume — fine for first ~100 orders/day. |

## Decision

**Option D — PromptPay-only for beta launch. Gateway pick deferred to
post-beta.**

The trade is: ~6-8 weeks faster to beta vs ~5% addressable customer
base reduction during the beta window. For a cargo-shipping audience
that already deals in invoices + slips, this is a clear win.

### Beta payment flows that DO work day-1

- Wallet top-up via PromptPay QR + slip upload + admin approve
  (`/wallet/deposit` → `actions/wallet.ts::createDeposit` →
  `actions/admin/wallet.ts::adminUpdateWalletTransaction`)
- Wallet withdraw request (`/wallet/withdraw` → admin executes external
  transfer)
- Yuan payment / Alipay request — same slip-upload + admin pattern
  (`/service-payment` → `actions/payment.ts::createYuanPayment`)
- Service order placement — payment due window 24-48 h, customer
  top-ups wallet then admin allocates against order

### What's blocked / suboptimal under PromptPay-only

- Direct card payment at checkout — punted to "deposit to wallet first"
  two-step
- Recurring payment / saved card — N/A for cargo's discrete-order model
  anyway
- Automated 3DS / risk scoring — admin manual review fills this gap
  during beta scale

## Post-beta selection criteria

When beta has 4-8 weeks of customer data, re-open the gateway decision
with **these inputs in hand**:

1. **Cart drop-off rate at "no card option" step** — measured via GA4
   funnel from `add_to_cart` → `place_order` (events shipped in
   commits `08685b3`, `33acf4e`, `17b53bd`)
2. **Customer-service tickets asking for card payment** — counted
   manually from contact-form submissions
3. **Average order volume per day** — informs whether admin manual
   approve still scales
4. **Pacred owner's bank acct + PromptPay number activated** (currently
   pending — Part Q Bundle 1)

If (1) > 15 % or (2) > 1 / week / 100 customers → activate gateway in
the order **Omise > 2C2P > Stripe TH** (Thai-native > enterprise >
international).

## Production blockers (still pending — Part Q)

This ADR locks the **strategy** but not the **operational creds**. Still
blocking beta launch:

- [ ] **PromptPay number** from Pacred owner (legacy PCS Cargo
      `064-174-3836` Kasikorn cannot be used — fresh Pacred account
      needed)
- [ ] **Bank account details** for the slip-upload receipt (account
      number + ชื่อบัญชี for tax invoices)
- [ ] **Set `PROMPTPAY_ID` env var** in Vercel production once the above
      lands. Without it `/wallet/deposit` QR generation throws (hard
      fail, not silent — `lib/promptpay.ts:21-25`).

## Re-evaluation triggers

Reopen this ADR when:

- 4 + weeks of beta traffic accumulated, OR
- Customer-service ticket volume around "no card option" exceeds the
  threshold above, OR
- Pacred owner directly asks for credit-card support, OR
- A future feature (e.g. subscription billing for premium tier) requires
  recurring-payment infrastructure

## References

- `docs/PORT_PLAN.md` Part Q4 — D-7 entry + Pacred owner blockers list
- `docs/PORT_PLAN.md` Part R3 — clarifies "owner = ก๊อต+เดฟ can decide"
- `docs/PORT_PLAN.md` Part S1 — decision locked 2026-05-16 (PromptPay-only)
- `docs/env.md` §6 — `PROMPTPAY_ID` env var spec + the "throws if unset"
  behaviour
- Existing implementation:
  - `actions/wallet.ts::createDeposit`
  - `actions/admin/wallet.ts::adminUpdateWalletTransaction`
  - `app/[locale]/(protected)/wallet/deposit/deposit-form.tsx`
  - `lib/promptpay.ts` (QR generation, used `promptpay-qr` npm package
    per `package.json` deps)
- Analytics for the funnel measurement (post-beta inputs): `lib/analytics.ts`
  conversion events `wallet_deposit`, `wallet_withdraw_request`,
  `place_order` (per ADR-0007)
