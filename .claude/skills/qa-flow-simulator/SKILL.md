---
name: qa-flow-simulator
description: Verify that user FLOWS actually work end-to-end — not just that routes don't 500. Fires on — "run test cases", "did the flow actually work", "functional verification", "walk the billing flow", "E2E test", "simulate a QA tester / จำลองเอเจ้นรัน test case", "the UPGRADE_PLAN §0 gate", before any dave→main deploy, or after a flow-touching merge. An agent simulates a real customer/admin journey step by step and asserts the observable outcome.
---

# QA Flow Simulator

> **Why this exists.** `pnpm verify` proves code compiles. `pnpm test:unit` proves pure functions are correct. The `next start` + curl smoke proves routes don't 500. **None of them prove a flow works.** A `200` from `/register` does not mean an account was created. A `200` from the pay button does not mean the wallet was debited *exactly once*. This skill walks real user journeys — an agent simulating a customer or admin — and asserts the **observable outcome**, not the status code. It is the "live functional verification" the [`UPGRADE_PLAN.md`](../../../docs/UPGRADE_PLAN.md) §0 gate demands. เดฟ asked for it: *"จำลองเอเจ้น รัน test case"*.

## What a "test case" is here

A named user journey with four parts:

1. **Preconditions / data** — what must exist first (a migrated DB, a seeded customer, an unpaid order).
2. **Ordered steps** — the clicks / requests a real user makes.
3. **Expected observable outcome** — a DB row, a balance delta, a redirect, a visible element, a notification. **Never "page returns 200".** Instead: *"after step 4, `wallet_transactions` has exactly one new `order_payment` row of amount X, and `wallet.balance` dropped by exactly X."*
4. **Cleanup** — the junk rows the case created (it runs on dev — clean up after).

## The loop

```
┌─ 1. ENUMERATE ─ list the launch-critical journeys (see flow catalogue below) ─┐
                              ↓
┌─ 2. SPEC ─ write each as a test case: preconditions · steps · expected outcome ┐
                              ↓
┌─ 3. PREP ─ pnpm build && pnpm start · OTP_BYPASS=true · dev Supabase ──────────┐
│   note which migrations the dev DB actually has (un-migrated table = a         │
│   PRECONDITION gap, ⚠️ blocked — NOT a 🔴 code failure)                         │
                              ↓
┌─ 4. EXECUTE ─ drive each case (browser / scripted HTTP / action call) ─────────┐
│   capture evidence per step — HTTP code · the DB row · a screenshot            │
                              ↓
┌─ 5. ASSERT ─ pass / fail / blocked per case AND per step ──────────────────────┐
                              ↓
┌─ 6. ANALYZE ─ for each 🔴, theory-of-failure before touching code ─────────────┐
│   (hand off to the phase-verify-loop skill)                                    │
                              ↓
┌─ 7. REPORT ─ a pass/fail matrix + evidence + the analyzed failures ────────────┐
                              ↓
┌─ 8. LOOP ─ after a fix, re-run the failed cases + the ones they could touch ───┘
```

## Execution methods (pick per flow)

| Method | Best for | How |
|---|---|---|
| **Browser automation** | UI-heavy flows · client JS · visual proof | `mcp__Claude_Preview__*` or `mcp__Claude_in_Chrome__*` — drive the real page |
| **Scripted HTTP** | backend flows · CI-friendly · fast | `curl` with a cookie jar (`-c jar -b jar`) — hit real routes + form posts |
| **Action + DB assert** | pure backend logic | invoke the server action, then query Supabase to assert the row |

**Most robust pattern:** drive the UI/HTTP for the action, **then query the DB** to assert the outcome. A flow that "looks done" in the UI but wrote nothing is the exact bug this skill exists to catch.

## Prep — Pacred-specific

- `pnpm build && pnpm start` — a **prod build**, same artifact a deploy ships (not `next dev`, which masks dynamic-render bugs).
- `OTP_BYPASS=true` in `.env.local` → any OTP code is accepted, so register / login / phone-change run unattended.
- **dev Supabase only — never prod.** QA creates junk rows.
- Record the dev DB's migration level. A case whose table isn't migrated = ⚠️ **blocked** (precondition gap), report it as such — do not call it a 🔴 failure.
- Use a scratch identity prefix (phone / email) you can grep + delete afterward.

## Pacred flow catalogue — the test cases (keep this current)

| Area | Case | Assert the outcome |
|---|---|---|
| **Auth** | register (2-step + OTP) | `profiles` row created · `member_code` = `PR###` (min 3 digits) |
| | login phone+OTP · login email+pass · forgot-password · phone-change | session cookie set · phone-change is OTP-gated |
| **Customer money** | wallet deposit / withdraw request | a `pending` `wallet_transactions` row |
| | pay-order-from-wallet | **exactly ONE** `order_payment` debit · `wallet.balance` −X once · no double-debit on double-click (F-11) |
| | yuan transfer | `yuan_payments` row · balance debited if paid-from-wallet |
| **Customer orders** | place shop order · place freight import | `service_orders` row + `h_no` · `forwarders` row + `f_no` |
| | track shipment by code | the timeline renders the real status |
| **Admin** | approve deposit / withdraw | balance credited/debited · `admin_audit_log` row |
| | issue tax invoice · freight invoice + WHT gate | invoice row · WHT choke-point enforced |
| **RBAC (F-2)** | `driver`/`warehouse` admin hits `/admin`, `/admin/wallet`, `/admin/reports` | **refused** (404 / redirect) — *and* allowed `/admin/driver-runs` |
| **Cross-cutting** | i18n th⇄en on a sampled page | both render, no missing-key fallback |
| | overdraw guard | stacked pending withdraws cannot push `wallet.balance` < 0 |
| | refund path (U1) | needs migrations `0058`/`0059` — blocked until on the dev DB |

## Spawn as an agent (recommended — this is "จำลองเอเจ้น")

Ideal background-agent work. The spawn brief MUST include:

- ⚠️ **Sync first.** A worktree-isolation agent branches from `origin/main` (the *held* production branch — stale). Tell it: *"run `git fetch origin && git merge origin/dave` before anything"* — see [`docs/learnings/ci-and-deploy-gotchas.md`](../../../docs/learnings/ci-and-deploy-gotchas.md).
- `OTP_BYPASS=true`, dev Supabase, run the catalogue, produce a **pass / fail / blocked matrix** with evidence, do **NOT** push, report back concise.

## Anti-patterns

- **"200 == works."** No — assert the outcome (row · balance · redirect · visible text).
- **Testing against prod.** QA creates junk. dev Supabase only.
- **Missing-table false-fail.** A flow whose migration isn't on the dev DB is ⚠️ blocked (precondition), not 🔴 fail.
- **One mega-test.** Name discrete cases so a failure localises to one journey.
- **No evidence.** Capture the proof (HTTP code + DB row / screenshot) — a failure with no evidence is not actionable.

## When to run

- **Before any `dave→main` deploy** — the `UPGRADE_PLAN.md` §0 "live functional verification" gate.
- After a merge that touches a flow (auth / money / orders / admin).
- Post-incident — turn the bug into a permanent named test case so it can never silently return.

## Example — pay-order-from-wallet, the double-debit case

- **CASE:** "pay shop order from wallet — single debit under double-click".
- **PRECONDITION:** a customer with `wallet.balance` ≥ order total; one unpaid `service_order`.
- **STEPS:** login → open the order → click "ชำระจาก wallet" → fire a 2nd rapid click (2-tab / back-button).
- **EXPECT:** exactly ONE `wallet_transactions` `order_payment` row; `wallet.balance` −total **once**; order → `paid`; the 2nd attempt returns the idempotent result, not a 2nd debit.
- **METHOD:** HTTP-drive the pay action twice concurrently, then `select count(*) from wallet_transactions where reference_id = '<order>'` → must equal `1`.
- This proves the F-11 guard (`wallet_tx_order_payment_uniq` partial-unique index) does its job. A `200` on both clicks would look fine — only the DB count reveals the truth.

## Cross-links

- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — the analyze→fix loop you run on each 🔴.
- [`test-coverage-writer`](../test-coverage-writer/SKILL.md) — the unit/integration layer; this skill is the E2E layer above it.
- [`bug-swarm-loop`](../bug-swarm-loop/SKILL.md) — when a 🔴 is intermittent / hard to repro.
- [`docs/UPGRADE_PLAN.md`](../../../docs/UPGRADE_PLAN.md) §0 — the gate this skill satisfies.
- [`AGENTS.md`](../../../AGENTS.md) §11 — the route-level `next start` smoke this skill goes *beyond*.
