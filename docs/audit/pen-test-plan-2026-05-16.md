# K-sec-4 — External pen test plan

> **Status:** 📋 plan only by เดฟ (ก๊อต P1 task). Execution = post-launch. ก๊อต confirms vendor pick + scope + timeline.
> **Date:** 2026-05-16 night · **Source:** PORT_PLAN Part S2 ก๊อต queue K-sec-4 + [OWASP audit](owasp-2026-05.md).
>
> **Read with:**
> [`docs/audit/owasp-2026-05.md`](owasp-2026-05.md) (Top 10 self-audit) ·
> [`docs/audit/rls-and-audit-log-2026-05-16.md`](rls-and-audit-log-2026-05-16.md) (RLS + audit-log coverage — completed) ·
> [`docs/audit/legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) §5 (legacy PHP security findings).

---

## 1. Why pen-test now

Pacred ships **Monday 2026-05-18**. Within 30-60 days post-launch, when:
- Real customer traffic flowing
- Payment data + tax IDs + addresses in DB
- LINE OA push + email integrations active
- Admin RBAC enforcing real roles in prod

→ external pen-test catches:
1. **What internal review missed** (3rd-party eye + offensive tooling)
2. **Combined exploits** (e.g. CSP bypass + cookie misconfig + XSS chain)
3. **Compliance evidence** — for future enterprise customers / banks / regulators asking "do you have a recent pen-test?"

Pacred-specific risk surfaces:
- Customer signup → DBD juristic-check → tax-invoice flow (PII handling)
- Wallet deposit/withdraw (financial data + slip uploads)
- Webhook receivers (MOMO push when live; potentially other partners)
- Admin RBAC + audit log (insider threat / privilege escalation)
- LIFF integration (`/liff/link` — open redirect / token leakage class)

---

## 2. Scope

### 2.1 In-scope

| Surface | What gets tested |
|---|---|
| **Web app** (customer-facing) | All public + protected routes, signup/login/OAuth, wallet, orders, shipments, profile, password recovery |
| **Admin surfaces** | `/admin/*` (all 60+ routes), RBAC bypass attempts, audit-log tampering, super-bypass abuse |
| **API endpoints** | `/api/cron/*` (CRON_SECRET enforcement), `/api/webhooks/*` (signature verification), `/api/pdf/*`, `/api/tax-invoice/*`, `/api/china-search/*` (when active), `/api/dbd/*` |
| **Server actions** | Auth checks on every mutating action (per ADR-0014 pattern), idempotency abuse, race conditions |
| **Supabase RLS** | Customer A → read/write Customer B's data, JWT manipulation, service-role token discovery |
| **Storage buckets** | Direct URL access bypass, path traversal in `member-docs/{user_id}/...`, public bucket exposure |
| **Auth flows** | Google/FB OAuth callback handling, OTP rate-limit bypass, password reset abuse, session fixation |
| **CSP** (post-CSP-1) | After nonce migration, verify enforcement |
| **CI/CD pipeline** | GitHub Actions secret exposure, branch-protection bypass, dependency-confusion attacks (per Renovate config) |
| **Vercel deployment** | Environment-variable leakage, build-step injection, edge-function abuse |

### 2.2 Out-of-scope

- 3rd-party services (Supabase infra, Vercel infra, LINE platform, Resend) — vendor's responsibility
- Legacy PHP system (`pcscargo.co.th`) — retiring; pen-test there is wasted effort
- DDoS / volumetric attacks — out of pen-test scope; covered by Vercel + Cloudflare anti-DDoS
- Physical security — N/A (no on-prem infra)
- Social engineering — separate engagement (recommend post-pen-test, year-2)

### 2.3 Test environment

**Recommend dedicated staging Supabase project** = production-mirror data structure with synthetic test data. Avoid testing on prod (risk of real customer data exposure or data corruption from active exploitation).

Cost: ~$25-30/mo Supabase staging tier.

---

## 3. Vendor candidates (Thailand-aware)

### 3.1 Local Thai-based vendors

| Vendor | Pros | Cons | Estimated cost (web app + admin) |
|---|---|---|---|
| **ACInfotec** (Bangkok) | Strong local presence, banking-sector experience, Thai-language reports | Pricing on higher end (banking-grade) | ฿250k-400k |
| **MFEC** | One of the largest Thai cybersec firms, gov + enterprise track record | Bureaucratic; longer engagement timeline | ฿300k-500k |
| **Aiwen Tech** | Smaller, faster | Less brand recognition | ฿120k-200k |
| **Stelia / G-ABLE** | Mid-tier, web + cloud focus | Limited fintech specialization | ฿150k-250k |

### 3.2 International vendors (remote-eng)

| Vendor | Pros | Cons | Estimated cost |
|---|---|---|---|
| **NCC Group** | Top-tier global, deep Next.js + Supabase familiarity | ~$30-50k USD; remote = no on-site context | ฿1.0M-1.7M |
| **Trail of Bits** | Best-in-class; deep crypto + smart-contract pedigree | Expensive; overkill for Pacred V2 scope | ฿1.5M+ |
| **Doyensec** | Web-app specialists, modern stack | Higher tier | ฿800k-1.5M |
| **Cure53** | Strong web/SPA audit reputation | Booking lead times 6-12 weeks | ฿800k-1.2M |

### 3.3 Bug-bounty alternatives (continuous, lower upfront)

| Platform | Setup | Cost |
|---|---|---|
| **HackerOne** | Define scope + bounty schedule; researchers submit findings | $0 base + variable bounty (~฿20k-100k per critical) |
| **Bugcrowd** | Same | Similar |
| **Intigriti** | EU-based, growing in Asia | Similar |

Bug bounty = ONGOING discovery (good post-launch) but not equivalent to a focused engagement (no executive report, no scope guarantee).

### 3.4 Recommendation

**Tier-1 pick: Aiwen Tech or comparable Thai mid-tier (~฿150k-200k for first engagement)**
- Pacred is small-to-mid cargo logistics company; banking-grade pen-test is overkill
- Thai vendor = Thai-language reports + understanding of local compliance (ภ.พ.30, PDPA)
- Set up follow-on bug-bounty (HackerOne) at month-6 post-pen-test for continuous discovery

**Tier-2 pick (if budget allows): NCC Group or Doyensec (~฿1M)**
- For when Pacred takes on enterprise B2B customers who require a "big-name" report
- Year-2 engagement

---

## 4. Timeline + budget

### 4.1 Recommended timeline (assuming Aiwen-tier vendor)

| Week | Activity |
|---|---|
| **T-0** (launch day, Mon 2026-05-18) | Pacred goes live; no pen-test yet |
| **T+4 weeks** (mid-June) | Pacred has 30 days of prod traffic; staging mirror ready |
| **T+5 weeks** | RFP sent to 3 Thai vendors (Aiwen, Stelia, MFEC) |
| **T+7 weeks** | Vendor selected, contract + NDA signed |
| **T+8 weeks** | Kickoff: scope review, account provisioning, test data setup |
| **T+9-12 weeks** | Active testing window (3-4 weeks) |
| **T+13 weeks** | Vendor delivers preliminary report; Pacred remediation begins |
| **T+15-16 weeks** | Pacred patches critical + high findings; vendor re-test (included in engagement) |
| **T+17 weeks** | Final report; executive summary for owner / stakeholders |

**Total elapsed: ~4 months from launch to final report.** Re-engage every 12 months thereafter (or after major feature additions).

### 4.2 Budget

| Line item | Cost |
|---|---|
| Vendor engagement (Tier-1 pick) | ฿150k-200k |
| Staging Supabase project (4 months) | ~฿4k |
| Sentry pro tier (for monitoring during pen-test) | already in DV-1a budget |
| Remediation engineering time (ภูม / เดฟ) | ~80-160h depending on findings |
| **TOTAL** | **~฿200-250k cash + ~160h eng** |

Re-engagement budget (year-2): same vendor or upgrade tier per growth.

---

## 5. Pre-pen-test checklist

Before engaging vendor, internal hygiene:

- [ ] OWASP audit complete (✅ [`audit/owasp-2026-05.md`](owasp-2026-05.md))
- [ ] RLS audit complete (✅ [`audit/rls-and-audit-log-2026-05-16.md`](rls-and-audit-log-2026-05-16.md))
- [ ] CSP nonce migration shipped (CSP-1; recommend week-2 post-launch)
- [ ] Sentry + Upstash + hCaptcha live (DV-1a/b/c)
- [ ] Production smoke gate working (per `phase-verify-loop` skill — `next start` + curl)
- [ ] CI gates green (lint + tsc + tests + audit:all)
- [ ] All `*_BYPASS` flags = false in prod (OTP_BYPASS / LINE_PUSH_BYPASS / PROMPTPAY_BYPASS / etc.)
- [ ] All Pacred env vars rotated since last commit (assume some leaked to git history; rotate)
- [ ] Sentry + admin_audit_log monitored daily — establish baseline (so anomalies during pen-test are spottable)

---

## 6. Engagement structure (RFP template)

When requesting proposals:

**To: <vendor>**
**Re: Web app + admin penetration test for Pacred (cargo logistics, Thailand)**

**Background**
Pacred is a TH-based cargo + customs logistics platform built on Next.js 16 + Supabase (Postgres + RLS + Storage). Customer-facing portal at `pacred.co`; admin back-office at `pacred.co/admin/*`. Customer signup includes Thai juristic-person ID lookup. Wallet + tax-invoice + receipt PDFs handle financial data + PII.

**Goals**
Identify vulnerabilities pre-public-beta-expansion. Specifically:
1. OWASP Top 10 across web + admin surfaces
2. RLS bypass attempts
3. Auth/session abuse (Supabase Auth + Google/FB OAuth + LINE)
4. Webhook receiver hardening (MOMO partner, LINE OA, future payment partner)
5. Admin RBAC + audit-log integrity

**Scope** (see §2.1)
**Out-of-scope** (see §2.2)
**Test env**: dedicated staging mirror (we provide)

**Deliverables**
1. Vulnerability findings (Critical / High / Medium / Low / Info severity)
2. Reproduction steps + screenshots/PoC code per finding
3. Remediation guidance per finding (Pacred eng team applies fix)
4. Re-test of patched findings (in engagement)
5. Executive summary (Thai + English, ≤ 5 pages)
6. CVSS v3 score per finding
7. Recommendation: bug-bounty platform setup for ongoing discovery

**Timeline**: 3-4 weeks active + 2 weeks remediation + 1 week re-test
**Communications**: weekly checkpoint with Pacred eng team (ก๊อต + เดฟ + ภูม)
**Compliance**: Thailand PDPA-aware (do not retain real customer data; use staging)

**Quotation requested**: fixed fee, milestone-based payments (30% kickoff / 50% preliminary report / 20% final report).

**Vendor**: please reply with proposed methodology, team CVs (lead + 1-2 testers), past experience with Next.js / Supabase + Thai logistics or fintech.

---

## 7. Open questions for ก๊อต (lock these)

1. **Budget tier:** confirm ฿150-250k range is acceptable for first engagement, or upgrade to Tier-2 (฿800k+)?
2. **Vendor pick:** Aiwen / Stelia / MFEC / other? Recommend Aiwen (smaller, faster, mid-tier price).
3. **Timing:** confirm T+8 to T+13 active testing window. Or wait until 6 months post-launch (more data, more attack surface stable)?
4. **Bug bounty:** approve setup of HackerOne triage program post-pen-test (month-9 timeframe)?
5. **Compliance angle:** Pacred PDPA (Thailand) registration status — required to confirm before any external party sees customer data, even on staging. Verify with Pacred legal / owner.

---

## 8. Acceptance — K-sec-4 done when

- [ ] ก๊อต locks vendor + budget per §7 Q1-2
- [ ] RFP sent to 3 vendors (T+5 weeks)
- [ ] Engagement contracted (T+7 weeks)
- [ ] Testing window executed (T+9-12 weeks)
- [ ] Final report delivered (T+17 weeks)
- [ ] All Critical + High findings patched + re-tested
- [ ] HackerOne bug bounty program live (month-9)
- [ ] Year-2 engagement scheduled

---

## 9. Cross-references

- ก๊อต queue item → [`docs/briefs/got.md`](../briefs/got.md) K-sec-4
- Internal audits this builds on:
  - [`audit/owasp-2026-05.md`](owasp-2026-05.md) — Top 10 self-audit
  - [`audit/rls-and-audit-log-2026-05-16.md`](rls-and-audit-log-2026-05-16.md) — RLS coverage
  - [`audit/legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) §5 — legacy PHP findings (don't repeat there; legacy is retiring)
- Related plans:
  - [`decisions/csp-nonce-migration-plan.md`](../decisions/csp-nonce-migration-plan.md) (CSP-1 — must ship before pen-test)
  - [`runbook/otp-pepper-rotation.md`](../runbook/otp-pepper-rotation.md) (OTP credential rotation runbook)

**End of K-sec-4 plan.** ก๊อต: confirm budget tier + vendor + timing per §7. Execution starts T+4 weeks post-launch.
