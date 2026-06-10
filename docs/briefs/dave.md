# เดฟ — Project Lead / Integrator / Customer-backend 1:1

Last reviewed: 2026-06-10 (docs-refresh wave — pickup list regenerated from the CLAUDE.md save-points)
Branch: **`dave-pacred`** (the integration trunk) → เดฟ promotes to `main` on the owner's go (ก๊อต reviews `main`) · Authority: second-tier owner · Team model SOT: [`team.md`](../team.md) §0

> ## ✅ 2026-05-30 MASTER GAP AUDIT — lane CLOSED (kept for trail)
> Full audit (17 agents · 23 P0 + 31 P1): **[`docs/research/legacy-gap-2026-05-30/_MASTER.md`](../research/legacy-gap-2026-05-30/_MASTER.md)**. The headline P0s from that audit have since shipped: **WALLET-SOT decided** ([`docs/decisions/0018-wallet-sot.md`](../decisions/0018-wallet-sot.md) exists — `tb_wallet`+`tb_wallet_hs` canonical), the dead-write "Potemkin" surfaces were repointed across the big-audit + June sessions, and the tax-invoice SOT landed as ADR-0027 (+ the 2026-06-10 dead-twin retirement). The **reachability rule (AGENTS.md §0d)** remains standing law: every task ships its entry point, ≤3 clicks.

> ## ⟦superseded⟧ 2026-05-24 STRATEGY RESET (historical — branch model has moved on)
>
> The 2026-05-24 lane split (ก๊อต takes an admin 1:1 lane · ปอน on `podeng`) did **not** become the working model. **Current model ([`team.md`](../team.md) §0, clarified 2026-06-09):** เดฟ = `dave-pacred` trunk/integrator (works on the owner's behalf) · ภูม = `Poom-pacred` · ปอน = **`InwPond007`** · ก๊อต = `main` review + delegated. `faithful-port` + stale `claude/*` remotes were deleted 2026-05-24 (still true).
>
> Still-useful reference: [`docs/research/d1-deep-audit-2026-05-24.md`](../research/d1-deep-audit-2026-05-24.md) (the 10-gap deep audit — most gaps since closed; Google-Sheets sync still waits on ก๊อต creds).

## 🎯 Direction — D1: Pacred is a faithful PCS Cargo port

🔴 The owner rejected the rebuilt Pacred app — its UI *and* its workflow look
nothing like the legacy **PCS Cargo** system that staff + ~8,898 customers run
on daily. **D1:** Pacred *becomes* the legacy PCS Cargo system, faithfully —
rebranded `PCS` → `PR`. Owner rule (verbatim): **"copy the original to 100%
sameness FIRST, then improve."** Canonical SOT →
[`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
— read it in full. It supersedes the Tier 0/1/2/3 framing of
[`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

Three phases: **A** data migration · **B** workflow fidelity · **C** Pacred
enhancements (the old Tier roadmap, *deferred not cancelled*).

## 🟢 Where the project is now

- 🟢 **Phase A — ✅ DONE.** Legacy `pcsc_main` (117 tables · 8,898 customers)
  **fully loaded on dev + prod Supabase**; migrations `0081`-`0083` + `0087` on
  `main`. Supabase Pro upgrade done (ก๊อต) → **all 117 tables including the 3
  log tables backfilled post-Pro**; **customer image + storage files uploaded
  to Supabase S3 production** by ภูม 2026-05-24 (`pcsracgo/public/member`).
  Auth bridge live. *Remaining (internal, not a legacy gap):* resolve
  rebuilt-era vs `tb_*` table-naming conflicts on prod — see CLAUDE.md §"What
  changed 2026-05-24".
- 🟢 **Phase B** — **wave 1 done + integrated**: customer 9-icon launchpad ·
  customer order flow · admin per-role RBAC sidebar + badges · admin container
  `tb_cnt` payment ledger · ภูม's legacy-auth bridge. Wave 1 is a *first pass* —
  not yet element-by-element fidelity-verified.
- ⚪ **Phase C** — deferred (Tier roadmap · ads/marketing · 8-specialist R&D).

## 🧭 Your lane (refreshed 2026-06-10)

You're the **integrator + customer-backend lead + cross-cutting builder** — in practice (June 2026) you also drive the big build waves (tax-invoice platform · freight ERP · warehouse · customs) via worktree agents and gate every merge. ภูม = admin/accounting backend on `Poom-pacred`; ปอน = frontend/UI on `InwPond007`; ก๊อต = `main` review + delegated (NOT a separate admin build lane — that 2026-05-24 idea was superseded). Concretely you:

- **Own customer-portal `(protected)/*` 1:1 fidelity** — 15/24 screens transcribed; ~9 remaining (login/register fidelity check, forgot-password, regis-tam, line-notify, etc.). Drive these to done.
- ~~**Wire missing customer-side integrations**~~ ✅ Gaps #3 (LINE Notify → LIFF + Messaging API replacement) + #5 (TAMIT was DBD lookup misroute — switched to internal `/api/dbd/[taxId]`) both closed 2026-05-27. Gap #1 (Google Sheets sync) foundation also shipped — CTT pilot DRY-RUN + Sheets v4 client + migration `0112` + cron `/api/cron/sheets-sync-ctt`; ก๊อต provisions credentials + sheet column mapping to go live.
- **Integrate ปอน's frontend** — merge `podeng` into `dave-pacred`, run `pnpm verify`, smoke-test, push to main.
- **Coordinate with ก๊อต** on the admin lane — agree on which routes are 1:1-ported (ก๊อต) vs V3-enhanced (ภูม merges later from Poom-pacred).
- ~~**Phase A close-out**~~ ✅ Phase A DONE — Pro upgrade done, 3 log tables backfilled, customer images uploaded to Supabase S3 prod by ภูม 2026-05-24, REALSHITDATAPCS.rar extracted. Only remaining: resolve prod table-naming conflicts (rebuilt-era vs `tb_*` — joint with ภูม).

## 🟡 Your pickup list (priority order — regenerated 2026-06-10)

> Live session state = the dated save-points at the top of [`CLAUDE.md`](../../CLAUDE.md) (canonical). Shipped-vs-pending snapshot = [`STRATEGY.md`](../STRATEGY.md) §9.

1. **Relay the owner action items** (the dormant/gated levers — carried in every save-point): flip `commission.freight_enabled` (after W6 tier-rate confirmation) · flip `tax_invoice.shop_yuan_enabled` (after money-loop test + ใบขน VAT sign-off) · enable `pricing`/`warehouse`/`freight_*_doc` roles for staff · PEAK GL codes · NETBAY creds · rotate the dev DB password · **get a test-customer login** (unblocks the §0c authed click-test backlog + the tax-invoice money-doc browser-verify).
2. **Customer screens still NOT 1:1 transcribed (~9 remaining)** — login/register fidelity check, forgot-password, wallet-normal/wallet-credit split if owner wants the legacy two-page UX, regis-tam residue. (15/24 screens transcribed as of the last count — re-verify the count before planning.)
3. **Resolve prod table-naming conflicts** (internal cleanup) — rebuilt-era vs legacy `tb_*` schemas on prod (`yzljakczhwrpbxflnmco`) still coexist; need the retirement plan for the rebuilt `profiles`-era twins. Joint with ภูม. (The tax-invoice twin was retired 2026-06-10 — ADR-0027 addendum; the pattern generalizes.)
4. **Retire pre-D1 scaffolding** — `0067_pcs_customer_migration.sql` + `actions/admin/pcs-migration.ts` + `u2-1-pcs-customer-migration.md` superseded by Phase A. Decide when the rebuilt `profiles`-era schema retires.
5. **Google-Sheets sync go-live** — CTT pilot DRY-RUN + Sheets v4 client + mig `0112` + cron `/api/cron/sheets-sync-ctt` all shipped; **waiting on ก๊อต to provision credentials + sheet column mapping.**
6. ~~Gap #5 TAMIT / regis-tam~~ ✅ CLOSED 2026-05-27 (DBD lookup re-routed to `/api/dbd/[taxId]`) · ~~Gap #3 LINE Notify~~ ✅ CLOSED via LIFF + Messaging API (`/line-settings`) · ~~WALLET-SOT~~ ✅ ADR-0018 · ~~verify podeng `d7b1758`~~ ✅ long-shipped · ~~ก๊อต admin-lane kickoff~~ ⟦superseded — ก๊อต = `main` review, not an admin build lane⟧.

## ✋ Non-collision rule

ปอน = customer-facing frontend surfaces. ภูม = backend (admin routes + server
actions + `tb_*` queries). You integrate. **One owner per surface** — anyone
taking a fresh surface coordinates through you first.

## 🔒 Force-read before any work

1. [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
   — ADR-0017, the canonical D1 SOT
2. [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — the
   Phase-A runbook (the backfill you drive to done)
3. The fidelity gap maps — [`d1-fidelity-customer.md`](../research/d1-fidelity-customer.md) ·
   [`d1-fidelity-admin.md`](../research/d1-fidelity-admin.md) ·
   [`d1-fidelity-workflow.md`](../research/d1-fidelity-workflow.md) — your
   Phase-B work-split input
4. [`team.md`](../team.md) §3 (daily workflow) + §3.0 (push frequency)
5. [`pacred-info.md`](../pacred-info.md) — company DNA SOT
6. Memory: `pacred_company_dna` · `feedback_faithful_port_priority` ·
   `push_frequency_strict` (load via /memories)

## Who you are

**Project Lead + Integrator.** You operate from **`dave-pacred`** (the trunk).
You consolidate ปอน (`InwPond007`) + ภูม (`Poom-pacred`) work into it, spawn +
sequence the build waves, hold the `dave-pacred → main` release gate (on the
owner's go; ก๊อต reviews), and cover ปอน + ภูม when blocked. Hand the
decision-heavy / partner / security items to ก๊อต — don't do everything yourself.

## Blockers + alternatives

| Blocked on | Alternative work |
|---|---|
| No test-customer login (owner) — blocks §0c authed click-tests + tax-invoice money-doc verify | Spawn the next build/audit wave; advance the ~9 remaining 1:1 customer screens |
| Owner activation gates (dormant flags · tier rates · PEAK GL · NETBAY) | Build mechanism-first behind flags (the W6 pattern); harden + test-cover what's shipped |
| No teammate push to integrate | Retire the superseded `0067` scaffolding; advance the prod table-naming (rebuilt-vs-`tb_*`) cleanup plan |

**Note back to ก๊อต when:** the owner sends creds, a partner needs a decision,
or a security concern surfaces.

## Hand-offs

**IN** — ก๊อต ADRs + external creds (you action) · ปอน `InwPond007` frontend
work (you merge) · ภูม `Poom-pacred` backend work (you merge) · owner ad-hoc
requests (you triage). **OUT** — wave specs → ปอน + ภูม · merged `dave-pacred`
→ `main` on the owner's go (ก๊อต reviews).

## Push discipline (per memory `push_frequency_strict` + team.md §3.0)

Commit local freely; **push to `origin/dave-pacred` only at save-points** (end
of session / before sleep / machine change / big batch done). Do NOT push
`main` unless the owner says so; do NOT routinely push teammate branches
(owner directive 2026-06-09 — see CLAUDE.md push-policy note).

## Cross-links

- [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — D1 SOT
- [`team.md`](../team.md) §3 — daily flow
- [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — Phase-A runbook
- [`research/d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md) — Phase-B gap map overview
- [`../../.claude/skills/branch-integrate-loop/SKILL.md`](../../.claude/skills/branch-integrate-loop/SKILL.md) — your integration playbook
- [`briefs/ops-roles.md`](ops-roles.md) — staff role contexts informing admin design
