# ก๊อต — Senior Advisor / Production Watcher

Last reviewed: 2026-05-18 (post-launch — production live since 2026-05-17)
Branch: `main` (production gatekeeper) · Authority: second-tier owner (per memory `project_authority`)

## 🎯 Current state — DIRECTION PIVOT "D1" (2026-05-18)

🔴 **The owner rejected the rebuilt Pacred app** — its UI *and* its workflow look nothing like the legacy **PCS Cargo** system that staff + ~8,898 customers run on daily. **New direction (D1):** Pacred *becomes* the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`. [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) is **Accepted + ratified 2026-05-18** — read it in full; it is the canonical D1 source of truth and supersedes the Tier 0/1/2/3 capability-roadmap framing of [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

D1 runs in three phases — **A** data migration (pipeline built + dry-run validated, pending prod load) · **B** workflow fidelity · **C** Pacred enhancements (the old Tier roadmap, *deferred not cancelled*).

**ก๊อต now — pickup list (priority order):**

1. ✅ **ADR-0017 ratified (2026-05-18).** ADR-0017 is now "Accepted + ratified" — it supersedes [ADR-0010](../decisions/0010-v2-v3-version-strategy.md)'s "V2 = rebuilt owner-pleaser" definition (V2 is now "faithful PCS port"). Nothing left to do here.
2. **Production-load gate for the data migration.** Phase A loads the legacy `pcsc_main` (117 tables · ~8,898 customers) into prod Supabase — the dry-run reconciled all 117 tables MySQL ↔ PG exactly (0 failures · 0 mismatches). The prod load is gated on เดฟ's review + go; **you are the production-load gate** — review the runbook §6 procedure + §7 open items (the 8 special `PCS<letters>` userIDs, `PR1`–`PR5` numbering) and sign off before the load runs against prod Supabase.
3. **The แต้ม hand-over + build the JMF API.** Two parts: **(a)** Pacred no longer needs the JMF API spec from แต้ม — **ก๊อต builds the JMF API himself (reverse-engineered)**. เดฟ's decode + analog is in [`research/momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md) + [`integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md) — use it as the build reference. (JMF wiring itself is Phase C.) **(b)** Fetch the **customer image/file storage** from แต้ม (`images/users`, `images/shops`, `storage/file`, `storage/slip`) so migrated customers keep continuity — order history + documents. The final `pcsc_main` cutover dump remains an A-5 input.
4. **Production watch** — Sentry alert watch on the currently-live `main` (error spike >5/hr → war-room with เดฟ) + any owner escalation from ลูกพี่/พี่ป๊อป.

**Defer-able items waiting for ก๊อต re-engagement (now post-Phase-A/B):**
- R1 china-search eval (re-open if "can't add URL" tickets surface)
- V3 ADRs (0011 RBAC + 0012 frontend shell + 0013 migration) — revisit after the faithful port is stable
- The Tier-0 dashboard + the Tier 0/1/2/3 capability roadmap — re-sequenced to **Phase C** (the conversion-visibility / monitoring work waits for the faithful port)

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

## 🚀 D1 focus (read FIRST)

The owner rejected the rebuild on 2026-05-18 — Pacred pivots to a **faithful port** of the legacy PCS Cargo system (`PCS` → `PR`). The lens for D1: fidelity to the legacy PCS system — staff and customers must need *zero* retraining. Plan work properly; don't skip the quality gate.

**Your job under D1:** ~~ratify ADR-0017~~ (✅ done) · gate the production data-load (the 117-table migration into prod Supabase) · **build the JMF API yourself** (reverse-engineered — แต้ม no longer supplies the spec) + fetch the customer image/file storage from แต้ม · keep gating `dave→main` deploys for the Phase-B work · watch production. The Tier-0 dashboard + the capability roadmap are deferred to Phase C.

---

## 🔒 Force-read before any work

1. **[`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)** — ADR-0017, the canonical D1 source of truth — ✅ ratified 2026-05-18
2. **[`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)** — the Phase-A migration runbook — review §6 (prod-load procedure) + §7 (open items) for your production-load gate
3. [`docs/research/momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md) — the JMF/MOMO API decode — your **build reference** for the JMF API you build yourself
4. [`docs/team.md`](../team.md) §1 (roles) + §3 (daily workflow) + §5 (pre-merge checklist)
5. [`docs/decisions/0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md) — V2 scope (superseded by ADR-0017: V2 = "faithful PCS port")
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
| Pacred owner / แต้ม not responding | Review the Phase-A migration runbook ahead of the production-load gate |
| Waiting on แต้ม for the customer image/file storage | Build the JMF API (reverse-engineered — no spec dependency) · review the staged `dave` Phase-B integration ahead of the deploy gate |
| Phase-A prod load not yet ready (waiting on แต้ม's files / fresh dump) | Take a scheduled-security item (CSP-1 plan review / pen-test RFP prep) |

**Note back to เดฟ when:** you sign off the production-load gate, decide a strategic direction, or request anything from the Pacred owner / แต้ม.

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
