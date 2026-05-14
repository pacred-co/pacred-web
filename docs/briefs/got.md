# ก๊อต — Senior Advisor / Production Watcher

Last reviewed: 2026-05-15 (emergency revision — cargo revenue sprint)
Branch: `main` (production gatekeeper) · Authority: second-tier owner (per memory `project_authority`)

---

## 🔥 EMERGENCY (read FIRST — overrides normal priority)

บริษัทเผาเงิน. พี่ป๊อปเครียดมาก. Cargo system ต้องรับลูกค้าได้ ASAP → revenue → stop burn.

**Your job during emergency:** API switchover decisions + signups + decisions ที่ unblock ภูม + เดฟ จะ ship cargo path.

**ก๊อต P0 (do these in this order):**
1. **T-G1 API borrow audit** — list every external API the cargo system uses · borrow-from / Pacred-own / switchover timeline (~2h, output: table in [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part T3)
2. **T-G3 Pacred owner call** — bank/PromptPay/tax-ID/legal name (~30m call)
3. **T-G4 K-12 GTM + K-13 Clarity** signup (existing P0)
4. **T-G2 MOMO endpoint inventory** (existing MOMO-1)
5. **T-G5 DV-1 Sentry + Upstash + hCaptcha** signups

Read [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part T for the per-role emergency table + revenue-ready DoD.

---

## 🔒 Force-read before any work

1. **[`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part T** (emergency cargo sprint — your T-G1..T-G5)
2. [`docs/team.md`](../team.md) §1 (roles) + §3 (daily workflow) + §5 (pre-merge checklist)
3. [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part S2 (ก๊อต batch — your assigned items, normal pipeline)
4. [`docs/decisions/0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md) — V2 scope rules (DON'T refactor V2 → V3 mid-burn)
5. [`docs/audit/owasp-2026-05.md`](../audit/owasp-2026-05.md) — production hardening status
6. [`docs/pacred-info.md`](../pacred-info.md) — company DNA SOT

---

## Who you are

**Senior Advisor + Production Watcher.** You operate from `main`. You don't write feature code routinely — you:

- Lock decisions / write ADRs that direct ภูม + ปอน implementation
- Approve `dave → main` merges (production gate)
- Pick tools / partners / tech / API providers (this brief assigns this to you)
- Lock partner integrations + scope (MOMO, future scraper replacement, payment gateway)
- Sign up + provision external services on Pacred's behalf
- Audit security, RBAC, architecture decisions
- Cover ภูม on hard / decision-heavy / confidential / sensitive work

Per เดฟ brief 2026-05-16: "**ให้กอตจัดการงานวางโครงสร้างเวป ตัดสินใจเลือกใช้ tools หรือ partner ให้บริการทาง tech หรือ API ทั้งหลาย**"

---

## Current state of your domain

### 🟢 Done (this two-week sprint, 2026-05-13 → 2026-05-16)

- ADR-0003 china-search vendor cutoff (Option E hybrid) — [`0003-china-search-vendor-cutoff.md`](../decisions/0003-china-search-vendor-cutoff.md)
- ADR-0004 payment gateway (PromptPay-only ก่อน beta) — [`0004-payment-gateway.md`](../decisions/0004-payment-gateway.md)
- ADR-0005 launch operational K-4..K-7 — [`0005-launch-operational-decisions.md`](../decisions/0005-launch-operational-decisions.md)
- ADR-0006 tax invoice flow — [`0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md)
- ADR-0007 analytics + A/B testing stack — [`0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md)
- ADR-0008 DPX ERP phase 2 draft — [`0008-dpx-erp-phase-2.md`](../decisions/0008-dpx-erp-phase-2.md)
- ADR-0009 ERP schema sketch — [`0009-erp-schema-sketch.md`](../decisions/0009-erp-schema-sketch.md)
- ADR-0010 V2 vs V3 version strategy — [`0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md)
- OWASP Top 10 (2021) desk audit — [`audit/owasp-2026-05.md`](../audit/owasp-2026-05.md)
- PCS scrub plan + sweep — [`runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)
- OTP pepper rotation runbook — [`runbook/otp-pepper-rotation.md`](../runbook/otp-pepper-rotation.md)
- CODEOWNERS in `.github/CODEOWNERS`
- CI workflow `.github/workflows/ci.yml` (lint + tsc + test:unit + audit:all)

### 🟡 Pending — your pickup list (priority order)

#### P0 (block production beta)

| # | Task | Effort | Source |
|---|---|---|---|
| **K-12** | GTM container signup → `NEXT_PUBLIC_GTM_ID` in Vercel | 30–45m | Part S2 |
| **K-13** | Microsoft Clarity signup → `NEXT_PUBLIC_CLARITY_ID` in Vercel | 15–30m | Part S2 |
| **DV-1a** | Sentry account → `SENTRY_DSN` in Vercel | ~30m | Part S4 |
| **DV-1b** | Upstash Redis DB → `UPSTASH_REDIS_REST_URL/_TOKEN` in Vercel | ~30m | Part S4 |
| **DV-1c** | hCaptcha site (invisible) → `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` | ~30m | Part S4 |

#### P0.5 (MOMO partner — production cargo dependency)

| # | Task | Effort | Source |
|---|---|---|---|
| **MOMO-1** | Call MOMO dev → confirm endpoint inventory + base URL → fill [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) | ~1–2h call + ~1h doc | New 2026-05-16 |
| **MOMO-2** | Reverse-engineer legacy `pcs-admin/api-forwarder-jmf/*.php` if MOMO mirrors cargo-thai pattern | ~2–3h | Reference: [`audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md) §9 |
| **MOMO-3** | Decide webhook signature verification (request `MOMO_JMF_WEBHOOK_SECRET` from MOMO if available) | ~30m call + decision | New |

#### P1 (production hardening — pre-public-beta)

| # | Task | Effort | Source |
|---|---|---|---|
| **K-sec-2** | RLS policy comprehensive audit — every Supabase table | 3–4h | Part O5 Track K3 |
| **K-sec-3** | Audit log coverage gap report | 1–2h | Part O5 Track K3 |
| **K-sec-4** | External pen test — vendor + scope + timeline | 2–3h plan + exec post-launch | Part O5 Track K3 |
| **CSP-1** | CSP migrate from `'unsafe-inline'` to nonce-based per Next 16 docs | ~4h | OWASP P2 |
| **Renovate** | Set up Renovate or Dependabot for auto dep PRs | ~1h | Part O5 K-tooling-2 |

#### P2 (V3 prep — Track D ADRs)

| # | Task | Effort | Source |
|---|---|---|---|
| **P-38** | ADR-0011 ERP RBAC granular roles per module | 2–3h | Part S2 + ADR-0008 + ADR-0009 |
| **P-39** | ADR-0012 ERP frontend shell — same app vs separate `erp.pacred.co` | 2–3h | Part S2 |
| **P-40** | ADR-0013 ERP migration strategy from V2 → V3 | 2–3h | Part S2 |

#### P3 (Strategic decisions)

| # | Task | Effort | Source |
|---|---|---|---|
| **D-7** | Payment Gateway provider choice (Omise / 2C2P / Stripe TH) for post-beta | Owner-call ~30m + decision | ADR-0004 |
| **R1-pick** | China-search replacement (Option A scraper / B Alibaba API / C SaaS) | Owner-call + decision | ADR-0003 |
| **Pacred owner call** | bundle: bank/PromptPay/tax-ID/legal name | ~30m | Part Q Bundle 1 |

---

## Blockers + alternatives

When you're blocked:

| Blocked on | Alternative work |
|---|---|
| Pacred owner not responding | Take a P1 hardening item from the table above |
| Waiting on MOMO call back | Draft RLS audit (K-sec-2) or RBAC ADR (P-38) |
| Indecision between Omise/2C2P/Stripe | Take the Renovate setup (~1h, unblocks team long-term) |

**Note back to เดฟ when:** you decide a strategic direction, sign up for any external service, request anything from Pacred owner.

---

## Hand-offs IN (other people's outputs you consume)

- **เดฟ** writes pre-merge dave + sends review request → you review + merge dave→main
- **ภูม** writes ADR drafts under Sprint 7+ Track D → you finalise + lock
- **Claude agents** push hand-off entries to Part S of [`PORT_PLAN.md`](../PORT_PLAN.md) → you tick off + commit

## Hand-offs OUT (what you produce that others consume)

- ADRs in [`docs/decisions/`](../decisions/) → ภูม implements; เดฟ schedules
- External env credentials (in Vercel) → ภูม activates features that depend on them
- Approved `main` commits → production deployment
- Security audit findings → ภูม + เดฟ patch
- Tool/partner picks (MOMO, payment gateway, scraper replacement) → ภูม wires; เดฟ documents

---

## Push discipline (per memory `push_frequency_strict`)

- Commit local often during work session
- **Push only at save-points** (end of session / before sleep / machine change / big batch done)
- Target ~1 push per work session — not per commit

## Cross-links

- [`docs/team.md`](../team.md) §1 — your role definition + scope boundaries
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part S — current hand-off batch
- [`docs/decisions/`](../decisions/) — your ADRs
- [`docs/audit/`](../audit/) — your audits
