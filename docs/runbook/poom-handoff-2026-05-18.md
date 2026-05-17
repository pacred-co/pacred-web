# 🤝 ภูม hand-off — 2026-05-18

> **For: ภูม.** เดฟ consolidated the whole team's work into `dave` overnight + after your usage-limit reset. Read this first when you start your session — it is your priority order: what's done, what's blocked on you, what's next.
>
> Pairs with [`poom-apply-migrations-2026-05-17.md`](poom-apply-migrations-2026-05-17.md) (your apply procedure) + [`team-status-2026-05-17.md`](team-status-2026-05-17.md).

## Branch state

| Branch | Commit | Meaning |
|---|---|---|
| `main` | `314a528` | **PRODUCTION — live + verified healthy.** 19 migrations (`0044`-`0064`) on prod Supabase. |
| `dave` · `Poom` · `podeng` | `5f404aa`* | integration — **all 3 synced 100%.** Has everything below. `pnpm verify` + `pnpm build` green. |

\* `dave` advances by one docs commit (this hand-off). `dave` is **31+ commits ahead of `main`**. Everything you pushed (U1 + U2) is consolidated + distributed — your `Poom` branch already equals `dave`. To sync locally: `git checkout Poom && git merge origin/Poom` (clean fast-forward).

## What is consolidated into `dave` (do NOT re-do these)

**Your work — all merged + distributed:**
- U1 wire-the-flow — container unify · freight chain · refund money path · post-U1 audit fixes (migrations `0058`/`0059`/`0066`)
- U1-3 — arrival→billing gate (`lib/forwarder/billing-gate.ts`)
- U2-1 — PCS→Pacred customer migration (migration `0067` + `actions/admin/pcs-migration.ts` + admin panel)
- U2-5 — cargo_sacks entity / กระสอบรวม (migration `0068` + `lib/warehouse/sacks.ts`)

**เดฟ-side additions — know about these so you don't duplicate:**
- **7 new test files / 286 assertions** cover YOUR validators — refund · commission · customs-declaration · freight-shipment · accounting-period · broadcast · billing-gate. เดฟ wrote them (you defer tests — these are done, wired into `test:unit`). Don't re-write.
- **`qa-flow-simulator`** — skill #10 (`.claude/skills/qa-flow-simulator/`) — agent-driven end-to-end flow verification; it is the UPGRADE_PLAN §0 functional-gate tool.
- [`launch-monitoring-golive-2026-05-17.md`](launch-monitoring-golive-2026-05-17.md) — the U1-8 monitoring flip checklist (Sentry/GTM/Clarity/hCaptcha/Upstash all verified wired + graceful).
- [`../research/qa-flow-run-2026-05-17.md`](../research/qa-flow-run-2026-05-17.md) — first functional QA pass.

## 🔴 YOUR #1 — recreate dev Supabase + apply `0058`-`0068` to prod

**This is the single most urgent + necessary task. The `dave→main` deploy is gated on it.**

`dave` carries 5 migrations not yet on prod: **`0058` `0059` `0066` `0067` `0068`**. Until they are on **prod** Supabase, `main` cannot advance — deploying the U1/U2 code without its tables would 500 the new routes (`/refunds`, `/admin/refunds/*`, `/admin/migration/pcs-customers`, cargo_sacks) in production. The entire U1 + U2 effort is parked on `dave`, unable to reach customers, until this clears.

⚠️ **The dev Supabase project `gnortvyazfmocvcbvfbs` is DELETED** — confirmed NXDOMAIN (gone, not paused). Production runs a **separate, healthy** project (`yzljakczhwrpbxflnmco`) — the launch is fine — but local dev + QA are blocked until you restore dev. Detail → [`../research/qa-flow-run-2026-05-17.md`](../research/qa-flow-run-2026-05-17.md).

**Steps:**
1. Create a fresh Supabase **dev** project (Supabase dashboard).
2. Apply migrations `0044`-`0068` to it — the full set (fresh project). All idempotent → safe.
3. Update `.env.local` — `NEXT_PUBLIC_SUPABASE_URL` + anon + service-role keys = the new project. **Post the new project ref to the team** so เดฟ + ปอน update their `.env.local` too.
4. Verify on dev — run the verify block in the apply-runbook.
5. Apply **`0058`-`0068`** to **prod** Supabase (`0044`-`0064` are already there). Ascending order; dependency chains are in the apply-runbook.
6. **Confirm to เดฟ.** เดฟ pushes `dave→main` — a 1-command fast-forward, already staged + allgreen — and the U1/U2 features go live.

Procedure detail → [`poom-apply-migrations-2026-05-17.md`](poom-apply-migrations-2026-05-17.md).

## Then — your feature queue (UPGRADE_PLAN order)

| # | Task | Note |
|---|---|---|
| 2 | **U2-2** — per-container cost basis + AP/disbursement ledger (`container_costs` carrier-rate-card + disbursement ledger) | unlocks margin + commission-on-profit. Next migration = `0069`. |
| 3 | **U1-7** — MOMO JMF sync runnable | ⛔ BLOCKED on ก๊อต — the MOMO API host/format (doc L-0) is wrong. Don't start until ก๊อต clears it. |
| 4 | **U2-4** PEAK accounting · **U3** ecosystem tools · **U4** supervisory | per UPGRADE_PLAN — partner-scheduled / later phases. |

## Migration numbering

Next free = **`0069`**. Taken: `0044`-`0064` (freight stack + เดฟ launch fixes), `0066`-`0068` (your U1/U2). `0065` is an unused gap — use it or skip, your call. Keep your block contiguous from `0069`.

## What เดฟ runs in parallel (not blocking you)

- The `dave→main` push (fires the moment you confirm step 5 above).
- U1-8 — flip the monitoring env vars in Vercel (per the go-live checklist) — confirm hCaptcha + Upstash are set before the customer push.
- Re-run the `qa-flow-simulator` functional QA pass once you post the new dev Supabase ref (it is blocked until then).

## Cross-links

- Apply procedure → [`poom-apply-migrations-2026-05-17.md`](poom-apply-migrations-2026-05-17.md)
- Roadmap → [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md)
- Team status → [`team-status-2026-05-17.md`](team-status-2026-05-17.md)
- Your brief → [`../briefs/poom.md`](../briefs/poom.md)
