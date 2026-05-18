# 📋 Team Status — 2026-05-18 (D1 pivot locked · branches consolidated)

> **Snapshot:** 2026-05-18 · **Maintainer:** เดฟ · **Audience:** ก๊อต · ภูม · ปอน · ลูกพี่
> **Previous checkpoint:** [`team-status-2026-05-17.md`](team-status-2026-05-17.md)
>
> Point-in-time broadcast — "where we are + who does what" right now. The
> forward plan is [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md); this doc does not
> duplicate it.

---

## 🧭 The direction — D1: Pacred becomes a faithful PCS Cargo port

On **2026-05-18 the owner (พี่ป๊อป) reviewed the rebuilt-from-scratch Pacred app
and rejected it** — the UI *and* the workflow logic-loop look nothing like the
legacy **PCS Cargo** system that staff + ~8,898 customers run on every day.
Rebuilding fresh would force everyone to retrain.

**Decision D1:** Pacred *becomes* the legacy PCS Cargo system, faithfully —
rebranded `PCS` → `PR`. Not a reinterpretation; a faithful port.

Canonical: **[ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md)** (read it
in full) · phase plan: **[UPGRADE_PLAN.md](../UPGRADE_PLAN.md)** · Phase-A
runbook: [`pcs-data-migration.md`](pcs-data-migration.md) · Phase-B gap map:
[`../research/d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md).

Three phases: **A** data migration (`pcsc_main` 117 tables → Supabase) · **B**
workflow fidelity (rework the app to the legacy PCS loop — *zero retraining*) ·
**C** Pacred enhancements (the deferred Tier 0/1/2/3 + the six owner systems).

---

## 🟢 What landed — the 2026-05-18 batch (on `dave`)

1. **D1 pivot documented** — ADR-0017 + the Phase-A migration runbook + the
   Phase-B gap map + the Phase-B `B-0`..`B-9` stage breakdown in UPGRADE_PLAN.
   CLAUDE.md / AGENTS.md / all four briefs rewritten for D1.
2. **Phase-A data migration — pipeline built + dry-run validated.** `pcsc_main`
   (117 tables · 3.78M rows · ~8,898 customers) → PostgreSQL: schema ported,
   converter (`PCS→PR` on the member-code columns), dry-run into a throwaway
   Postgres 17.10 reconciled **117/117 tables · 0 load failures · 0 mismatches**.
   Auth bridge `lib/auth/pcs-legacy-password.ts` (`passTam`) verified against 7
   real hashes + 5 vectors. *Pending the production load.*
3. **Branch consolidation** — ภูม (`Poom`, 10 commits — BK-1 booking · IC-1
   internal chat · freight R1 self-accept · tax-invoice R2/R3 credit-note) + ปอน
   (`podeng`) merged into `dave`. `pnpm verify` + `pnpm build` green. Stale agent
   worktrees cleaned up.
4. **Social login gated off** — Google / Facebook / LINE on `/login` render
   greyed-out under a **COMING SOON** badge behind one flag,
   `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` (default off). Legacy PCS was
   password-only — D1 defers social login to Phase C. `signInWithOAuth` enforces
   the same gate server-side.
5. **Prod-DB work sequenced** — see §"Prod-Supabase DB work" below.

---

## 🌿 Branch state

`dave` = `Poom` = `podeng` — all consolidated onto one line (the Poom/podeng
merge `2fdd416` + the 2026-05-18 doc / social-login / DB-sequencing batch).
`main` = production (held — see the deploy gate below). Stale agent worktrees
removed.

**ภูม + ปอน — pull `dave` before any new work:**

```bash
git fetch origin
git checkout <your-branch>      # Poom  /  podeng
git merge origin/dave
pnpm verify
```

---

## 🗄 Prod-Supabase DB work — the sequence

Three workstreams — full detail in [`pcs-data-migration.md` §9](pcs-data-migration.md):

- **DB-0 — verify the prod migration state (เดฟ · do FIRST).** The launch
  (2026-05-17) shipped on migrations up to ~`0057`; everything `0058`+ has
  accumulated on `dave` unapplied. Confirm the exact applied set before planning
  any deploy.
- **DB-1 — apply the `0058`-`0083` backlog to prod (ภูม).** 25 idempotent,
  additive migrations — includes the launch-integrity money/security guards
  `0060`-`0064` (the S-1 RLS keystone · the wallet-overdraw floor · the
  money-idempotency guards). **If DB-0 shows those are not on prod, applying
  them is P0 regardless of D1.** Apply in ascending number order. Completing
  DB-1 unblocks any `dave→main` deploy.
- **DB-2 — the D1 legacy port (เดฟ · ก๊อต gate).** The 117-table `tb_*` schema
  as migration **`0084`** + the data load. Gated on แต้ม's final dump + เดฟ's
  go + ก๊อต's production-load gate.

`0084` is reserved for the legacy schema (`0081`-`0083` were claimed by ภูม's
merged booking / credit-note / chat batch).

---

## 📊 Per-role pickup

### ก๊อต — Senior Advisor / gate
- 🔴 **Ratify [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md)** — D1 is
  "Accepted — pending ก๊อต ratification".
- 🔴 **The แต้ม hand-over** — 3 must-haves: the final `pcsc_main` dump (at
  cutover) · the customer upload files (`images/users`, `images/shops`,
  `storage/file`, `storage/slip`) · the JMF API spec. Clear the JMF spec
  with แต้ม.
- ⏳ The **A-5 production-load gate** — gate the prod load when เดฟ readies it.
- Brief: [`../briefs/got.md`](../briefs/got.md)

### เดฟ — Project Lead / Integrator (Phase A)
- ✅ This batch: D1 docs · migration pipeline + dry-run · branch consolidation ·
  social-login gate · DB-sequencing.
- 🔴 **DB-0** — verify the prod migration state.
- ⏳ **A-4** customer-file migration (blocked on แต้ม) · **A-5** production load
  (gated on go + the final dump).
- ⏳ Coordinate Phase B — own the gap-map-driven stage breakdown.
- Brief: [`../briefs/dave.md`](../briefs/dave.md)

### ภูม — Phase B backend
- 🔴 **FIRST — DB-1:** apply migrations `0058`-`0083` to prod Supabase
  (ascending, idempotent — see [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md)
  + [`pcs-data-migration.md` §9](pcs-data-migration.md)).
- 🎯 **Phase B backend** — rework the admin back-office + customer-portal
  backend onto the ported `tb_*` schema + the legacy PCS workflow. Start: `B-0`
  data foundation → `B-auth` (wire `verifyLegacyPassword` into the
  "เชื่อมต่อบัญชี PCS CARGO" login) → the admin track `B-4`..`B-9`.
- ⏸ The pre-D1 backlog (BK-1 booking, freight V-E6..E12, the Tier-3 systems) is
  **Phase C** — paused, not cancelled.
- Brief: [`../briefs/poom.md`](../briefs/poom.md)

### ปอน — Phase B frontend
- 🎯 **Phase B frontend** — rework the customer-facing UI to the legacy PCS look
  + flow. Start: **`B-1` — the 9-icon launchpad home** (restore the
  `member/menu.php` icon grid; retire the nested sidebar as the landing
  surface) → the `B-2`/`B-3` customer track.
- ℹ️ Social login on `/login` is now gated off behind
  `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` — the Google/Facebook/LINE buttons render
  greyed-out "COMING SOON" by default. That is intended (legacy PCS was
  password-only); leave it off when reworking the login surface.
- Brief: [`../briefs/podeng.md`](../briefs/podeng.md)

---

## 🔴 Blockers

| Blocker | Owner | Gates |
|---|---|---|
| **แต้ม hand-over** — final dump + customer files + JMF spec | ก๊อต ↔ แต้ม | A-4 + A-5 (the prod load) |
| **DB-0** — prod migration state unknown | เดฟ | a confident `dave→main` deploy |
| **A-5 production load** | เดฟ go · ก๊อต gate | the big D1 event — needs the final dump |

---

## 📚 Canonical docs

- 🧭 D1 decision → [`../decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
- 🚀 Phase plan → [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md)
- 🚚 Phase-A runbook → [`pcs-data-migration.md`](pcs-data-migration.md)
- 🎯 Phase-B gap map → [`../research/d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md)
- 🗄 Migration runbook → [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md)
- 👥 Briefs → [`../briefs/`](../briefs/)

---

**End of team-status 2026-05-18.** Next checkpoint when Phase A loads to prod or
Phase B `B-0` lands.

ลุยกันต่อ ✊
