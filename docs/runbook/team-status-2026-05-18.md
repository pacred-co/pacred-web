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
3. **Branch consolidation** — ภูม (`Poom` — BK-1 booking · IC-1 internal chat ·
   freight R1 self-accept · tax-invoice R2/R3 credit-note) + ปอน (`podeng`)
   merged into `dave`. ภูม also renumbered his booking/credit-note/chat
   migrations `0081`-`0083` → `0084`-`0086` (commit `a248696`) to free
   `0081`-`0083` for the Phase-A legacy schema — all docs realigned to that.
   `pnpm verify` + `pnpm build` green; stale agent worktrees cleaned up.
4. **Social login gated off** — Google / Facebook / LINE on `/login` render
   greyed-out under a **COMING SOON** badge behind one flag,
   `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` (default off). Legacy PCS was
   password-only — D1 defers social login to Phase C. `signInWithOAuth` enforces
   the same gate server-side.
5. **Prod-DB state verified + ADR-0017 ratified** — a direct REST probe of prod
   Supabase confirmed prod is at `0080` (DB-0 ✅ resolved · DB-1 ✅ done — the
   `0058`-`0080` backlog is already applied, no P0 hole). ก๊อต ratified ADR-0017
   (status now "Accepted + ratified"). See §"Prod-Supabase DB work" below.
6. **ภูม's 6 Phase-B open questions answered** — เดฟ decided Q1·Q3·Q4·Q5·Q6
   (migration split into `0081`-`0083` · special-userID + numbering rules ·
   Phase-C `0084`-`0086` frozen · `userType` 1:1 carry); Q2 (auth-bridge
   posture) carries เดฟ's lean → ก๊อต ratifies. ภูม is unblocked for B-0 +
   B-auth. Decisions inline in
   [`../research/poom-d1-open-questions.md`](../research/poom-d1-open-questions.md).

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

Full detail in [`pcs-data-migration.md` §9](pcs-data-migration.md):

- **DB-0 ✅ RESOLVED (เดฟ · 2026-05-18).** A direct REST probe of prod Supabase
  (`yzljakczhwrpbxflnmco`) confirmed prod is **at `0080`** — the marker tables of
  every backlog migration exist (`refund_requests`/`0058`, `cargo_sacks`/`0068`,
  `container_costs`/`0069`, `platform_incidents`/`0077`, `work_items`/`0080`).
  The launch-integrity money/security guards `0060`-`0064` (the S-1 RLS keystone ·
  the wallet-overdraw floor · the money-idempotency guards) **are on prod — no P0
  hole.** การคาดเดาเดิมว่า prod หยุดที่ `~0057` ผิด.
- **DB-1 ✅ DONE.** The backlog (`0058`-`0080`) is already applied — DB-0's probe
  proves it. No "apply the backlog first" gate remains; ภูม is unblocked to start
  Phase B directly. (ภูม applied it earlier on 2026-05-18; his evening save-point
  doc still saying "`0058`-`0080` unapplied" is **stale** — written before the run.)
- **DB-2 — the D1 legacy port (เดฟ · ก๊อต gate).** The 117-table `tb_*` schema
  as migration **`0081`** + the data load. Gated on แต้ม's final `pcsc_main` dump +
  เดฟ's go + ก๊อต's production-load gate.

`0081`-`0083` are reserved for the legacy schema + follow-ups; ภูม renumbered
his booking/credit-note/chat batch to `0084`-`0086` (commit `a248696`) to free
that block. Next free for new Phase-B work = `0087`.

---

## 📊 Per-role pickup

### ก๊อต — Senior Advisor / gate
- ✅ **[ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md) ratified** — D1
  status is now "Accepted + ratified 2026-05-18".
- 🔴 **The แต้ม hand-over (reduced).** 2 must-haves left: the final `pcsc_main`
  dump (at cutover) · the customer image/file storage (`images/users`,
  `images/shops`, `storage/file`, `storage/slip`) — ก๊อต fetches these so
  migrated customers keep continuity (order history + documents). **The JMF
  API spec is no longer needed from แต้ม** — ก๊อต builds the JMF API himself
  (reverse-engineered).
- ⏳ The **A-5 production-load gate** — gate the prod load when เดฟ readies it.
- Brief: [`../briefs/got.md`](../briefs/got.md)

### เดฟ — Project Lead / Integrator (Phase A)
- ✅ This batch: D1 docs · migration pipeline + dry-run · branch consolidation ·
  social-login gate · DB-sequencing.
- ✅ **DB-0 — done.** Direct REST probe confirmed prod is at `0080` — DB-1 (the
  `0058`-`0080` backlog) is already applied; no P0 security/money hole.
- ⏳ **A-4** customer-file migration (blocked on แต้ม) · **A-5** production load
  (gated on go + the final dump).
- ⏳ Coordinate Phase B — own the gap-map-driven stage breakdown.
- Brief: [`../briefs/dave.md`](../briefs/dave.md)

### ภูม — Phase B backend
- ✅ **DB-1 done** — the backlog (`0058`-`0080`) is already applied to prod
  (DB-0's probe verified prod at `0080`). **No "apply the backlog first" gate
  remains — ภูม is unblocked for Phase B now.** (`0084`-`0086` stay frozen for
  Phase C per Q5.)
- 🎯 **FIRST — Phase B backend.** Rework the admin back-office + customer-portal
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
| **แต้ม hand-over** — final `pcsc_main` dump + the customer image/file storage (ก๊อต fetches) | ก๊อต ↔ แต้ม | A-4 + A-5 (the prod load). *JMF spec no longer needed — ก๊อต builds the JMF API himself.* |
| **A-5 production load** | เดฟ go · ก๊อต gate | the big D1 event — needs the final dump |
| **Q2 — auth-bridge posture** — [`poom-d1-open-questions.md`](../research/poom-d1-open-questions.md) | ก๊อต | B-auth ship gate (Q1·Q3·Q4·Q5·Q6 answered 2026-05-18; Q2 carries เดฟ's lean) |

*Resolved 2026-05-18:* **DB-0** — prod verified at `0080` by direct REST probe ·
**DB-1** — the `0058`-`0080` backlog is already applied (no P0 hole) ·
**ADR-0017 ratification** — ก๊อต ratified.

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
