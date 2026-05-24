# ก๊อต — Senior Advisor / Production Watcher / **Admin 1:1 Lead (NEW 2026-05-24)**

Last reviewed: 2026-05-24 (strategy reset — admin lane moves to you · V3 unlocked for ภูม)
Branch: `main` (production gatekeeper + own commits for admin 1:1) · Authority: second-tier owner

> ## 🚨 2026-05-24 STRATEGY RESET (READ FIRST)
>
> Owner cleaned up branch model and **assigned you the admin 1:1 lane** (was ภูม pre-reset). ภูม returns to V3 backend continuation on `Poom-pacred` (now UNLOCKED).
>
> **Your two hats:**
> 1. **Production gate** (unchanged) — review + ship to main
> 2. **Admin 1:1 transcription lead (NEW)** — port the 187 `pcs-admin/*.php` files to `app/[locale]/(admin)/`
>
> **Active branches (6 — `faithful-port` deleted, `claude/*` cleaned):**
> | Branch | Owner | Purpose |
> |---|---|---|
> | `main` | YOU (gate + admin commits) | Production |
> | `dave-pacred` | เดฟ | 1:1 customer-backend + integration; pushes to main |
> | `podeng` | ปอน | Frontend; merged via dave-pacred |
> | `Poom-pacred` | ภูม | V3 backend (UNLOCKED) — merges after 1:1 |
> | `dave` / `Poom` | archive | pre-1:1 working branches, frozen |
>
> **Flow:** ปอน + ก๊อต admin + เดฟ customer → main · ภูม V3 → main *after* 1:1 ships
>
> **Just landed on dave-pacred (commit `d7b1758`):** ปอน's 4 commits (home polish + (protected) chrome rebuild in Tailwind). เดฟ verifies + pushes to main next. Watch for it.
>
> **READ FIRST:**
> - [`docs/research/d1-deep-audit-2026-05-24.md`](../research/d1-deep-audit-2026-05-24.md) — 10 critical gaps + sprint sequence + open questions for owner
> - [`docs/runbook/faithful-port-plan.md`](../runbook/faithful-port-plan.md) — updated branch model
> - [`docs/runbook/faithful-port-transcription.md`](../runbook/faithful-port-transcription.md) — the 1:1 method (you'll follow this)
> - Admin pilot reference: `app/[locale]/(admin)/admin/admins/page.tsx` (ภูม's `admin-table.php` transcription)
>
> **Open questions for owner / team** (also in deep-audit §6):
> 1. Coordination split between you (admin 1:1) and ภูม (V3 admin enhancements)
> 2. TAMIT real-time vs delayed verification — your call
> 3. LINE Notify EOL April 2025 — port per-user OAuth or migrate to LINE Messaging API model?
> 4. CargoThai (`api.newcargothai.net`) — still active partnership?
> 5. Customer image migration (37GB rar) — when can you provision disk for extraction?

## 🎯 Direction — D1: Pacred is a faithful PCS Cargo port

🔴 The owner rejected the rebuilt Pacred app — its UI *and* its workflow look
nothing like the legacy **PCS Cargo** system that staff + ~8,898 customers run
on daily. **D1:** Pacred *becomes* the legacy PCS Cargo system, faithfully —
rebranded `PCS` → `PR`. Owner rule (verbatim): **"copy the original to 100%
sameness FIRST, then improve."** Canonical SOT →
[`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
— ✅ Accepted + ratified 2026-05-18; read it in full. It supersedes the
Tier 0/1/2/3 framing of [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

Three phases: **A** data migration · **B** workflow fidelity · **C** Pacred
enhancements (the old Tier roadmap, *deferred not cancelled*).

## 🟢 Where the project is now

- 🟢 **Phase A** — legacy `pcsc_main` (117 tables · 8,898 customers) business
  data **LOADED to dev + prod Supabase**; migrations `0081`-`0083` + `0087` on
  `dave`. *Remaining:* 3 oversized log tables + customer images — backfill
  after the Supabase Pro upgrade (imminent — แต้ม's image data already received).
- 🟢 **Phase B** — **wave 1 done + integrated**: customer 9-icon launchpad ·
  customer order flow · admin per-role RBAC sidebar + badges · admin container
  `tb_cnt` payment ledger · ภูม's legacy-auth bridge. Wave 1 is a *first pass* —
  not yet element-by-element fidelity-verified.
- ⚪ **Phase C** — deferred (Tier roadmap · ads/marketing · 8-specialist R&D).

## 🧭 Your lane — PRODUCTION GATE + PROVISIONING (senior)

You + เดฟ are the **senior lane**; ปอน + ภูม execute. You hold the production
boundary and unblock the team's external dependencies. Concretely you:

- **Gate `dave → main`** with เดฟ — review the staged Phase-B work, approve the
  deploy, run the production smoke gate. Nothing ships before it's green.
- **Buy the Supabase Pro upgrade** — Phase A's backfill of the 3 log tables +
  customer images is blocked on it (free tier caps a DB at 500 MB; the log
  tables alone are ~779 MB). This unblocks เดฟ — do it first.
- **Hand over แต้ม's customer images** — fetch the customer image/file storage
  (`images/users`, `images/shops`, `storage/file`, `storage/slip`) so migrated
  customers keep order-history + document continuity; pass it to เดฟ for the
  Phase-A backfill.
- **Ratify the auth-bridge pattern** — ภูม's Phase-B open-question **Q2**
  (legacy auth-bridge session pattern) carries เดฟ's lean but needs your sign-off
  before B-auth ships → [`research/poom-d1-open-questions.md`](../research/poom-d1-open-questions.md).
- **Watch production** — Sentry on the live `main` (error spike >5/hr →
  war-room with เดฟ) + handle owner escalations.

## 🟡 Your pickup list (priority order)

1. **Buy the Supabase Pro upgrade.** It is the single blocker on Phase A's
   completion — เดฟ cannot backfill the 3 log tables or the customer images
   until the DB cap lifts. Do this first.
2. **Hand แต้ม's customer images to เดฟ.** แต้ม's image data is already received
   — package `images/users` / `images/shops` / `storage/file` / `storage/slip`
   and pass it to เดฟ so the Phase-A backfill can run after the Pro upgrade.
3. **Ratify the auth-bridge pattern (poom Q2).** Review ภูม's Q2 in
   [`research/poom-d1-open-questions.md`](../research/poom-d1-open-questions.md),
   confirm or amend เดฟ's lean — B-auth is gated on this.
4. **Gate `dave → main`.** As Phase-B waves land on `dave`, review + run the
   production smoke gate, then merge to `main`.
5. **Production watch** — Sentry alert watch on the live `main`; handle any
   owner escalation.

**Phase C (deferred — not a current pickup):** the **JMF API build** —
reverse-engineer it yourself (no spec dependency on แต้ม); build reference =
[`research/momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md) +
[`integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md). The
Tier 0/1/2/3 capability roadmap + the V3 ADRs (0011/0012/0013) also wait for
Phase C — revisit once the faithful port is stable.

## ✋ Non-collision rule

ปอน = customer-facing frontend surfaces. ภูม = backend (admin routes + server
actions + `tb_*` queries). เดฟ integrates + drives Phase A. You gate `main` +
provision. **One owner per surface** — coordinate via เดฟ before anyone takes a
fresh surface.

## 🔒 Force-read before any work

1. [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
   — ADR-0017, the canonical D1 SOT (✅ ratified)
2. [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — the
   Phase-A runbook (the backfill the Pro upgrade unblocks)
3. [`research/poom-d1-open-questions.md`](../research/poom-d1-open-questions.md)
   — ภูม's Q2 auth-bridge pattern awaits your ratification
4. [`team.md`](../team.md) §1 (roles) + §3 (daily workflow) + §5 (pre-merge checklist)
5. [`audit/owasp-2026-05.md`](../audit/owasp-2026-05.md) — production hardening status
6. [`pacred-info.md`](../pacred-info.md) — company DNA SOT

## Who you are

**Senior Advisor + Production Watcher.** You operate from `main`. You don't
write feature code routinely — you lock decisions / write ADRs that direct ภูม +
ปอน, approve `dave → main` merges, pick tools / partners / API providers,
provision external services, audit security + RBAC + architecture, and cover ภูม
on hard / decision-heavy / confidential work.

## Locked decisions (ADRs you own)

ADR-0003 china-search · 0004 payment gateway · 0005 launch ops · 0006 tax
invoice · 0007 analytics + A/B · 0010 V2 vs V3 · **0015 WHT + 0016 freight
value** (✅ Accepted 2026-05-16) · **0017 faithful PCS port** (✅ ratified
2026-05-18). V3 ADRs 0011/0012/0013 — DRAFT, deferred to Phase C. Files in
[`decisions/`](../decisions/).

## 🆕 Prod env state (Vercel — reference)

LINE Login + LIFF env vars are set (`NEXT_PUBLIC_LIFF_ID`,
`LINE_LOGIN_CLIENT_ID`, `LINE_LOGIN_CLIENT_SECRET`); a separate "Pacred Login"
LINE Login channel (`2010105778`) was created — LINE policy requires LIFF on
LINE Login channels. `OTP_PEPPER` was rotated off the default placeholder.
**Recommended follow-up (not urgent):** rotate `LINE_LOGIN_CLIENT_SECRET`
within 30 days (sent over chat; LINE Login OAuth not active yet).

**Scheduled post-launch security work:** CSP-1 nonce migration (week-2 post
launch — plan [`decisions/csp-nonce-migration-plan.md`](../decisions/csp-nonce-migration-plan.md)) ·
K-sec-4 external pen test (Aiwen Tech, T+8-13wk — plan
[`audit/pen-test-plan-2026-05-16.md`](../audit/pen-test-plan-2026-05-16.md)).

## Blockers + alternatives

| Blocked on | Alternative work |
|---|---|
| Supabase Pro purchase not yet done | Hand แต้ม's images to เดฟ; review the Phase-A runbook; ratify poom Q2 |
| Owner / แต้ม not responding | Review staged `dave` Phase-B work ahead of the deploy gate |
| No `dave` deploy ready to gate | Take a scheduled-security item (CSP-1 plan review / pen-test RFP prep) |

**Note back to เดฟ when:** you finish the Pro upgrade, hand over the images,
ratify a pattern, or sign off a deploy.

## Hand-offs

**IN** — เดฟ stages `dave` + sends a review request · ภูม writes ADR drafts you
finalise. **OUT** — Supabase Pro + แต้ม's customer images → เดฟ (Phase-A
backfill) · ratified auth-bridge pattern → ภูม · approved `main` commits →
production · ADRs → ภูม implements, เดฟ schedules.

## Push discipline (per memory `push_frequency_strict`)

Commit local often; **push only at save-points** (end of session / before sleep
/ machine change / big batch done). ~1 push per session.

## Cross-links

- [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — D1 SOT
- [`team.md`](../team.md) §1 — your role definition
- [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — Phase-A runbook
- [`research/poom-d1-open-questions.md`](../research/poom-d1-open-questions.md) — poom Q2 (your ratification)
- [`research/momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md) — JMF build reference (Phase C)
- [`decisions/`](../decisions/) — your ADRs
- [`audit/`](../audit/) — your audits
