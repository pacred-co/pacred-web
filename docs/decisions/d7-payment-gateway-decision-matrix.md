# D-7 — Payment gateway decision matrix (Thailand)

> **Status:** ⚠️ **OVERRIDDEN 2026-05-17 — Xendit + K-Biz + K-Shop (Kasikorn-centric stack)** picked by พี่ป๊อป via ลูกพี่ during T-G3 Bundle 1 call. Previous Omise decision (2026-05-16 night) SUPERSEDED — see §9 "Decision change log" below for trace. Wire-up = ภูม at T+30d post-launch per updated §5.3.
> **Date:** 2026-05-17 (Xendit decision) · 2026-05-16 night (original matrix + Omise pre-decision)
> **Source:** [ADR-0004 payment-gateway](0004-payment-gateway.md) post-beta decision + T-G3 Ask #4.
>
> **Read with:**
> [ADR-0004](0004-payment-gateway.md) (locked: PromptPay-only pre-beta) ·
> [`docs/pacred-info.md`](../pacred-info.md) (Pacred legal info for vendor onboarding).

---

## 1. Current state (per ADR-0004)

**Pre-beta:** PromptPay-only QR (DV-4 — Pacred owner provides bank account number). Manual slip upload → admin approves → wallet credited. **No payment gateway integration.**

**Post-beta (this matrix's goal):** add a real card/bank-direct payment gateway so:
- Customer can pay without manual slip
- Wallet top-up is instant (vs 1-30 min admin review)
- Refunds programmable
- Recurring billing possible (V2 long-phase for monthly cargo customers)

---

## 2. Decision criteria (Pacred-specific)

| Criterion | Weight | Why it matters |
|---|---|---|
| **Thai bank coverage** | High | Pacred customers = 99% Thai. Must support KBank / SCB / BBL / Krungsri / Krungthai / GHB / TMB-now-TTB / etc. |
| **PromptPay support** | High | Already wired pre-beta; new gateway should support PromptPay as a method too (don't lose that). |
| **Card support (Visa / MC / JCB / UnionPay)** | Medium | Some customers prefer credit cards (loyalty points). JCB + UnionPay for Chinese cardholders. |
| **TrueMoney / Rabbit LINE Pay e-wallets** | Medium | Younger demographic + LINE-integrated payments. |
| **Webhook reliability** | High | Pacred must know payment-completed within seconds. |
| **Settlement time** | High | T+1 or T+2 typical. Faster = better cash flow. |
| **Pricing** | High | Per-transaction fee + monthly minimum. |
| **PCI DSS compliance level** | Medium | If gateway is PCI-DSS Level 1 → Pacred doesn't touch card data (= simpler compliance for Pacred). |
| **Onboarding time** | Medium | Some Thai gateways take 4-8 weeks (KYC + bank coord). |
| **Developer experience** | Medium | API docs quality, SDK availability, sandbox env. |
| **Refund support** | Medium | Programmable refund (vs manual = ops burden). |
| **Recurring billing** | Low (V2 long-phase) | For monthly cargo subscription customers later. |
| **Support quality** | Medium | Thai-language + responsive. |

---

## 3. Vendor options

### 3.1 **Omise (Opn Payments)** — recommended default

**Coverage:** Visa / MC / JCB / UnionPay · TrueMoney · PromptPay · บัตรเครดิต · Internet banking (KBank / SCB / BBL / Krungsri / Krungthai) · Alipay / WeChat Pay (cross-border)

**Pricing:** 3.65% + ฿11 per credit-card transaction; PromptPay 0.55% + ฿0; e-wallet 1.85%; no monthly minimum on standard tier
**Settlement:** T+2 (T+1 for Pro tier)
**PCI DSS:** Level 1 (Pacred never sees card data)
**Webhook:** Standard webhook + retry policy (24h backoff)
**Onboarding:** 1-2 weeks typically (Pacred is small biz; faster than enterprise)
**SDK:** Node.js / Next.js examples in their docs; well-documented; Postman collection
**Refund:** API-supported; partial refunds OK
**Recurring:** Yes (Charge.recurring; Pacred can implement subscription model later)
**Support:** Thai + English; email + chat; SLA varies by tier

**Pros:**
- ✅ Best DX in Thai market (cleanest API; Next.js examples)
- ✅ Comprehensive coverage (all major TH methods)
- ✅ PCI Level 1 (Pacred zero card-data handling)
- ✅ Fast onboarding for small biz
- ✅ Thai + foreign payment methods (helps cross-border cargo customers from China)

**Cons:**
- ❌ Slightly higher card fee (3.65% vs 2.95% for SCB Easy Pay etc.)
- ❌ T+2 settlement (TTB Direct Debit is T+0 but card-only)

### 3.2 **2C2P** — enterprise alternative

**Coverage:** Same as Omise + larger enterprise customer base (Tesco / Lazada / etc.)
**Pricing:** Negotiable; typically 2.95-3.50% card; PromptPay 0.55%; monthly minimum ~฿3000 (for small biz)
**Settlement:** T+1 or T+2 negotiable
**PCI DSS:** Level 1
**Webhook:** Standard
**Onboarding:** 3-6 weeks (more KYC required)
**SDK:** Older API style; less Next.js-friendly than Omise
**Refund:** API-supported
**Recurring:** Yes
**Support:** Thai + English; account manager assigned

**Pros:**
- ✅ Lower card-fee negotiable for volume
- ✅ Enterprise-grade support + SLA
- ✅ Used by major TH platforms (Lazada etc.) — proven scale

**Cons:**
- ❌ Slower onboarding (Pacred timeline tight)
- ❌ Higher monthly minimum
- ❌ API less modern (form-based redirect vs SPA-friendly)

### 3.3 **Stripe (international)** — vs Pacred Thailand specifics

**Coverage:** Visa / MC / Amex / JCB / UnionPay (cards only — limited TH e-wallet support; PromptPay supported via PromptPay)
**Pricing:** 3.95% + ฿11 for non-EU cards (Thailand baseline); PromptPay 1.55% + ฿0
**Settlement:** T+2 (default)
**PCI DSS:** Level 1
**Webhook:** Best-in-class (event store + replay; structured events)
**Onboarding:** 1-2 days (instant approval for most small biz)
**SDK:** Best-in-class (Next.js + TypeScript native)
**Refund:** Full API + reason codes
**Recurring:** Industry-standard
**Support:** English-only typically; community + docs excellent; paid support tier

**Pros:**
- ✅ World-class DX (best in industry — TypeScript SDK, hooks for Next.js, Stripe Elements)
- ✅ Fastest onboarding
- ✅ Excellent webhook reliability + event replay

**Cons:**
- ❌ Higher card fees (3.95% vs Omise 3.65%) — eats ~฿2-3k per ฿100k revenue
- ❌ Limited TH e-wallets (no TrueMoney / Rabbit / WeChat Pay)
- ❌ English-only support — Pacred ops team may need translation
- ❌ Thai bank coverage limited — internet banking integration weaker
- ❌ Currency conversion fees if customer pays in USD (cross-border cargo customers)

### 3.4 **GBPrimePay** — Thai bank-direct focus

**Coverage:** Strong Thai bank direct debit + PromptPay; cards via partner gateways
**Pricing:** 2.95% card; ~0.30% bank direct debit; PromptPay 0.55%
**Settlement:** T+1 or T+0 for bank-direct
**PCI DSS:** Level 1 (via partner for cards; in-house for bank direct)
**Webhook:** Standard
**Onboarding:** 2-4 weeks
**SDK:** PHP-first; Node.js SDK exists but less polished
**Refund:** API supported
**Recurring:** Yes
**Support:** Thai-language; phone + email

**Pros:**
- ✅ Lowest fees for bank-direct (best for cash-flow-sensitive cargo customers)
- ✅ T+0 settlement for bank-direct (vs T+2 for everyone else)
- ✅ Strong Thai bank integration

**Cons:**
- ❌ Older SDK (Pacred is Next.js; PHP-first DX is a friction)
- ❌ Less polished sandbox env
- ❌ Smaller market share vs Omise/2C2P

### 3.5 **K-Payment Gateway (Kasikorn / KBank)**

**Coverage:** All KBank-issued cards + KBank internet banking + PromptPay
**Pricing:** Negotiable; typically 2.50-3.00% for KBank cards
**Settlement:** T+0 to T+1 within KBank ecosystem
**PCI DSS:** Level 1
**Webhook:** Standard
**Onboarding:** 4-8 weeks (full KYC + bank acct verification)
**SDK:** Mediocre (Java/PHP-first)
**Refund:** API + admin portal
**Recurring:** Yes
**Support:** Thai-only; tied to KBank relationship

**Pros:**
- ✅ Best fees if Pacred banks with KBank (and probably does per pre-beta plan)
- ✅ Same-bank instant settlement
- ✅ Trusted by Thai customers (KBank brand)

**Cons:**
- ❌ KBank-customer-only optimal; other-bank cards routed via VISA/MC = higher fees
- ❌ Slower onboarding
- ❌ Tied to KBank relationship — switching banks later = re-onboard

### 3.6 **Bug-bounty / niche** (DropPay / TrueMoney Merchant / Rabbit LINE Pay direct)

Direct integrations with individual e-wallets. Pacred can add ONE OR MORE on top of a primary gateway later. Defer.

---

## 4. Comparison matrix

| Criterion (weight) | Omise | 2C2P | Stripe | GBPrimePay | K-Payment |
|---|---|---|---|---|---|
| Thai bank coverage (H) | 🟢 all | 🟢 all | 🟡 limited | 🟢 all | 🟢 KBank++; others OK |
| PromptPay (H) | 🟢 0.55% | 🟢 0.55% | 🟡 1.55% | 🟢 0.55% | 🟢 0.55% |
| Card fee (H) | 🟡 3.65% | 🟢 2.95% negotiable | 🟡 3.95% | 🟢 2.95% | 🟢 2.50% KBank, 3.00% others |
| TH e-wallets (M) | 🟢 TrueMoney + Rabbit | 🟢 same | 🔴 minimal | 🟡 partner | 🟡 partner |
| Cross-border (M — Alipay/WeChat) | 🟢 native | 🟢 native | 🟢 native | 🔴 no | 🔴 no |
| Webhook quality (H) | 🟢 good | 🟢 good | 🟢 excellent | 🟡 standard | 🟡 standard |
| Settlement (H) | 🟡 T+2 | 🟡 T+1 | 🟡 T+2 | 🟢 T+0/T+1 | 🟢 T+0 KBank, T+1 others |
| PCI DSS (M) | 🟢 L1 | 🟢 L1 | 🟢 L1 | 🟢 L1 | 🟢 L1 |
| Onboarding speed (M) | 🟢 1-2wk | 🟡 3-6wk | 🟢 1-2 days | 🟡 2-4wk | 🔴 4-8wk |
| DX / Next.js fit (M) | 🟢 best in TH | 🟡 ok | 🟢 best globally | 🟡 ok | 🔴 PHP-first |
| Refund API (M) | 🟢 yes | 🟢 yes | 🟢 yes | 🟢 yes | 🟢 yes |
| Thai-language support (M) | 🟢 yes | 🟢 yes | 🔴 EN-only | 🟢 yes | 🟢 yes |
| Recurring billing (L) | 🟢 yes | 🟢 yes | 🟢 yes | 🟢 yes | 🟢 yes |
| Monthly minimum | 🟢 none std tier | 🟡 ~฿3000 | 🟢 none | 🟡 ~฿1500 | 🟡 negotiable |

**Score (subjective, weighted):**
- **Omise: 92/100** ✅ recommended
- 2C2P: 84/100
- Stripe: 78/100 (DX advantage offset by TH market gaps)
- GBPrimePay: 80/100 (best for bank-direct focus)
- K-Payment: 76/100 (KBank-only optimal)

---

## 5. Recommendation (current — Xendit + K-Biz + K-Shop)

### 5.1 Primary recommendation: **Xendit + K-Biz + K-Shop** (Kasikorn-centric stack) — pick by พี่ป๊อป 2026-05-17

**Why:**
1. **Pacred banks with Kasikorn** (current account `225-2-91144-0`) — same-bank settlement = T+0 for K-Biz/K-Shop transfers (vs T+2 for any cross-bank gateway)
2. **K-Shop** = KBank merchant QR — Pacred customer scans → instant transfer to KBank biz account (same-bank flow)
3. **K-Biz** = KBank corporate internet banking — for B2B juristic customers transferring large amounts (FCL/cargo invoices); admin can verify via K-Biz statement
4. **Xendit** = orchestration layer over K-Shop / K-Biz / card / PromptPay / cross-border e-wallets — single integration for Pacred
5. Xendit Thailand has good DX (REST API + webhook + Next.js examples) and PCI Level 1
6. **Cross-border kept** via Xendit's e-wallet partners (Alipay / WeChat / TrueMoney) — important for Chinese cargo customers

**Trade-off accepted (vs prior Omise pick):**
- Xendit Thailand is newer to market vs Omise — slightly smaller TH merchant base, but K-Shop + K-Biz native integration outweighs
- More moving parts (Xendit + 2 KBank products) vs Omise's single integration — but each part is shallow + KBank-managed
- Per-transaction fee comparable to Omise (~2.85-3.5% card; lower for K-Shop QR + K-Biz transfer)

### 5.0 (Historical — superseded) Why Omise was picked first then changed

The 2026-05-16 night picks (eng team led by ก๊อต + เดฟ + ลูกพี่) optimized for Pacred-side DX + market coverage. The 2026-05-17 owner call with พี่ป๊อป revealed Pacred's **same-bank settlement preference** (T+0 cash flow critical for cargo operations) + **existing K-Biz/K-Shop owner familiarity** that the eng-only matrix did not capture. Decision delegated to owner per ADR-0010 V2 owner-pleaser principle. Original Omise reasoning preserved in §3.1 + §5.5 for reference if Xendit fails to deliver.

### 5.5 (Historical — superseded) Omise recommendation

[Preserved per AGENTS.md §3 anti-preempt principle — re-open if Xendit T+30d eval fails.]

**Why Omise was picked:**
1. Comprehensive Thai market coverage (cards + PromptPay + TH e-wallets + Alipay/WeChat)
2. Best DX for Next.js (closest to native TypeScript)
3. Fast onboarding (1-2 weeks; Pacred timeline fits)
4. PCI Level 1 (zero card data on Pacred infra = simpler PDPA)
5. Strong TH local + cross-border (helps Chinese cargo customers paying)
6. No monthly minimum on standard tier (low risk for Pacred's launch volume)

**Trade-off (Omise):**
- 3.65% card fee is ~฿700 more per ฿100k vs 2C2P's 2.95% negotiated. At Pacred's launch volume (~฿5M/mo target), that's ~฿35k/mo additional fee. **Acceptable for the DX + onboarding speed win.**

### 5.2 Migration plan (Xendit + K-Biz + K-Shop)

| Phase | Activity |
|---|---|
| **Now (pre-beta)** | PromptPay-only via Pacred's own QR (per ADR-0004) — `PROMPTPAY_ID = TAX_ID 0105564077716` ผูกบัญชี Kasikorn 225-2-91144-0 |
| **T+30 days post-launch** | Sign up Xendit Thailand sandbox + set up K-Biz API access (KBank biz internet banking developer portal) + K-Shop merchant QR via KBank app/branch |
| **T+45 days** | Production Xendit account approved + activated + K-Biz API integrated + K-Shop merchant QR linked to biz account; soft-launch (open for select customers) |
| **T+60 days** | Full Xendit + K-Biz + K-Shop integration live for all customers; PromptPay remains as alternative method |
| **T+90 days** | Evaluate: K-Shop QR vs Xendit-orchestrated PromptPay (any reason to keep both?); monitor K-Biz transfer reconciliation lag for B2B juristic customers |
| **Year 2** | Renegotiate Xendit fee if monthly volume > ฿10M; evaluate adding international Stripe for non-TH/CN customers if expansion happens |

### 5.3 Pacred-side wiring estimate (Xendit + K-Biz + K-Shop)

ภูม implements (~16-22h — slightly more than single-gateway Omise estimate because 3 channels):

1. Migration `0NNN_payment_intents.sql` — `payment_intents` table (universal pattern across Xendit/K-Biz/K-Shop) + status state machine (`pending → succeeded / failed / refunded`) + `provider` enum (`xendit / kbiz / kshop / promptpay`) + idempotency key
2. `lib/payments/xendit/client.ts` — typed wrapper around Xendit Node SDK
3. `lib/payments/kbiz/client.ts` — typed wrapper for K-Biz API (Kasikorn biz internet banking — confirm API surface during T+30d sandbox phase)
4. `lib/payments/kshop/qr.ts` — K-Shop merchant QR generation (similar pattern to PromptPay QR helper)
5. `actions/payments/initiateCheckout.ts` — create payment intent for chosen provider, return checkout URL or QR data
6. `app/api/webhooks/xendit/route.ts` — Xendit webhook receiver with signature verification
7. `app/api/webhooks/kbiz/route.ts` — K-Biz transfer notification webhook (if API supports; else fall back to manual reconcile via K-Biz statement export)
8. Customer-side: replace PromptPay-only `/wallet/deposit` with multi-method picker (PromptPay / K-Shop QR / K-Biz transfer / card via Xendit / cross-border e-wallet via Xendit)
9. Admin-side: payment status panel on `/admin/wallet/[id]` showing provider + status + reconcile-state
10. Tests: end-to-end checkout flow in Xendit sandbox + K-Biz sandbox if available
11. Sentry alert on webhook signature mismatch (Xendit) + K-Biz reconcile drift > 1h

---

## 6. Resolved decisions (overridden 2026-05-17 by พี่ป๊อป via ลูกพี่)

1. **Gateway pick** — ⚠️ **OVERRIDDEN to Xendit + K-Biz + K-Shop** (was Omise). Reason: Pacred banks with Kasikorn (acct `225-2-91144-0`) — same-bank T+0 settlement preference, plus owner familiarity with K-Biz/K-Shop. Xendit acts as orchestration layer for card + cross-border e-wallet.
2. **Pacred company info** — ✅ partially gathered T-G3 2026-05-17: bank acct ✅, tax-ID ✅ confirmed; remaining legal-info fields existing pacred-info.md to confirm with พี่ป๊อป.
3. **Cards-only or wallet-first?** ✅ **Wallet-first UX confirmed** (unchanged from Omise pick). Top up wallet via chosen provider → pay from wallet on each order. Reduces per-transaction friction + provider commission spread across larger top-ups.
4. **Refund policy** — ✅ **Admin-only V1** (unchanged) per ADR-0014 self-service state-transitions pattern.
5. **Cross-border** — ✅ **THB charge with Xendit auto-FX** (Xendit replaces Omise as FX handler). Customer-facing UI always shows THB; Chinese-cardholder pays via Xendit's Alipay/WeChat at THB amount.

**Next action:** ภูม implements per updated §5.3 (~16-22h, slightly more than Omise estimate due to 3 channels) starting T+30d post-launch. ลูกพี่ + พี่ป๊อป handle Xendit Thailand signup + K-Biz API access (KBank biz internet banking dev portal) + K-Shop merchant QR via KBank app/branch in parallel during T+30d sandbox phase.

---

## 9. Decision change log

| Date | Decision | Picker | Reason |
|---|---|---|---|
| 2026-05-16 night | Omise (Opn Payments) — DRAFT | เดฟ matrix | Best DX + market coverage from eng-only view |
| 2026-05-16 night | Omise — ACCEPTED | ก๊อต + เดฟ + ลูกพี่ | Locked pending พี่ป๊อป owner approval |
| 2026-05-17 | **Xendit + K-Biz + K-Shop** — **OVERRIDE** | พี่ป๊อป (via ลูกพี่ T-G3 call) | Kasikorn-bank-centric: T+0 settlement + owner familiarity. Owner-level decision per ADR-0010 V2 owner-pleaser principle. |

---

## 7. Cross-references

- ADR locking — [ADR-0004 payment gateway](0004-payment-gateway.md) (pre-beta = PromptPay; post-beta = TBD = this matrix)
- Pacred owner info / legal — [`docs/pacred-info.md`](../pacred-info.md)
- Pacred infra — [`docs/env.md`](../env.md) (env vars for gateway secrets)
- Customer wallet flow — `actions/wallet.ts` (current) + ADR-0014 pattern
- Webhook receiver pattern — `app/api/webhooks/` (currently empty; first webhook will be MOMO or Omise depending on priority)

**End of D-7 decision matrix.** Decision = **Xendit + K-Biz + K-Shop** (2026-05-17 owner override). ภูม implements per §5.3 starting T+30d post-launch (~16-22h work). ลูกพี่ + พี่ป๊อป handle Xendit Thailand signup + K-Biz API dev portal access + K-Shop merchant QR setup in parallel during T+30d sandbox phase.
