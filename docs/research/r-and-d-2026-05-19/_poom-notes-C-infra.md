# ภูม notes — bucket C (infra: 06 backend + 05 devops)

> Reactions on the two R&D docs from เดฟ's 2026-05-19 deep-dive, through the
> backend / fidelity / Phase-B-sequence lens. Read alongside the source docs:
> [`06-backend-architecture.md`](./06-backend-architecture.md) ·
> [`05-devops-observability.md`](./05-devops-observability.md).
> Cross-refs: [`../poom-phase-b-prep.md`](../poom-phase-b-prep.md) ·
> [`../wave-1-fidelity/_SYNTHESIS.md`](../wave-1-fidelity/_SYNTHESIS.md) §7-§8.

---

## 1. Phase-B fidelity reactions

Most of 06 + 05 is cross-cutting → orthogonal to D1 faithful-port. Only one
proposal carries fidelity risk; the rest are layered AROUND the port, not
ON it.

| Proposal | Replaces a legacy pattern? | Verdict |
|---|---|---|
| 06 §3.1 Inngest queue | No — legacy used cron + manual ops | ✅ orthogonal |
| 06 §3.2 Supabase codegen | No — purely TS type layer | ✅ orthogonal |
| 06 §3.3 `createAdminClient` triage | 🟠 BE CAREFUL — Phase-B reads `tb_*` via admin client *by design* (per `poom-phase-b-prep.md` §3.1 — `tb_*` carries no Pacred RLS) | Triage AFTER Phase B done — else we churn the same files twice |
| 06 §3.4 `partnerFetch()` wrapper | No — adds discipline | ✅ orthogonal (do parallel) |
| 06 §3.10 DB-trigger audit on more money tables | No — replicates 0062 §3 pattern | ✅ orthogonal — and *matches* legacy `tb_history` fidelity |
| 06 §3.12 RLS integration tests | No | ✅ orthogonal — actually GUARDS the W-1 keystone during the rebuilt-era retirement |
| 05 §3.D `withObservability` adoption | No — wraps existing actions | ✅ orthogonal |
| 05 §3.I Preview/staging env | No — pure infra | ✅ orthogonal — and unblocks safe Phase-B migration rehearsal |

🟠 **One soft conflict — 06 §3.3 admin-client triage.** Under coexistence
(`poom-phase-b-prep.md` §3.1) Phase-B actions deliberately use `createAdminClient()`
to read `tb_*` because `tb_*` has no per-user RLS. If we tighten the ESLint
rule now, every Phase-B PR fights it. **Defer §3.3 to Phase C** (post-port).

---

## 2. Phase-B sequence implications

### 06 backend proposals — triage

| Proposal | Land BEFORE Wave-2 / Phase-B or AFTER? | Why |
|---|---|---|
| **§3.2 `supabase gen types` codegen** | 🔴 **BEFORE Wave-2** | The dual-schema window IS NOW. Without typed `Database`, every `tb_*` swap diff (synthesis §7) is a typo waiting to happen. 1-day wire. |
| **§3.8 Phase-A pooling runbook** | 🔴 **BEFORE the prod rerun** | Trivial doc edit; protects against pool exhaustion if เดฟ reloads. |
| §3.10 DB-trigger audit on `freight_invoice_payments` / `tax_invoices` / etc | 🟢 During Phase-B | Pattern matches `tb_history` fidelity — fold into the per-stage migrations. |
| **§3.1 Inngest queue** | 🟡 AFTER B-3 done, BEFORE Wave-3 | MOMO sync is the headline use case but MOMO is Phase-C. The MOMO sync is the *one* Phase-B place a queue would help. Defer the migration of the 7 existing crons — they work today. |
| §3.4 `partnerFetch()` wrapper | 🟢 During Phase-B | Hand-rolled, cheap, lifts all partner calls together. Day-1 dependency for MOMO sync. |
| §3.3 admin-client triage + ESLint | ⚪ Phase-C | Conflicts with the coexistence pattern (§1). Park it. |
| §3.12 RLS integration tests | 🟡 During Phase-B (week 3) | The pre-D1 W-1 keystone is on `profiles`/`wallet_transactions`/etc — NOT on `tb_*`. The RLS test harness needs to cover BOTH schemas during transition. |
| §3.5 Storage lifecycle | 🟡 Before ก๊อต's legacy image fetch | ก๊อต has "fetch the customer image/file storage from แต้ม" on his ADR-0017 list. Lifecycle policy + cost cron MUST land before — else slips/forwarder-covers double overnight with no ceiling. |
| §3.6 caching layer | ⚪ Phase-C | Public landing pages aren't on the Phase-B critical path. |
| §3.7 SMS failover | ⚪ Phase-C | Not blocking; revisit if SMS budget tightens. |
| §3.9 Webhook signature framework | 🟡 When MOMO webhook spec lands | Phase-C-ish but cheap to land. |
| §3.11 Slow-query observability | 🟡 During Phase-B (week 2-3) | Phase A doubled the table count; `pg_stat_statements` will tell us where the dual-schema query plans hurt. |
| §3.13 Sentry deprecation cleanup | ⚪ Whenever | 5-minute hygiene. |

### 05 devops proposals — triage

| Proposal | Phase-B blocking? | Why |
|---|---|---|
| **§3.A env-var flip (Sentry/GTM/Clarity/Upstash/hCaptcha)** | 🔴 **YES** | Phase-B reworks are the highest-leverage moment to have Sentry on — every legacy-workflow regression hits prod. Half-hour dashboard task. Owner: ก๊อต/เดฟ — NOT my lane but I flag it. |
| **§3.B active deploy gate (`/status` as CI check)** | 🔴 **YES** | The launch-day dead-DB story repeats every time we migrate `tb_*` changes through `dave→main`. Before any Phase-B `dave→main` flip. Owner: เดฟ. |
| §3.C Web Vitals | ⚪ Phase-C | Marketing optimisation, not Phase-B. |
| §3.D `withObservability` on revenue actions | 🟢 During Phase-B | Every reworked `tb_*` mutation should land wrapped. Cheap, mechanical. |
| §3.E synthetic uptime | 🟡 Phase-B-helpful | Better Stack external probe = 30 min. Defends Phase-B rollouts. |
| §3.F alert-rule engine | 🟡 Phase-B-helpful | The "incident spike same fingerprint" rule catches a Phase-B regression fast. |
| §3.G cost monitor | ⚪ Phase-C | Important but not blocking. |
| §3.H disaster-recovery | 🟡 Talk to ก๊อต now | PITR decision needs to be made BEFORE Phase-B's heavy `tb_*` rewrites pile up history we'd lose in a snapshot-only world. |
| **§3.I preview / staging env** | 🔴 **YES — biggest Phase-B win** | Every Phase-B migration needs to rehearse against a `dave`-branch Supabase before prod. Vercel Preview + Supabase Branching = config-only. |
| §3.J Better Stack log drain | 🟡 Phase-B-helpful | 20-min hygiene. |
| §3.K-3.M, IO-2/3 | ⚪ Phase-C | Compounding tail. |

**My headline for Phase-B sequence:** 06§3.2 codegen + 05§3.A env-flip +
05§3.B active gate + 05§3.I preview env are the four "do BEFORE Wave-2"
items. Codegen and preview env are real protection for the dual-schema
window — without them, every Wave-2 swap diff is risk.

---

## 3. The §8 ghost-customer finding — how does it intersect with 06/05?

The wave-1-fidelity `_SYNTHESIS.md` §8 finding: **8,892/8,898 migrated
customers have NO `profiles` row.** §8.4 recommends option **(a) bulk
pre-fill** via `0088_pcs_profiles_backfill.sql` + a small bridge extension to
bind `auth.users.id ↔ profiles.id` on first login.

**Does anything in 06 or 05 propose a different approach?** Mostly no —
they don't touch identity provisioning directly. But three indirect
intersections matter:

- **06 §G-2 + §3.3 admin-client triage** would catch the "ghost profiles for
  8,892 customers" as one of the 372 admin-client sites that *legitimately*
  needs the elevation. The triage would correctly classify the bridge code
  as "legitimate elevation" — not a refactor target. **No conflict.**
- **06 §Q3 typed SECURITY DEFINER RPCs for self-serve writes** (deeper-research
  question, Phase-C) would be a *better* long-term home for the
  first-login bridge — `select bridge_legacy_pcs_login(member_code, hashed_password)`
  returns the bound row in one TX. **Phase C; capture in V3 wishlist.**
- **05 §3.D `withObservability` on auth actions** — once Wave-2 ships, wrap
  `bridgeLegacyLogin` so silent first-login failures (the ghost-bind
  failure mode) land in `platform_incidents`. **Do alongside Wave-2.**

**Neither 06 nor 05 proposes lazy / on-demand / trigger-based provisioning
as a competing approach.** Option (a) bulk pre-fill stands — recommend
proceeding as `_SYNTHESIS.md` §8.5 specs, then capture the SECURITY DEFINER
RPC variant in `docs/v3-wishlist.md` for Phase C.

**One add for option (a):** the backfill migration should set a
`profiles.legacy_pcs_pending = true` flag (per §8.5) **AND** the bridge
extension should call `withObservability("bridgeLegacyLogin", ...)` so the
"placeholder UUID never got bound" failure mode (a customer who logs in
once, the bind fails, they retry — duplicate auth.users on the same legacy
row) is observable.

---

## 4. ภูม backend red flags

Concrete things in 06 / 05 that would break Pacred patterns or our
coexistence rules — flagged for the senior lane:

- **🟠 06 §3.3 ESLint rule for `createAdminClient()`** — fires false positives
  on every legitimate Phase-B `tb_*` read (per `poom-phase-b-prep.md` §3.1,
  Phase-B *requires* admin-client reads for `tb_*` because the ported tables
  carry no per-user RLS yet). Defer until Phase C. If we want it sooner, the
  rule needs a `// tb-read: <reason>` magic-comment whitelist mode.
- **🟠 06 §G-8 / §3.8 Phase-A pooler runbook** says batch ≤500 rows on the
  transaction pool — verify with เดฟ that the **production** loader used the
  `:6543` pool (the dry-run was OK; the prod run is what counts). If session-
  pool was used, blast-radius is "exhausted connection cap during the load
  window" — would have crashed the launched app.
- **🟡 06 §3.6 caching with `unstable_cache`** — on `/services/*` reads,
  totally fine. But if anyone gets clever and wraps a `tb_*` admin read,
  stale `tb_*` shown to admins during Phase-B rework. Add the convention to
  the README: **`unstable_cache` is forbidden on `tb_*` reads** until Phase B
  is fully retired.
- **🔴 05 §3.E E-1 internal health probe** writes `platform_events` rows but
  `platform_events` is **NOT YET BUILT** (per 05 §1.2 — `platform_events` is
  the IO-2 design, not shipped). The probe needs a fallback target. Land as
  `cron_invocations` rows for now (per the IO-1 / cron pattern that already
  ships).
- **🟡 06 §3.7 SMS failover** — proposes wiring SMS-MKT as secondary. The
  legacy PHP audit found ThaiBulkSMS-legacy + ThaiBulkSMS-OTPv2 + Tiso AI +
  TechSol-th were all live in legacy. Faithful-port stance says "we should
  match legacy's multi-provider posture" — so this is *not* Phase-C polish,
  it's Phase-B fidelity. Re-rate: 🟡 Phase-B fidelity ask.
- **🟡 No Redis/Upstash dependency creep** — both docs assume Upstash will be
  on (05 §3.A item 4). Today the rate-limit gracefully degrades to
  in-memory. If 05 §3.J log drain or any new feature *requires* Upstash, we
  add a hard dependency on a service that's been opt-in. Keep the
  graceful-degradation invariant.
- **🟢 Auth posture aligns with Q2(a) refined provision-on-first-login.**
  Neither doc contradicts the Q2 answer; option (a) in §8.5 is consistent.

---

## 5. Open infra questions for เดฟ + ก๊อต

| # | Question | Who decides | Why blocked |
|---|---|---|---|
| C-Q1 | **Sentry tier — Free or Team?** Free is fine at current volume, but Web Vitals (05 §3.C) + Phase-B regression load may push past Free's 5k errors/mo. Decide before 3.A env-flip. | ก๊อต | Determines `SENTRY_AUTH_TOKEN` scope + source-map upload setup. |
| C-Q2 | **Supabase PITR — enable or stay snapshot-only?** ~$100/mo. Phase B's `tb_*` rewrites generate history we'd lose in a 24h snapshot window if anything goes wrong mid-port. | ก๊อต | DR posture (05 §3.H-1). Pacred is taking money — RPO ≠ documented. |
| C-Q3 | **Supabase Branching for `dave` previews — enable?** Free for 2 branches. Unblocks 05 §3.I + the Phase-B migration rehearsal pattern. | เดฟ | Phase-B migrations will accumulate. We need to rehearse `0087` + `0088` + future against `dave`-branch DB before prod. |
| C-Q4 | **Inngest sign-up — wait for MOMO sync, or land sooner?** $0 today; the trigger is the MOMO Phase-B / Phase-C sync. | ก๊อต (cost) + เดฟ (timing) | Don't want to install infra-as-a-service we don't need yet, but the MOMO sync benefits hugely. |
| C-Q5 | **8 special legacy userIDs** (`PCSTT`/`PCSCARGO`/…) — these are bot/system accounts in `tb_user`. Bulk pre-fill of §8.5 must decide their fate (skip them? bind a service-role profile?). | ก๊อต | Same as `poom-phase-b-prep.md` §5 Q3. Affects backfill SQL. |
| C-Q6 | **`createAdminClient()` triage in Phase-C — when?** ESLint rule + 372-site sweep is a multi-week project. Calendar slot? | เดฟ | Don't want it in flight during Phase B. Schedule for Phase-C-1. |
| C-Q7 | **Storage lifecycle policy — confirm before ก๊อต's legacy image fetch?** Lifecycle cron must be deployed BEFORE ก๊อต pulls the legacy media (06 §3.5). | ก๊อต + ภูม | Order matters; ~3 days work, ~1 day blocker on the import. |

---

## 6. Phase-C infra priority (backend lens)

**ONE backend thing — adopt 06 §3.2 Supabase codegen + Drizzle migration
plan (Phase-C).** Codegen lands NOW (Phase-B-blocking, my §2). The
**Drizzle migration** to follow in Phase-C is the highest-leverage backend
investment — it turns the 87-migration + 117-`tb_*` + N rebuilt-era table
mess into a single source of truth, gives compile-time safety on every
join, and aligns the team on one query-builder dialect. Without it, the
`tb_*` retirement work in Phase C touches 699 query call sites by hand;
with it, the LSP shows us every dependency. Justify: stability + safe
retirement of the rebuilt-era shims = the biggest Phase-C deliverable.

**ONE devops thing — 05 §3.I preview + staging env (Vercel Preview +
Supabase Branching).** Phase C is when Pacred LAYERS enhancements onto the
faithful port — that's exactly when "experimental change broke prod"
becomes the failure mode. Today every push to `main` lights up prod;
neither the launch-day deleted-Supabase incident nor the dead-DB blind
spot can ever repeat with a preview env. Free on both Vercel Pro + Supabase
Pro, ~half-day to wire. Compounding return: every Phase-C experiment,
every migration rehearsal, every `qa-flow-simulator` run, every DR drill
(§3.H-3) depends on this being in place.

**(Honourable mention — 06 §3.1 Inngest.)** Best single infra primitive
for Phase-C reliability (MOMO sync · scheduled customer broadcasts ·
multi-step jobs). I'd take it third after codegen + preview env.

---

**End — `_poom-notes-C-infra.md`.** Bucket C reviewed.
