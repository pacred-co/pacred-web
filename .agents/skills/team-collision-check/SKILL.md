---
name: team-collision-check
description: Fire before STARTING any non-trivial build, and during the integrate-loop, on this async multi-dev team (เดฟ/ภูม/ปอน/ก๊อต on separate branches). Know who is building what RIGHT NOW + detect a REAL collision (same file · same DB table-change · same migration number · same feature/route) BEFORE two people redo or clobber each other's work — without false-alarming on a merely-shared AREA. The "เรื่องนี้ชนกันนะ — แบบชนกันตรงๆ จริงจัง" gate so no one wastes time.
---

# Team Collision Check — catch the REAL overlap, not the shared area

> **Why (owner 2026-06-22):** *"ทำงานกันเป็นทีม … รู้ว่าเรื่องนี้ชนกันนะ แบบที่ชนกันตรงๆ จริงจังๆ … ไม่เสียเวลา … ต้องรู้ว่าใครทำเรื่องไหน … ใช้โค้ดเดียวกัน ใช้แผนเดียวกัน."* Example: เดฟ ทำบัญชี—ออกใบเสนอราคา · ภูม ทำบัญชี—จ่ายเงินเฟรท → same module, **different feature/files = NOT a collision**. But both must KNOW the other is in accounting + share the plan + reserve distinct migration numbers.

The registry: [`docs/team-worklog.md`](../../../docs/team-worklog.md) (ACTIVE / DONE / QUEUED + shared anchors). The migration ledger: [`docs/runbook/migration-ledger.md`](../../../docs/runbook/migration-ledger.md).

## What IS a real collision (coordinate FIRST) vs what's NOT

| REAL collision — stop & coordinate | NOT a collision — proceed (just know about it) |
|---|---|
| Same **file** edited by both | Same broad **area/module** (both "accounting", both "forwarders") |
| Same **DB table** schema-changed (two migrations alter the same table/column) | Different features in the same module (ใบเสนอราคา vs จ่ายเฟรท) |
| Same **migration number** grabbed by both (the classic — two devs both take 0199) | Different tables / different routes |
| Same **feature / route / action** built twice | Reading the same table from different new readers |
| Same **shared SOT/component** edited in conflicting ways (e.g. both rewrite `forwarder-status.ts`) | Both IMPORT the same SOT without editing it |

## The loop

```
BEFORE you start a build:
  1. READ docs/team-worklog.md ACTIVE + QUEUED rows.
  2. git fetch origin && for each teammate branch: git log origin/dave-pacred..origin/<b> --stat
     → list the FILES + migrations they touched recently.
  3. Compare to YOUR planned files / table / migration# / feature.
  4. REAL collision? → coordinate (below). NO collision? → CLAIM your row + go.
WHILE building: keep your worklog row current; reserve your migration# in the ledger.
WHEN done: move your row to DONE.
```

## When a REAL collision is found
- **Same migration number** → take the NEXT FREE from the ledger (never reuse); renumber yours; note it in the worklog. (This bit the team before: ภูม 0173 vs เดฟ 0173 → renumber.)
- **Same file / SOT / component** → don't both edit blind. Decide who owns it this round; the other rebases after, OR split the file so edits are disjoint. Surface it in chat: "เรื่องนี้ชนกับ <dev> ที่ไฟล์ X — ขอเคลียร์ก่อน."
- **Same feature built twice** → stop the duplicate immediately; one keeps it, the other repoints. This is the pure time-waste the owner wants gone.
- **Money/status SOT conflict** → extra care: two divergent edits to a money path = a money bug. Money-review both sides before keeping.

### 🔴 Case study — the SAME SCREEN built twice (2026-07-14 · ภูม ↔ ปอน · the worst kind)
Two teammates independently rebuilt the **same admin screen** (`app/[locale]/(admin)/admin/momo-containers/momo-containers-client.tsx` — the MOMO ตรวจตู้ / นำเข้าระบบ grid). Each shipped a full grid with **tick-select + an import button** (+373/−73 and +343/−52 on the SAME file) — the same feature, twice, built differently. At integration: **8 conflict regions in one component**, un-auto-mergeable, and un-testable by the integrator (no UI test harness). The merge BLOCKED the branch push and had to be settled by picking ONE implementation to carry forward — so one side's newer work got superseded. Pure, avoidable rework.

**What would have caught it:** claim the **SCREEN (route + component path)**, not a feature nickname — "ตรวจตู้" and "นำเข้าระบบ" are the SAME screen.
- Worklog rows must name `route + component path` (`/admin/momo-containers · momo-containers-client.tsx`).
- Before ANY admin-screen work: `git log --oneline origin/main..origin/<teammate> -- <component path>` → any commits there = REAL collision, coordinate NOW.
- **One screen = one owner per round.** The second dev contributes through the first, or takes a disjoint slice (parser/columns vs interactions) — agreed IN WRITING before either starts.

## At integration time (เดฟ / the integrator)
Run [`branch-integrate-loop`](../branch-integrate-loop/SKILL.md) — this skill is its proactive front. In the SURVEY step, the collision table above tells you which overlaps are real (resolve, keep BOTH sides' intent) vs cosmetic (auto-merge). The recurring real ones: the `package.json` test-list, migration-number clashes, and a shared SOT both branches edited.

## "ใช้โค้ดเดียวกัน · ใช้แผนเดียวกัน"
- **Same code** = base every branch on `dave-pacred` (the trunk); don't fork off a stale `main`.
- **Same plan** = work from the shared plan docs (the gap audit / PORT_PLAN / the UX standard), not a private interpretation. If your plan diverges, write it in the plan doc first so the team sees it.

## Anti-patterns
- ❌ Starting a build without checking the worklog + teammate branches → discover the collision at merge.
- ❌ Treating a shared MODULE as a collision (false alarm) → needless blocking.
- ❌ Grabbing a migration number without reserving it in the ledger → two 0199s.
- ❌ Two devs editing the same money/status SOT on separate branches with no coordination.
- ❌ Building a feature a teammate already built (no pre-check) → pure rework.

## Cross-links
- [`docs/team-worklog.md`](../../../docs/team-worklog.md) — the live who's-doing-what registry (claim your row).
- [`branch-integrate-loop`](../branch-integrate-loop/SKILL.md) — the consolidation cycle (this is its proactive front).
- [`docs/runbook/migration-ledger.md`](../../../docs/runbook/migration-ledger.md) — reserve migration numbers here.
- [`docs/team.md`](../../../docs/team.md) — roles, branches, merge policy.
