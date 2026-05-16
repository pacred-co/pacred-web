# D-7 — Payment gateway decision matrix (Thailand)

> **Status:** ✅ **DECIDED 2026-05-16 night — Omise (Opn Payments)** picked by ก๊อต + เดฟ + ลูกพี่. **Owner approval call** with พี่ป๊อป still required for cash-commitment sign-off (§6 Q1) — but technical decision locked. Wire-up = ภูม at T+30d post-launch per §5.3.
> **Date:** 2026-05-16 night (matrix + decision)
> **Source:** [ADR-0004 payment-gateway](0004-payment-gateway.md) post-beta decision.
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

## 5. Recommendation

### 5.1 Primary recommendation: **Omise (Opn Payments)** as Pacred's first real gateway

**Why:**
1. Comprehensive Thai market coverage (cards + PromptPay + TH e-wallets + Alipay/WeChat)
2. Best DX for Next.js (closest to native TypeScript)
3. Fast onboarding (1-2 weeks; Pacred timeline fits)
4. PCI Level 1 (zero card data on Pacred infra = simpler PDPA)
5. Strong TH local + cross-border (helps Chinese cargo customers paying)
6. No monthly minimum on standard tier (low risk for Pacred's launch volume)

**Trade-off accepted:**
- 3.65% card fee is ~฿700 more per ฿100k vs 2C2P's 2.95% negotiated. At Pacred's launch volume (~฿5M/mo target), that's ~฿35k/mo additional fee. **Acceptable for the DX + onboarding speed win.**

### 5.2 Migration plan

| Phase | Activity |
|---|---|
| **Now (pre-beta)** | PromptPay-only via Pacred's own QR (per ADR-0004) |
| **T+30 days post-launch** | Sign up Omise sandbox; test integration |
| **T+45 days** | Production Omise account approved + activated; soft-launch (open for select customers) |
| **T+60 days** | Full Omise integration live for all customers; PromptPay remains as alternative method |
| **T+90 days** | Evaluate: any need to add 2C2P for enterprise customers? Add GBPrimePay for high-volume bank-direct customers? |
| **Year 2** | Renegotiate Omise fee if monthly volume > ฿10M (Pro tier discount tier kicks in) |

### 5.3 Pacred-side wiring estimate

ภูม implements (~12-16h):

1. Migration `0NNN_payment_intents.sql` — `payment_intents` table (mirror Stripe/Omise pattern) + status state machine (`pending → succeeded / failed / refunded`) + idempotency key
2. `lib/payments/omise/client.ts` — typed wrapper around Omise Node SDK
3. `actions/payments/initiateCheckout.ts` — create payment intent, return checkout URL
4. `app/api/webhooks/omise/route.ts` — webhook receiver with signature verification
5. Customer-side: replace PromptPay-only `/wallet/deposit` with multi-method picker (PromptPay / card / e-wallet)
6. Admin-side: payment status panel on `/admin/wallet/[id]`
7. Tests: end-to-end checkout flow in sandbox
8. Sentry alert on webhook signature mismatch

---

## 6. Resolved decisions (locked 2026-05-16 night by ก๊อต + เดฟ + ลูกพี่)

1. **Approve Omise pick** — ✅ **DECIDED Omise (Opn Payments).** Operational gate: T-G3 พี่ป๊อป Bundle 1 call still needed (ask if any KBank-tax-relationship reason to switch — recommend Omise unless พี่ป๊อป has hard requirement).
2. **Pacred company info** — ⏳ T-G3 Bundle 1 still gathers (legal name + tax ID + bank acct) — gateway onboarding can't start without this. Same call.
3. **Cards-only or wallet-first?** ✅ **Wallet-first UX confirmed.** Top up wallet via Omise → pay from wallet on each order. Reduces per-transaction friction + Omise commission spread across larger top-ups.
4. **Refund policy** — ✅ **Admin-only V1** per ADR-0014 self-service state-transitions pattern. Customer self-refund deferred to V1.1 if demand emerges.
5. **Cross-border** — ✅ **THB charge with Omise auto-FX.** Customer-facing UI always shows THB; Chinese-cardholder pays via Alipay/WeChat at THB amount, Omise handles FX silently.

**Next action:** ภูม implements per §5.3 (~12-16h) starting T+30d post-launch. ก๊อต queues พี่ป๊อป owner-approval call as part of T-G3 Bundle 1.

---

## 7. Cross-references

- ADR locking — [ADR-0004 payment gateway](0004-payment-gateway.md) (pre-beta = PromptPay; post-beta = TBD = this matrix)
- Pacred owner info / legal — [`docs/pacred-info.md`](../pacred-info.md)
- Pacred infra — [`docs/env.md`](../env.md) (env vars for gateway secrets)
- Customer wallet flow — `actions/wallet.ts` (current) + ADR-0014 pattern
- Webhook receiver pattern — `app/api/webhooks/` (currently empty; first webhook will be MOMO or Omise depending on priority)

**End of D-7 decision matrix.** ก๊อต: walk through with พี่ป๊อป using §6 questions; approve Omise or push back with rationale. ภูม implements per §5.3 once approved (~12-16h work, post-T+30 days launch).
