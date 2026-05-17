# ก๊อต — Senior Advisor / Production Watcher

Last reviewed: 2026-05-18 (post-launch — production live since 2026-05-17)
Branch: `main` (production gatekeeper) · Authority: second-tier owner (per memory `project_authority`)

## 🎯 Current state — POST-LAUNCH (production live since 2026-05-17)

🟢 Pacred launched. All pre-launch P0/P1/P3 cleared. The canonical forward roadmap is [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) — read it first; the post-launch capability synthesis [`research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) seeded it and its §"Work split" table puts the Tier-0 dashboard on ก๊อต + เดฟ.

**ก๊อต now — pickup list (priority order):**

1. **Tier-0 dashboard (with เดฟ)** — flip the monitoring env vars in Vercel (Sentry / GTM / GA4 / Clarity / hCaptcha / Upstash) · verify Google Search Console + submit the sitemap · claim Google Business Profile · set up Meta Business Suite. *The conversion-visibility unblock — Pacred runs ads today with no conversion tracking.* Checklist → [`runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md).
2. **Gate the `dave→main` deploy** — review the staged `dave` integration; fast-forward `main` once ภูม clears the migration gate (`0058`-`0080` on prod Supabase).
3. **Clear the MOMO API docs** — the on-record MOMO API host/format is wrong; ก๊อต clears it so ภูม can wire the U1-7 sync. See [`integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md) — เดฟ already reverse-engineered the JMF analog + prepared the question list.
4. **Production watch** — Sentry alert watch (error spike >5/hr → war-room with เดฟ) + any owner escalation from ลูกพี่/พี่ป๊อป.

**Defer-able items waiting for ก๊อต re-engagement T+30d post-launch:**
- R1 china-search eval (re-open if >10 "can't add URL" tickets/wk surfacing in Sentry)
- V3 ADRs (0011 RBAC + 0012 frontend shell + 0013 migration) — revisit after V2 stable + real ops-staff feedback
- Renovate GitHub App install (config `.github/renovate.json5` already in place — re-open if dep drift accumulates)

**Scheduled post-launch security work (decided pre-launch, executes on schedule):**
- **CSP-1 nonce migration** — ship week-2 post-launch (≈ Mon 2026-06-01): Sentry CSP reports + 48h Report-Only soft-launch + zero-violations enforce gate. Plan → [`decisions/csp-nonce-migration-plan.md`](../decisions/csp-nonce-migration-plan.md). ภูม or เดฟ executes Phase 1-4.
- **K-sec-4 external pen test** — Aiwen Tech ฿150-200k Tier-1, exec window T+8-13wk. RFP fan-out at T+5wk (Aiwen + Stelia + MFEC); HackerOne month-9. Plan → [`audit/pen-test-plan-2026-05-16.md`](../audit/pen-test-plan-2026-05-16.md). เดฟ tickle calendar 2026-06-22.

---

## 🆕 Prod env state (Vercel — reference for the Tier-0 dashboard work)

The factual record of what is set in Vercel — useful when ก๊อต flips the remaining Tier-0 monitoring env vars. DV-2 LIFF setup + env-hole patching was done 2026-05-16 (ลูกพี่ + เดฟ pair).

### LINE Login channel + LIFF env vars (set)
| Var | Value (visible part) | Sensitivity | Environments |
|---|---|---|---|
| `NEXT_PUBLIC_LIFF_ID` | `2010105778-SaSkkGza` | Public | Prod + Preview + Dev |
| `LINE_LOGIN_CLIENT_ID` | `2010105778` | Sensitive flag ON | Prod + Preview + Dev |
| `LINE_LOGIN_CLIENT_SECRET` | (set, channel secret from new LINE Login channel) | Sensitive flag ON | Production ONLY |

A separate **LINE Login channel "Pacred Login"** (channel ID `2010105778`) was created alongside the Messaging API channel `2009931373` — LINE policy requires LIFF on LINE Login channels, not Messaging API. LIFF endpoint URL = `https://pacred.co.th/liff/link` (matches `NEXT_PUBLIC_SITE_URL`).

### Rotated env var
| Var | Change | Reason |
|---|---|---|
| `OTP_PEPPER` | default placeholder → `openssl rand -hex 32` value | Security: default placeholder was visible in the Vercel env list = rainbow-table risk for OTP hashes. Safe — `OTP_BYPASS=true` meant no real OTP rows were hashed under the old pepper. Future dual-pepper rotations → [`runbook/otp-pepper-rotation.md`](../runbook/otp-pepper-rotation.md). |

**Recommended ก๊อต follow-up (not urgent):** rotate `LINE_LOGIN_CLIENT_SECRET` within 30 days (it was sent over chat; low immediate risk — LINE Login OAuth not active yet).

---

## 🚀 Post-launch focus (read FIRST)

Pacred launched 2026-05-17 — the emergency "เผาเงิน" framing is over. The lens stays revenue-aware: prefer work that makes the product more **true** / **billable** / **measurable**. Plan work properly now — don't skip the §0 gate or ship half-built to chase a deadline.

**Your job post-launch:** gate `dave→main` deploys · finish the Tier-0 dashboard (the conversion-visibility unblock) · clear partner-API decisions for ภูม · watch production.

---

## 🔒 Force-read before any work

1. **[`docs/UPGRADE_PLAN.md`](../UPGRADE_PLAN.md)** — THE canonical forward roadmap (post-launch phase/stage plan)
2. [`docs/research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) — the Tier 0/1/2/3 synthesis + work-split that seeded the roadmap
3. [`docs/team.md`](../team.md) §1 (roles) + §3 (daily workflow) + §5 (pre-merge checklist)
4. [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V/W — the cargo + gap-hunt backlogs the roadmap draws from
5. [`docs/decisions/0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md) — V2 scope rules (DON'T refactor V2 → V3 mid-flight)
6. [`docs/audit/owasp-2026-05.md`](../audit/owasp-2026-05.md) — production hardening status
7. [`docs/pacred-info.md`](../pacred-info.md) — company DNA SOT

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

## Locked decisions (ADRs you own — already accepted)

ADR-0003 china-search vendor cutoff · ADR-0004 payment gateway · ADR-0005 launch ops K-4..K-7 · ADR-0006 tax invoice flow · ADR-0007 analytics + A/B · ADR-0008 DPX ERP phase 2 (draft) · ADR-0009 ERP schema sketch (draft) · ADR-0010 V2 vs V3 · **ADR-0015 WHT + ADR-0016 freight value** — ✅ both Accepted 2026-05-16 (9 open Qs resolved). Files in [`docs/decisions/`](../decisions/).

V3 ADRs **0011 / 0012 / 0013** — DRAFT by เดฟ, deferred T+30d post-launch (decide all three together once V2 is stable + there's real ops-staff feedback).

---

## Blockers + alternatives

When you're blocked:

| Blocked on | Alternative work |
|---|---|
| Pacred owner not responding | Take a scheduled-security item (CSP-1 plan review / pen-test RFP prep) |
| Waiting on a MOMO call back | Review the staged `dave` integration ahead of the deploy gate |
| `dave→main` gate not yet cleared by ภูม | Tier-0 dashboard work (env vars / GSC / Google Business / Meta) |

**Note back to เดฟ when:** you decide a strategic direction, sign up for any external service, or request anything from the Pacred owner.

---

## Hand-offs IN (other people's outputs you consume)

- **เดฟ** stages `dave` + sends a review request → you review + merge `dave→main`
- **ภูม** writes ADR drafts → you finalise + lock
- **Claude agents** push hand-off entries to [`PORT_PLAN.md`](../PORT_PLAN.md) Part S → you tick off + commit

## Hand-offs OUT (what you produce that others consume)

- ADRs in [`docs/decisions/`](../decisions/) → ภูม implements; เดฟ schedules
- External env credentials (in Vercel) → ภูม / เดฟ activate features that depend on them
- Approved `main` commits → production deployment
- Security audit findings → ภูม + เดฟ patch
- Tool/partner picks (MOMO, payment gateway, scraper replacement) → ภูม wires; เดฟ documents

---

## Push discipline (per memory `push_frequency_strict`)

- Commit local often during a work session
- **Push only at save-points** (end of session / before sleep / machine change / big batch done)
- Target ~1 push per work session — not per commit

## Cross-links

- [`docs/team.md`](../team.md) §1 — your role definition + scope boundaries
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part S — current hand-off batch
- [`docs/decisions/`](../decisions/) — your ADRs
- [`docs/audit/`](../audit/) — your audits
