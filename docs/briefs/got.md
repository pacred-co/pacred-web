# ก๊อต — Senior Advisor / Production Watcher

Last reviewed: 2026-05-16 night (+ Part V ADR-0015/0016 hand-off · + docs-dedup decision hand-off · + ADR-0015/0016 pre-answer fastlane เดฟ tonight · + เดฟ preempted 6 ก๊อต P1 items + 3 V3 ADR DRAFTs + K-sec-4 + D-7 + R1 + launch checklist · + cheat-sheet + **DV-2 LIFF + OTP_PEPPER rotation done late-night ลูกพี่**)
Branch: `main` (production gatekeeper) · Authority: second-tier owner (per memory `project_authority`)

> ## 🆕 Prod env changes done 2026-05-16 late-night (ลูกพี่ + เดฟ pair) — **กอตอ่านก่อน touch Vercel**
>
> ลูกพี่ + เดฟ ทำ DV-2 LIFF setup + ปะหลายๆ env hole คืนนี้. **เพื่อ ก๊อต รู้ว่ามีอะไรเปลี่ยน ก่อนเข้า Vercel:**
>
> ### Added (4 new env vars in Vercel)
> | Var | Value (visible part) | Sensitivity | Environments |
> |---|---|---|---|
> | `NEXT_PUBLIC_LIFF_ID` | `2010105778-SaSkkGza` | Public | Prod + Preview + Dev |
> | `LINE_LOGIN_CLIENT_ID` | `2010105778` | Sensitive flag ON | Prod + Preview + Dev |
> | `LINE_LOGIN_CLIENT_SECRET` | (set, channel secret from new LINE Login channel) | Sensitive flag ON | Production ONLY |
>
> New **LINE Login channel "Pacred Login"** was created at LINE Developer Console (alongside the existing Messaging API channel `2009931373`) because LINE policy now requires LIFF on LINE Login channels, not Messaging API. Channel ID = `2010105778`. LIFF endpoint URL set to `https://pacred.co.th/liff/link` (matches `NEXT_PUBLIC_SITE_URL`).
>
> ### Changed (rotated 1 env var)
> | Var | Old value | New value | Reason |
> |---|---|---|---|
> | `OTP_PEPPER` | `change-this-random-string-in-prod` (default placeholder !!) | `<openssl rand -hex 32 generated>` | **Security:** default placeholder was visible in Vercel env list = rainbow-table risk for OTP hashes. Safe to rotate now because `OTP_BYPASS=true` still on → no real OTP rows hashed under old pepper. After `OTP_BYPASS` flips to `false` (DV-3 follow-up), new pepper applies cleanly. See [`runbook/otp-pepper-rotation.md`](../runbook/otp-pepper-rotation.md) for future dual-pepper rotations after launch. |
>
> ### Still TODO — ลูกพี่ ทำต่อ Sunday morning
> - Vercel redeploy to pick up new env (manual or wait for next push to trigger)
> - LIFF smoke test on LINE mobile (open `liff.line.me/2010105778-SaSkkGza` on phone w/ LINE app)
> - `OTP_BYPASS=true → false` flip + verify ThaiBulkSMS sends real SMS (B4 blocker — keys already set by ก๊อต earlier; just flip the flag after smoke)
>
> ### Recommended ก๊อต follow-up (NOT urgent)
> - Rotate LINE_LOGIN_CLIENT_SECRET via LINE Console once → ลูกพี่ sent the secret via chat (low immediate risk because LP-3 LINE Login OAuth not active yet; recommend rotate within 30 days)
> - Confirm `NEXT_PUBLIC_SITE_URL = https://pacred.co.th` is correct canonical (ลูกพี่ verified ตอน DV-2 setup — looks right)
> - Verify `OTP_PEPPER` rotation didn't accidentally break any QA test users (after `OTP_BYPASS=false` flip)
>
> Full audit of env state ตอน screenshot = see `briefs/got.md` History or ask ลูกพี่

---

## 🚀 TEAM-WIDE RUN-LONG MODE ACTIVE (2026-05-16 evening → เดฟ check-in)

ทั้งทีม autonomous mode. ดู [`../runbook/team-status-2026-05-16.md`](../runbook/team-status-2026-05-16.md) — มี cross-dep map + ก๊อต's full run-long queue + escape hatch. **เริ่ม K-12 GTM + K-13 Clarity + DV-1a/b/c parallel signups** (P0, ~2h รวม, ปลดทั้งทีม). When blocked on signups/calls → ADR-0011/0012/0013 หรือ K-sec-2 RLS audit.

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

#### P0.7 — Part V cargo-forensics ADR locks (✅ DONE 2026-05-16 night — ก๊อต ack + เดฟ flip)

ก๊อต said "ทำต่อให้เลย" → เดฟ flipped both ADRs ตาม fastlane pre-answers below. **V-A6 + V-E2 unblocked.** ภูม Monday morning ลุย V-A6 (WHT) ได้ทันที.

| # | Task | Status |
|---|---|---|
| **ADR-0015 lock** | [`0015-withholding-tax-model.md`](../decisions/0015-withholding-tax-model.md) — Status ✅ **Accepted** — 4 Qs resolved (rate set `{1,1.5,2,3,5}` · admin-only V1 · single approver · dedicated `wht-certs`). | ✅ done |
| **ADR-0016 lock** | [`0016-freight-value-model.md`](../decisions/0016-freight-value-model.md) — Status ✅ **Accepted** — 5 Qs resolved (staff-entered rate V1 · Option A · super+accounting single editor · snapshot from `hs_codes` · no new ADR for V-E3/E4). | ✅ done |
| **V-F context** | Skim [`audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) + Part V; own **V-F3** (legacy-infra resilience) inside [`runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md) — you confirm each row's `✅ cut over` (the green light to scrub PCS/ไอแต้ม refs). | ⏳ ก๊อต ~30m |

#### 📋 docs-dedup decision (NEW 2026-05-16 — เดฟ hand-off · DECIDE tonight)

เดฟ asked you to **call this tonight** while you're in `main`. Not revenue / not urgent (docs don't affect production) — but a quick decision, and you're the right reviewer ("คนเฝ้า") because dedup is judgment-heavy.

**Situation:** docs have real duplication. Main offender = **`CLAUDE.md` (550 lines)** — roughly 200–300 lines restate canonical docs:

| CLAUDE.md section | duplicates canonical |
|---|---|
| "Team & Branch workflow" | `docs/team.md` (CLAUDE.md even self-admits "CANONICAL moved to team.md") |
| "Legacy PHP Port Plan" (feature-map + roadmap) | `docs/PORT_PLAN.md` |
| "Conventions" (Routing / Styling / Components) | `docs/conventions.md` |
| "Pacred DNA" / company info | `docs/pacred-info.md` |

New rule just landed (commit `a6fc67d`, `AGENTS.md` §12 / `conventions.md` §13): **every `.md` ≤ 2000 lines · one canonical home per fact.** No file exceeds 2000 today (biggest = `PORT_PLAN.md` 1727 — cap is preventive) but the duplication is real and `CLAUDE.md` is the cleanup target.

**Decide (pick one):**
- **A** — green-light a `CLAUDE.md`-focused dedup now: an agent replaces each restated section with a 1–2 line summary + link to the canonical doc (**pointers, not deletes** — no info lost), verifies `pnpm audit:md`, commits `docs(dedup): …` on `dave` → you review the diff → FF `main`. ~30–40 min agent work + ~10 min your review.
- **B** — defer to a normal supervised session (no rush — docs block nothing).
- **C** — scope differently (e.g. also tidy `team-status` + the role briefs).

**Risk to weigh:** docs are NOT deployed → **zero production risk**. Real risks are only (1) broken cross-links — `pnpm audit:md` (793 links) catches all of them; (2) judgment — some restatement is *intentional* (`CLAUDE.md` is a load-bearing always-loaded primer · `STRATEGY.md` is a deliberate consolidation · briefs are per-role digests). A dedup must KEEP those and cut only genuine rot. That judgment is why เดฟ routed it to you rather than letting an agent decide unsupervised.

**Recommended: A** — safe (pointers + audit gate), `CLAUDE.md` is the clear 80% win, and you're online tonight to review. Say go and an agent executes it; you just review the diff + FF to `main`.

#### 🎯 P0.7-fastlane — ADR-0015/0016 (✅ ALL 9 Qs ACCEPTED 2026-05-16 night)

ก๊อต กลับมา + อ่าน fastlane → ack → เดฟ flip Status → Accepted on both ADRs. **V-A6 (🔴 #1 chat complaint) + V-E2 unblocked.** ภูม Monday morning ลุยได้ทันที.

Resolved-questions sections อยู่ที่ด้านล่างของแต่ละ ADR ([0015](../decisions/0015-withholding-tax-model.md) · [0016](../decisions/0016-freight-value-model.md)) — เก็บไว้สำหรับ trace.

Pre-answers (kept below for posterity):

---

##### ADR-0015 (WHT) — 4 open questions ([file](../decisions/0015-withholding-tax-model.md))

**Q1 — Allowed rate set: `{1, 1.5, 2, 3, 5}` or just `{1, 3}`?**
- **เดฟ recommends: KEEP `{1, 1.5, 2, 3, 5}` in DB check; UI default = 1 (cargo/forwarder) · 3 (pure service).**
- **Why:** `1.5` (transport-specific) · `2` (advertising) · `5` (rent) are unlikely for Pacred today but **adding them costs zero, removing later = migration**. Conservative DB + opinionated UI = cheap insurance.

**Q2 — Customer self-upload of 50 ทวิ in V1?**
- **เดฟ recommends: ADMIN-ONLY V1.** Customer self-upload deferred to V1.1.
- **Why:** Customer-side upload = new UI + RLS + bucket policy + customer instructions = ~4-6h extra. Admin-only V1 ships the gate (the revenue-unblocking thing) in ~2h. V1.1 adds self-upload once staff workflow is validated.

**Q3 — Does `waived` need a second approver?**
- **เดฟ recommends: SINGLE approver + logged reason, role = `super` OR `accounting` (not `ops`).**
- **Why:** Audit row + `waived_reason` already provides accountability (ADR-0014 pattern). Dual-approval = friction during launch when ops just need to unblock a customer. Tighten via follow-up ADR if waivers become frequent (>5/wk).

**Q4 — Bucket: dedicated `wht-certs` or reuse `slips`?**
- **เดฟ recommends: DEDICATED `wht-certs`.**
- **Why:** Different retention class (tax doc → longer legal retention) · different access (admin read vs customer upload) · the precedent `tax-invoices` got its own bucket (migration `0035`). Avoids RLS policy entanglement; trivial to create.

---

##### ADR-0016 (freight value) — 5 open questions ([file](../decisions/0016-freight-value-model.md))

**Q1 — Exchange-rate source: staff-entered · BOT reference · FX API?**
- **เดฟ recommends: STAFF-ENTERED V1, range-guarded.** `rate_source` enum = `{'staff_entered'}` only for V1.
- **Why:** Legacy spreadsheets already do this (frozen rates observed: 31.4109 / 32.8526 / 33.162). FX API = vendor selection + cost + external dep before freight volume justifies. Add `bot_reference` / `fx_api` as enum values later when volume warrants.

**Q2 — VAT plans: Option A (calculator UI · store committed only) or B (stored what-if history)?**
- **เดฟ recommends: OPTION A V1** (matches ADR's own recommendation).
- **Why:** Legacy "แผน2 VAT" naming = humans choose, then file = chosen plan. Calculator can hold inputs in URL params (zero loss). Option B migrates cleanly from A later when audit-history demand is real.

**Q3 — Declared-value authority: super + accounting both, or accounting alone? Second approver?**
- **เดฟ recommends: super + accounting both can edit · ops cannot · single editor.**
- **Why:** Audit row + required `declared_value_basis` IS the accountability (per ADR-0014). Gating both ways pre-launch = revenue drag. Compliance line in ADR §Context already covers misdeclaration-prevention intent.

**Q4 — HS-code → duty rate: live + snapshot or fully manual?**
- **เดฟ recommends: SNAPSHOT from `hs_codes` at issuance · overridable + logged** (matches ADR's own recommendation).
- **Why:** Keeps duty honest at issuance (rate changes later don't retro-modify invoice) · override allows edge cases (Form E preference, special declarations) · override writes same audit-row pattern as declared-value.

**Q5 — Does V-E3 (Form E) / V-E4 (D/O letter) need its own ADR?**
- **เดฟ recommends: NO new ADR for V-E3/E4.** Pure templating + data-flow.
- **Why:** Decisions in ADR-0016 + ADR-0006 cover value/invoice. Form E + D/O = PDF generators over existing fields. Content choices (HS-code list embed · port codes pre-populated) → capture in [`docs/port-specs/freight-document-suite.md`](../port-specs/freight-document-suite.md) instead of escalating.

---

**Action — ✅ DONE 2026-05-16 night:**
1. ก๊อต กลับมา + อ่าน fastlane + said "ทำต่อให้เลย" → เดฟ flipped both Status → ✅ Accepted
2. Resolved-questions sections paste-edited into each ADR
3. ภูม Monday morning ลุย V-A6 (🔴) ได้ทันที · V-E2 unblocked สำหรับ Phase I2

#### P1 (production hardening — pre-public-beta)

> 🆕 **เดฟ preempted 4 of 5 P1 items 2026-05-16 night (audits + configs + plans — no risky code changes shipped).** See "P1 preempted output" section below; ก๊อต just reviews + commits the rest.

| # | Task | Effort | Source | Status |
|---|---|---|---|---|
| **K-sec-2** | RLS policy comprehensive audit — every Supabase table | 3–4h | Part O5 Track K3 | ✅ done by เดฟ → [`audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md) |
| **K-sec-3** | Audit log coverage gap report | 1–2h | Part O5 Track K3 | ✅ done by เดฟ → same doc above (combined) |
| **K-sec-4** | External pen test — vendor + scope + timeline | 2–3h plan + exec post-launch | Part O5 Track K3 | ⬜ deferred (post-launch P2) |
| **CSP-1** | CSP migrate from `'unsafe-inline'` to nonce-based per Next 16 docs | ~4h | OWASP P2 | 📋 plan ready by เดฟ → [`decisions/csp-nonce-migration-plan.md`](../decisions/csp-nonce-migration-plan.md); ภูม or เดฟ executes week-2 post-launch |
| **Renovate** | Set up Renovate or Dependabot for auto dep PRs | ~1h | Part O5 K-tooling-2 | ✅ done by เดฟ → [`.github/renovate.json5`](../../.github/renovate.json5); ก๊อต enables Renovate GitHub App + merges onboarding PR |
| **MOMO-2** | (was nested in MOMO-1) reverse-engineer legacy JMF integration | ~2-3h | Part S2 | ✅ done by เดฟ → [`integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md); ก๊อต uses §3 question list when MOMO-1 call happens |
| **V-F3** | Legacy-infra resilience review | ~1h | Part V V-F3 | ✅ done by เดฟ → [`audit/v-f3-legacy-infra-resilience-2026-05-16.md`](../audit/v-f3-legacy-infra-resilience-2026-05-16.md); ก๊อต confirms legacy retirement date |

#### 🆕 P1 preempted output (เดฟ 2026-05-16 night — for ก๊อต review)

6 ก๊อต-queue items done by เดฟ + pushed to dave. ก๊อต just reads + agrees + (if approves) flips status in this file:

1. **K-sec-2 + K-sec-3 combined RLS+audit audit** ([`audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md), 350+ lines) — **verdict: 🟢 strong posture, no blockers.** 58/58 tables RLS-enabled · 4 permissive patterns all justified · 8/8 storage buckets covered · 96 admin actions logged · `is_admin()` correct. Minor polish items (audit-log convention docs · retention policy · /admin/audit UI verify) flagged for V2 long-phase. ก๊อต action: read + agree.

2. **MOMO-2 reverse-engineer + MOMO-1 call prep** ([`integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md), 300+ lines) — JMF (closest analog) integration contract decoded from legacy PHP (PUT 25-field receiver + GET caller patterns). 24 prepared questions for MOMO dev grouped by topic (endpoints / auth / data model / webhook / ops / strategic). ก๊อต action: use §3 question list when making MOMO call. After call → ภูม wires `lib/integrations/momo-jmf/sync.ts` per §4.

3. **Renovate config** ([`.github/renovate.json5`](../../.github/renovate.json5)) — auto-dep PRs with Pacred-specific defaults (weekly schedule · group non-major into 1 PR · auto-merge dev-deps · pin load-bearing packages Next/React/TS/Supabase for manual review). ก๊อต action: install [Renovate GitHub App](https://github.com/apps/renovate) → grant access to pacred-web → merge the onboarding PR Renovate opens.

4. **CSP-1 nonce migration plan** ([`decisions/csp-nonce-migration-plan.md`](../decisions/csp-nonce-migration-plan.md), 250+ lines) — full execution plan (5 inline-script sites inventoried · 4-phase migration · 7-risk register · 4 open Qs). **Not yet implemented** (too risky to ship in same session w/o per-route smoke). ก๊อต action: decide ship-week (recommend week 2 post-launch); ภูม or เดฟ executes per Phase 1-4.

5. **V-F3 legacy-infra resilience review** ([`audit/v-f3-legacy-infra-resilience-2026-05-16.md`](../audit/v-f3-legacy-infra-resilience-2026-05-16.md), 200+ lines) — F1-* risk matrix (none-blocking right now), 7 hardening recommendations R1-R7, cutover gate criteria, recommended drills. ก๊อต action: confirm **legacy retirement target date** (recommend week 8-12 post-launch).

---

#### P1 (production hardening — pre-public-beta — original list for reference)

| # | Task | Effort | Source |
|---|---|---|---|
| **K-sec-2** | RLS policy comprehensive audit — every Supabase table | 3–4h | Part O5 Track K3 |
| **K-sec-3** | Audit log coverage gap report | 1–2h | Part O5 Track K3 |
| **K-sec-4** | External pen test — vendor + scope + timeline | 2–3h plan + exec post-launch | Part O5 Track K3 |
| **CSP-1** | CSP migrate from `'unsafe-inline'` to nonce-based per Next 16 docs | ~4h | OWASP P2 |
| **Renovate** | Set up Renovate or Dependabot for auto dep PRs | ~1h | Part O5 K-tooling-2 |

#### P2 (V3 prep — Track D ADRs) — 🆕 เดฟ preempted all 3 with DRAFTs

| # | Task | Effort | Source | Status |
|---|---|---|---|---|
| **P-38** | ADR-0011 ERP RBAC granular roles per module | 2–3h | Part S2 + ADR-0008 + ADR-0009 | ✅ DRAFT by เดฟ → [`decisions/0011-erp-rbac-granular.md`](../decisions/0011-erp-rbac-granular.md); ก๊อต reviews + answers 5 open Qs + flips Accepted |
| **P-39** | ADR-0012 ERP frontend shell — same app vs separate `erp.pacred.co` | 2–3h | Part S2 | ✅ DRAFT by เดฟ → [`decisions/0012-erp-frontend-shell.md`](../decisions/0012-erp-frontend-shell.md); same review pattern |
| **P-40** | ADR-0013 ERP migration strategy from V2 → V3 | 2–3h | Part S2 | ✅ DRAFT by เดฟ → [`decisions/0013-erp-v2-v3-migration-strategy.md`](../decisions/0013-erp-v2-v3-migration-strategy.md); same review pattern |

#### P3 (Strategic decisions) — 🆕 เดฟ pre-researched 2 of 3 decision matrices

| # | Task | Effort | Source | Status |
|---|---|---|---|---|
| **D-7** | Payment Gateway provider choice (Omise / 2C2P / Stripe TH) for post-beta | Owner-call ~30m + decision | ADR-0004 | 📋 matrix ready by เดฟ → [`decisions/d7-payment-gateway-decision-matrix.md`](../decisions/d7-payment-gateway-decision-matrix.md); **recommend Omise** + ก๊อต confirms with พี่ป๊อป owner call |
| **R1-pick** | China-search replacement (Option A scraper / B Alibaba API / C SaaS) | Owner-call + decision | ADR-0003 | 📋 matrix ready by เดฟ → [`decisions/r1-pick-china-search-options-matrix.md`](../decisions/r1-pick-china-search-options-matrix.md); **recommend defer to T+30d** + SaaS RFP if demand confirmed |
| **K-sec-4** | External pen test — vendor + scope + timeline | 2–3h plan | Part O5 K3 | 📋 plan ready by เดฟ → [`audit/pen-test-plan-2026-05-16.md`](../audit/pen-test-plan-2026-05-16.md); **recommend Aiwen Tech** (~฿150-200k) at T+30d post-launch |
| **Pacred owner call** | bundle: bank/PromptPay/tax-ID/legal name | ~30m | Part Q Bundle 1 | ⏳ ก๊อต-only (call พี่ป๊อป) |

---

#### 📋 Pre-launch checklist (single source of truth for Sunday-night → Monday)

🆕 [`docs/runbook/pre-launch-checklist-2026-05-18.md`](../runbook/pre-launch-checklist-2026-05-18.md) — Sunday-night blockers (B1-B5) + soft blockers + verify gates + T-D1 smoke + Monday timeline + crisis playbook. All in one doc. **Read this on Saturday morning to align day-of work.**

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
