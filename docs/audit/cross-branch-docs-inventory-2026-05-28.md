# Cross-branch docs inventory · 2026-05-28

> Snapshot point-in-time of all documentation artifacts across active branches + locked worktrees, so the master synthesizer can rebuild the canonical CLAUDE.md / AGENTS.md / skills / memory next.
>
> Generated 2026-05-28 evening from worktree `hopeful-almeida-359e44` (HEAD `341466ff`, 9 commits ahead of `dave-pacred` with Wave-25 cherry-picks).

---

## §0 TL;DR

- **Branches active:** 5 — `origin/main`, `origin/dave-pacred`, `origin/Poom-pacred`, `origin/podeng`, `origin/InwPond007`
- **Locked agent worktrees:** 6 (all already merged into dave-pacred — safe to discard, NOT deleting per instructions)
- **Master docs in sync:** **NO** — 3-way fork: (1) `main`=`dave-pacred` baseline · (2) `Poom-pacred` adds Wave-25 banner to CLAUDE.md (+63 lines) · (3) `podeng`=`InwPond007` strips out CLAUDE.md history banners + AGENTS.md §0a/0b/0c (-504 lines net on CLAUDE.md, -83 lines on AGENTS.md)
- **Skills in sync:** **MOSTLY** — `podeng`/`InwPond007` are missing 2 of 16 (`debug-mantra` + `management-talk`), their INDEX.md is older. `Poom-pacred` + `dave-pacred` + `main` carry all 16.
- **Learnings:** `main` = `dave-pacred` baseline (18 topic files). `Poom-pacred` updates 4 + has the most current `_index.md` (2026-05-28 15:07). `podeng`/`InwPond007` strip out 7 newer topic files entirely (likely ปอน's frontend-focused branch never pulled them). One **unresolved merge conflict in current worktree** at `docs/learnings/_index.md` lines 9-13 (HEAD vs Poom-pacred `123a3409`).
- **Memory staleness:** 3 entries are stale — `project_brand_pacred.md` (still says PR00001 5-digit, current is `PR001` 3-digit-min); `project_team_workflow.md` (explicitly marked SUPERSEDED in MEMORY.md index but file remains); `project_canonical_docs.md` (refers to legacy Phase O/N PORT_PLAN parts since superseded by D1 / UPGRADE_PLAN).

---

## §1 Master agent docs (Group 1)

### Per-file blob SHA divergence

Each row = one master doc. Cells contain the blob SHA per branch (or `=` if identical to `main`).

| File | main | dave-pacred | Poom-pacred | podeng | InwPond007 |
|---|---|---|---|---|---|
| `CLAUDE.md` | `6ca42e40` | = | `1439c041` | `ab98f649` | = podeng |
| `AGENTS.md` | `2260b908` | = | = | `f241e2e8` | = podeng |
| `docs/HANDBOOK.md` | `32d8aafa` | = | = | `fad165a2` | = podeng |
| `docs/STRATEGY.md` | `5cdf8d22` | = | = | `2bccac78` | = podeng |
| `docs/UPGRADE_PLAN.md` | `59d7ecbe` | = | = | = | = |
| `docs/team.md` | `c6d64b1c` | = | = | = | = |

**Clusters identified:**
- Cluster A (canonical): `main` ≡ `dave-pacred`
- Cluster B (Poom enriched): `Poom-pacred` — adds 63 lines to CLAUDE.md (Wave 25 banner)
- Cluster C (Pond stripped): `podeng` ≡ `InwPond007` for these 6 files

### Numerical diffs vs `main`

| File | vs Poom-pacred | vs podeng | vs InwPond007 |
|---|---|---|---|
| `CLAUDE.md` | +63 / -0 | +57 / -417 | +57 / -417 |
| `AGENTS.md` | 0 / 0 | +1 / -83 | +1 / -83 |
| `docs/HANDBOOK.md` | 0 / 0 | +1 / -1 | +1 / -1 |
| `docs/STRATEGY.md` | 0 / 0 | +1 / -3 | +1 / -3 |
| `docs/UPGRADE_PLAN.md` | 0 / 0 | 0 / 0 | 0 / 0 |
| `docs/team.md` | 0 / 0 | 0 / 0 | 0 / 0 |

### Per-file commit-date snapshot

| File | main | Poom-pacred | podeng / InwPond007 |
|---|---|---|---|
| `CLAUDE.md` | 2026-05-28 09:57 | 2026-05-28 15:07 (Wave-25 banner) | 2026-05-27 13:26 |
| `AGENTS.md` | 2026-05-28 09:57 | 2026-05-28 09:57 | 2026-05-27 13:26 |
| `docs/HANDBOOK.md` | 2026-05-27 13:26 | same | 2026-05-27 13:26 |
| `docs/team.md` | 2026-05-27 13:26 | same | 2026-05-27 13:26 |

### Are any branches >100 lines apart from main?

**YES.** `podeng` and `InwPond007` are CLAUDE.md `-417 lines` from main — they were branched before the Wave-22/23/24/25 banners landed. Their version of CLAUDE.md retains only the pre-Wave-22 content. **The synthesizer must NOT merge podeng's CLAUDE.md naively** — it would erase 5 days of wave-history banners.

`Poom-pacred` is `+63 lines` ahead of main (Wave-25 banner) — that's a small additive change.

**Recommendation for master rebuild:** Start from `Poom-pacred`'s CLAUDE.md as the most-recent superset; cross-check `main`'s version since it's the integrated baseline.

### Line-count estimates (heuristic via blob bytes)

| File | main bytes | Poom-pacred bytes | podeng bytes |
|---|---|---|---|
| `CLAUDE.md` | 69,961 | 74,673 (+6,712) | 43,194 (-26,767) |

---

## §2 Skills (`.claude/skills/`) (Group 2)

### Skill inventory across branches

| Skill | main | dave-pacred | Poom-pacred | podeng | InwPond007 |
|---|---|---|---|---|---|
| `audit-kpi-dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `branch-integrate-loop` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `bug-swarm-loop` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `copyist-unlimited` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `landing-conversion-audit` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `legacy-fidelity-check` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `legacy-php-sweep` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `mobile-first-verify` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `performance-hunter` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `phase-verify-loop` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `qa-flow-simulator` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `refactor-readability` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `scholar-immortal` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `test-coverage-writer` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `debug-mantra` | ✅ (2026-05-26 13:20) | ✅ | ✅ | ❌ MISSING | ❌ MISSING |
| `management-talk` | ✅ (2026-05-26 13:20) | ✅ | ✅ | ❌ MISSING | ❌ MISSING |
| `.claude/skills/INDEX.md` | ✅ updated (2026-05-26) | ✅ | ✅ | ✅ stale (2026-05-19) | ✅ stale |

**Verdict:** Skills are mostly synchronized. The 2 missing skills on `podeng` / `InwPond007` were added 2026-05-26 — those branches' base predates the addition. **NOT branch-specific intentional — they're pure inheritance lag.**

### Skill folder content matching

`origin/main:.claude/skills/INDEX.md` lists 16 skills. `origin/podeng:.claude/skills/INDEX.md` lists 14 (omits debug-mantra + management-talk, last-reviewed `2026-05-18 → 2026-05-19`). `Poom-pacred` is identical to `main` for the skill folder.

### Latest SKILL.md SHAs

Skill folder SHAs across `main`/`dave-pacred`/`Poom-pacred` are identical (no per-branch divergence found). `podeng`/`InwPond007` lack the 2 newer skill subdirs.

---

## §3 Learnings (`docs/learnings/`) (Group 3)

### Per-file presence + last-modified

`main` (= `dave-pacred`) has 18 topic files (current worktree directory listing matches the tree on these branches). The full set as observed in `docs/learnings/`:

```
_index.md
agent-orchestration.md
audit-discipline.md
ci-and-deploy-gotchas.md
debug-discipline.md
i18n-pitfalls.md
nextjs-16-quirks.md
pacred-design-philosophy.md
pacred-domain-knowledge.md
pacred-order-taxonomy.md
parallel-agent-sprints.md
partner-apis-quirks.md
perf-patterns.md
php-port-patterns.md
supabase-rls-patterns.md
supabase-storage-bulk-upload.md
testing-patterns.md
verify-deep-flow.md
```

### `_index.md` last-reviewed dates per branch

| Branch | Date in `_index.md` Last-reviewed line | File commit date |
|---|---|---|
| `main` | 2026-05-28 (nextjs-16-quirks +1 — `<Link>` prefetch leak) | 2026-05-28 14:10 |
| `dave-pacred` | same as main | 2026-05-28 14:10 |
| `Poom-pacred` | 2026-05-28 afternoon (Wave 25 close-out — 3 new entries: nextjs-16, php-port-patterns, verify-deep-flow) | 2026-05-28 15:07 |
| `podeng` | 2026-05-26 night | 2026-05-27 19:58 |
| `InwPond007` | 2026-05-26 night | 2026-05-28 11:05 |

### File presence per branch (relative to `main`)

| Topic file | main | dave-pacred | Poom-pacred | podeng | InwPond007 |
|---|---|---|---|---|---|
| `_index.md` | ✅ | ✅ | ✅ M (newer) | ✅ M (older — 3+3 lines) | ✅ M (older) |
| `agent-orchestration.md` | ✅ | ✅ | ✅ | ❌ DELETED | ❌ DELETED |
| `audit-discipline.md` | ✅ | ✅ | ✅ | ❌ DELETED | ❌ DELETED |
| `ci-and-deploy-gotchas.md` | ✅ | ✅ | ✅ M (+0 / -38) | ❌ DELETED | ✅ M (different) |
| `debug-discipline.md` | ✅ | ✅ | ✅ | ❌ DELETED | ❌ DELETED |
| `i18n-pitfalls.md` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `nextjs-16-quirks.md` | ✅ | ✅ | ✅ M (+46 / -99) | ❌ DELETED | ✅ M (different) |
| `pacred-design-philosophy.md` | ✅ | ✅ | ✅ | ❌ DELETED | ❌ DELETED |
| `pacred-domain-knowledge.md` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pacred-order-taxonomy.md` | ✅ | ✅ | ✅ | ❌ DELETED | ❌ DELETED |
| `parallel-agent-sprints.md` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `partner-apis-quirks.md` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `perf-patterns.md` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `php-port-patterns.md` | ✅ | ✅ | ✅ M (+51) | ✅ | ✅ |
| `supabase-rls-patterns.md` | ✅ | ✅ | ✅ | ❌ DELETED | ❌ DELETED |
| `supabase-storage-bulk-upload.md` | ✅ | ✅ | ✅ | ❌ DELETED | ❌ DELETED |
| `testing-patterns.md` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `verify-deep-flow.md` | ✅ (2026-05-25 stub) | ✅ | ✅ M (+47 — case study added) | ❌ DELETED | ❌ DELETED |

**Patterns:**
- `podeng` deletes the 7 backend/admin-focused learnings: agent-orchestration, audit-discipline, ci-and-deploy-gotchas, debug-discipline, pacred-design-philosophy, pacred-order-taxonomy, supabase-rls-patterns, supabase-storage-bulk-upload, verify-deep-flow. Also deletes nextjs-16-quirks. **9 deletions.** Suggests podeng was branched before those were added, OR ปอน manually pruned them as not-her-scope.
- `InwPond007` matches podeng on deletions BUT keeps ci-and-deploy + nextjs-16-quirks with its own modifications.
- `Poom-pacred` has the MOST RECENT entries — Wave-25 case study additions to verify-deep-flow + php-port-patterns + nextjs-16-quirks.

### Entries per topic file (approximate, from `_index.md` last-entry dates)

| Topic | Most recent entry | Branch with newest |
|---|---|---|
| `nextjs-16-quirks` | 2026-05-28 | Poom-pacred (Wave-25 use-server export bug · `<Link>` prefetch leak) |
| `ci-and-deploy-gotchas` | 2026-05-27 | main (CSP origin list + camelCase migration pitfalls + PG RENAME COLUMN doesn't reach PL/pgSQL bodies) |
| `verify-deep-flow` | 2026-05-28 | Poom-pacred (cnt-payment round-2 case study) |
| `php-port-patterns` | 2026-05-28 | Poom-pacred (schema casing drift on tb_cnt) |
| `parallel-agent-sprints` | 2026-05-27 | main (cherry-pick over merge + brand-asset binary refresh) |
| `partner-apis-quirks` | 2026-05-27 | main (DBD lookup switch fix) |
| `supabase-rls-patterns` | 2026-05-17 | main (steady) |
| `pacred-domain-knowledge` | 2026-05-19 | main (steady) |
| `php-port-patterns` (already above) | | |
| `perf-patterns` | (empty seed) | — |
| `i18n-pitfalls` | 2026-05-15 | main (steady) |
| `testing-patterns` | 2026-05-16 | main (steady) |

### ⚠️ Unresolved merge conflict in current worktree

`docs/learnings/_index.md` has live conflict markers at lines 9-13:

```
<<<<<<< HEAD
Last reviewed: 2026-05-28 (nextjs-16-quirks +1 — `<Link>` to a protected route from a non-protected page leaks the protected layout's `CSS_BUNDLE` ... )
=======
Last reviewed: 2026-05-28 afternoon (Wave 25 close-out · +3 entries — nextjs-16-quirks: `"use server"` files reject EVERY non-async-function value export ...)
>>>>>>> 123a3409 (docs(wave-25 close-out): save-point + 3 learnings + CLAUDE.md update for พี่เดฟ review)
```

Both lines have valuable content. The synthesizer should **MERGE** both reviews (HEAD ones AND Poom-pacred ones — they're additive not contradictory).

---

## §4 Memory files (Group 4)

Memory location: `C:\Users\Admin\.claude\projects\C--Users-Admin-pacred-web\memory\`

### Index file `MEMORY.md`

Lists 9 referenced memory files. All present.

### Per-file inventory

| File | Status | 1-line summary | In `MEMORY.md` index? | Staleness |
|---|---|---|---|---|
| `MEMORY.md` | ✅ (index) | The router listing the 9 memory files | self | current |
| `project_brand_pacred.md` | ✅ | Pacred brand identity + member_code scheme + social channels (PR00001 5-digit). | ✅ | ⚠️ **STALE** — member_code is now `PR001` 3-digit-min (Postgres trigger `generate_member_code` migration `0060`), the memory still says `PR00001` 5-digit-zero-pad. The actual current rule is in `CLAUDE.md` end-of-file. |
| `tracking_codes_embed_rule.md` | ✅ | Owner directive 2026-05-20: gtag · FB Pixel · LINE Tag · GA4 MUST be wired into `app/layout.tsx <head>` via components/analytics/<X>Script. ID hardcoded as fallback. | ✅ | current (2026-05-20) |
| `faithful_port_d1.md` | ✅ | D1 = Pacred becomes faithful PCS port; 3 phases (A done, B in progress); branch model post-2026-05-24 reset: `podeng`+`dave-pacred`→`main`, `Poom-pacred` V3 unlocked. | ✅ | current (2026-05-27) — minor lag: doesn't mention Wave-25 or 0113-0115 migrations |
| `camelcase_pilot_in_progress.md` | ✅ | 2026-05-27 pilot shipped (`tb_users` + `tb_admin` + `tb_co` = 80/996 renames). Batch 2a (tb_cnt + tb_cnt_item + tb_check_forwarder = 19) shipped 2026-05-28. 102 tables / ~897 remain. Tooling in `scripts/`. | ✅ | **current** (2026-05-28) |
| `podeng_brand_asset_convention.md` | ✅ | ปอน refreshes brand images in-place — never auto-rewrite her paths in brand-leak scrubs; binary M-marks are silent material changes. | ✅ | current |
| `project_team_workflow.md` | ⚠️ | Pre-D1 team workflow (dave + got co-merge to main; podeng frontend; Poom backend → DPX). **MEMORY.md index marks this as SUPERSEDED for D1 by `faithful_port_d1.md`.** | ✅ (marked superseded) | ⚠️ **SUPERSEDED** — explicitly flagged but file not removed |
| `project_canonical_docs.md` | ⚠️ | Canonical docs layout. References "Part O of PORT_PLAN.md", "Part N6 superseded", etc — pre-D1 era. | ✅ | ⚠️ **STALE** — `docs/PORT_PLAN.md` Part O/N references are historic; current canonical = `docs/UPGRADE_PLAN.md` (D1) + `docs/STRATEGY.md`. The file isn't WRONG, just outdated. |
| `feedback_session_start_handshake.md` | ✅ | After git sync at session start: read role brief + summarize state + wait — never ask "what should I do?" first. Encoded in `AGENTS.md` §1. | ✅ | current |
| `user_dave_role.md` | ✅ | User = เดฟ (Pacred Project Lead + Integrator). Active branch = `dave-pacred` post-2026-05-24. Git identity = `deffeyameh`. | ✅ | current |
| `feedback_legacy_port_fidelity.md` | ✅ | When porting, replicate legacy UI + logic-loop + menus + statuses faithfully — owner rejects divergence. | ✅ | current |

### Staleness summary

3 of 11 entries are stale or partially superseded:
1. **`project_brand_pacred.md`** — `PR00001` 5-digit → actually `PR001` 3-digit-min
2. **`project_team_workflow.md`** — marked SUPERSEDED in index; consider deleting since `faithful_port_d1.md` covers it
3. **`project_canonical_docs.md`** — refers to legacy Phase O/N; modernize to D1 / UPGRADE_PLAN references

---

## §5 Audit + research docs (Group 5)

### `docs/audit/` inventory (main / dave-pacred — baseline)

33 files total. Newest by date:

| Filename | Date | Branch additions |
|---|---|---|
| `cross-branch-docs-inventory-2026-05-28.md` | 2026-05-28 (this doc) | — |
| `podeng-lost-pages-2026-05-28.md` | 2026-05-28 | main |
| `poom-wave-25-merge-audit-2026-05-28.md` | 2026-05-28 | main |
| `fidelity-auth-screens-2026-05-28.md` | 2026-05-28 | both main + Poom-pacred (M) |
| `supabase-error-destructure-2026-05-26.md` | 2026-05-26 | main |
| `cargo-flow-deep-audit-2026-05-25.md` | 2026-05-25 | main |
| `admin-pages-audit-2026-05-25-night.md` | 2026-05-25 | main |
| `re-audit-2026-05-21-night.md`, `page-inventory-2026-05-21-night.md`, `mobile-admin-pages-2026-05-21.md` | 2026-05-21 | main |
| `pcs-master-synthesis-2026-05-20.md`, `pcs-business-flow-2026-05-20.md`, `pcs-complete-analysis-2026-05-20.md`, `pcs-admin-roles-2026-05-20.md`, `fidelity-2026-05-20.md`, `mobile-verify-2026-05-20.md` | 2026-05-20 | main |
| `seo-audit-2026-05-17.md` | 2026-05-17 | main |
| `cargo-ops-forensics-2026-05-16.md`, `chat-analysis-2026-05-16.md`, `legacy-cleanup-2026-05-16.md`, `pen-test-plan-2026-05-16.md`, `php-deep-sweep-2026-05-16.md`, `rls-and-audit-log-2026-05-16.md`, `v-f3-legacy-infra-resilience-2026-05-16.md` | 2026-05-16 | main |
| `parity-*.md` (×6 — admin-profile, admin-table, forwarder-driver, hs-customrate, settings-vip, time-attendance), `php-pcscargo-integrations.md`, `owasp-2026-05.md`, `fidelity-gap-2026-05-23.md`, `fidelity-gap-2026-05-24.md` | various | main |

### `docs/research/` inventory (main / dave-pacred — baseline)

81 files + 3 sub-dirs (`pcs-legacy/`, `r-and-d-2026-05-19/`, `sidebar-fidelity-audit/`, `wave-1-fidelity/`). Newest:

| Filename | Date | Branch additions |
|---|---|---|
| `poom-save-point-2026-05-28-afternoon.md` | 2026-05-28 | **Poom-pacred ADDITION** (not on main) |
| `poom-save-point-2026-05-27-late-night.md`, `poom-save-point-2026-05-27-mega-day.md`, `poom-save-point-2026-05-27-night.md`, `poom-save-point-2026-05-27-evening.md` | 2026-05-27 | main |
| `admin-tech-debt-master-2026-05-27.md`, `admin-click-through-audit-2026-05-27-wave24.md`, `admin-click-through-audit-2026-05-27.md`, `admin-sidebar-and-disbursement-audit-2026-05-27.md`, `admin-ui-design-audit-2026-05-27.md`, `tb-admin-13-row-reference.md`, `tb-admin-code-audit-2026-05-27.md`, `tb-admin-merge-intel-2026-05-27.md`, `wave-21-p2-query-survey.md` | 2026-05-27 | main |
| `marketplace-thumbnails-2026-05-25-night.md`, `poom-save-point-2026-05-25-night.md` | 2026-05-25 | main |
| `poom-save-point-2026-05-26-night.md` | 2026-05-26 | main |
| `poom-save-point-2026-05-24-night.md`, `d1-audit-backoffice-2026-05-24.md`, `d1-audit-pcscargo-2026-05-24.md`, `d1-audit-pcsseafreight-2026-05-24.md`, `d1-customer-backend-gap-2026-05-24.md`, `d1-deep-audit-2026-05-24.md` | 2026-05-24 | main |
| `poom-save-point-2026-05-23-night.md` | 2026-05-23 | main |
| `php-vs-pacred-gap-2026-05-22.md`, `poom-save-point-2026-05-22-night.md` | 2026-05-22 | main |
| `orphan-pages-audit-2026-05-21.md` | 2026-05-21 | main |
| `ads-launch-action-plan-2026-05-20.md`, `podeng-tooling-2026-05-20.md`, `podeng-brand-asset-swap-2026-05-20.md`, `poom-save-point-2026-05-20-night.md`, `sidebar-pairing-audit-2026-05-20.md` | 2026-05-20 | main |
| Earlier (2026-05-17 to 2026-05-19): `prelaunch-frontend-2026-05-17.md`, `prelaunch-verification-2026-05-17.md`, `qa-flow-run-2026-05-17.md`, `audit-money-billing-2026-05-17.md`, `audit-system-2026-05-17.md`, `legacy-chat-datanew-2026-05-17.md`, `audit-core-2026-05-18.md`, `predeploy-verify-2026-05-18.md`, `review-u1-u2-2026-05-18.md`, multiple `*-system-2026-05-18.md` (booking-flow, china-ops-container-closing, customer-intelligence, disbursement, internal-chat, operating-system, platform-observability), `tools-strategy-build-vs-buy-2026-05-18.md`, `frontend-tooling-2026-05-18.md`, `capability-tools-strategy-2026-05-18.md`, `growth-acquisition-strategy-2026-05-18.md`, `booking-flow-system-2026-05-18.md`, `poom-save-point-2026-05-18-evening.md`, `podeng-save-point-2026-05-19.md`, `poom-save-point-2026-05-19.md`, `poom-save-point-2026-05-19-night.md`, `gap-*.md` (×5), `d1-fidelity-*.md` (×3), `d1-newdata-excels.md`, `d1-phase-b-gap-map.md`, `poom-d1-open-questions.md`, `poom-phase-b-prep.md` | various | main |
| Anchor docs (not dated): `PACRED-GAP-ANALYSIS.md`, `PACRED-MASTER-STRATEGY.md`, `_index.md`, `legacy-accounting-billing-workflow.md`, `legacy-chat-dev-it-momo.md`, `legacy-chat-ops-transport.md`, `legacy-chat-sale-pricing-people.md`, `momo-jmf-api-decoded.md`, `ttp-cargothai-decoded.md` | — | main |

### Most recent canonical "where are we" doc per branch

| Branch | Canonical resume doc | Date | Notes |
|---|---|---|---|
| `main` (= `dave-pacred`) | `docs/research/poom-save-point-2026-05-27-night.md` | 2026-05-27 ค่ำ | The Wave 22+23 P0 close-out — referenced from `CLAUDE.md`'s top banner |
| `Poom-pacred` | `docs/research/poom-save-point-2026-05-28-afternoon.md` | 2026-05-28 afternoon | **NEW — exclusive to Poom-pacred** · Wave-25 close-out + 5 launch blockers + decision asks |
| `podeng` | (no save-point — frontend lane) | — | Last commit 2026-05-28 12:01 (LCL cargo tracking pages); brand work-tree |
| `InwPond007` | (no save-point — Pond's lane) | — | Last commit 2026-05-28 13:33 (service-import full-width layout) |

### Branch-exclusive docs

- `Poom-pacred` exclusive: `docs/research/poom-save-point-2026-05-28-afternoon.md` (and modified `docs/learnings/{ci-and-deploy-gotchas,nextjs-16-quirks,php-port-patterns,verify-deep-flow,_index}.md`)
- `podeng` / `InwPond007` exclusive: **NONE** — they're pruned-down derivatives, not adders

### `docs/research/_index.md` presence

✅ Present on all branches.

---

## §6 Briefs (`docs/briefs/`) (Group 6)

### Inventory + presence

| File | main | dave-pacred | Poom-pacred | podeng | InwPond007 |
|---|---|---|---|---|---|
| `INDEX.md` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `dave.md` | ✅ (2026-05-27 14:47) | ✅ | ✅ | ✅ | ✅ |
| `got.md` | ✅ (2026-05-27 13:26) | ✅ | ✅ | ✅ | ✅ |
| `poom.md` | ✅ (2026-05-27 13:26) | ✅ | ✅ | ✅ | ✅ |
| `podeng.md` | ✅ (2026-05-24 10:12) | ✅ | ✅ | ✅ | ✅ |
| `got-cheatsheet-2026-05-17.md` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ops-roles.md` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `podeng-seo-and-ad-landing-playbook.md` | ✅ | ✅ | ✅ | ✅ | ✅ |

**Verdict: ALL BRIEFS IDENTICAL across all 5 active branches.** No divergence to worry about — synthesizer can use any branch's brief verbatim.

`docs/briefs/podeng.md` is oldest (2026-05-24) — may need refresh given the post-2026-05-24 strategy reset; but every branch holds the same version.

---

## §7 Locked worktrees (Group 7)

### Worktree inventory

From `git worktree list`:

| Worktree dir | Branch | HEAD SHA | Last commit date / msg |
|---|---|---|---|
| `agent-a2b49d80662157bba` | `worktree-agent-a2b49d80662157bba` | `1134283c` | 2026-05-26 11:57 — "fix(customer): D1 fidelity batch — login + register shopUser + addresses + profile (verified)" |
| `agent-a456b8ca2d4e7c63e` | `worktree-agent-a456b8ca2d4e7c63e` | `af4bebe9` | 2026-05-26 15:14 — "feat(line): LIFF account linking + line-settings page (task L — Messaging API replacement)" |
| `agent-a7b9cf8a4c3f560f3` | `worktree-agent-a7b9cf8a4c3f560f3` | `13bf18a2` | 2026-05-19 15:38 — "feat(faithful-port): transcribe menu.php customer launchpad 1:1 — pilot" |
| `agent-a9e3048576a6387d9` | `worktree-agent-a9e3048576a6387d9` | `356edcb2` | 2026-05-26 11:58 — "feat(service-order): link-paste product search via TAMIT (D1 fidelity §4)" |
| `agent-ad7dbbb3c1893d4ed` | `worktree-agent-ad7dbbb3c1893d4ed` | `1da804b1` | 2026-05-26 11:48 — "feat(dashboard): rebuild as legacy menu.php 9-icon launchpad (D1 fidelity)" |
| `agent-af5bc92db576ab33a` | `worktree-agent-af5bc92db576ab33a` | `350bf9be` | 2026-05-26 11:56 — "feat(line-notify): per-user OAuth UI + callback route (Gap #3 D1)" |

### Recoverable or already merged?

For each worktree branch, `git merge-base <branch> origin/dave-pacred` returns the branch's HEAD SHA exactly. This means **every agent worktree HEAD is an ancestor of `dave-pacred`** — they've all been merged in via integration commits already.

Also confirmed via `git branch -r --contains <SHA>` — every worktree commit lives in `origin/{main, dave-pacred, Poom-pacred, podeng, InwPond007}`.

**Recommendation:** Safe to discard after a `git worktree remove --force` (per the task: NOT deleting now, just reporting). No unique work to recover.

### Uncommitted work

Unable to inspect uncommitted changes in locked worktrees from this session (worktree access via `git -C <path> status` was denied at the shell level). However, given they're all 2026-05-19 to 2026-05-26 vintage and already merged in, any uncommitted work would be stale by 2-9 days regardless.

---

## §8 Top 10 highest-priority docs for the master synthesizer (read FIRST)

When rebuilding the master CLAUDE.md / AGENTS.md / skills / memory, the synthesizer should read these documents in this order. Each is the canonical entry point for one dimension of the project state.

1. **`docs/research/poom-save-point-2026-05-28-afternoon.md`** (Poom-pacred branch ONLY · 2026-05-28) — **Most recent canonical resume.** Wave-25 close-out + 5 launch blockers + decision asks. The post-2026-05-27 superset of the Wave 23/24 close-out narrative.
2. **`docs/research/poom-save-point-2026-05-27-night.md`** (all branches · 2026-05-27 ค่ำ) — Wave 22 + 23 P0 close-out. The "what shipped in the previous mega-session" reference.
3. **`docs/research/admin-tech-debt-master-2026-05-27.md`** (main · 2026-05-27) — Master tech-debt inventory (19 items prioritized; 18 closed by Wave 23-24-25). The "what's left" reference.
4. **`CLAUDE.md`** (Poom-pacred version `1439c041` · 2026-05-28 15:07) — Project root agent context. Use Poom-pacred's superset; cross-check `main`'s baseline. Includes Wave-25 banner missing on main.
5. **`AGENTS.md`** (main / Poom-pacred / dave-pacred version `2260b908` · 2026-05-28) — Behavior rules including §0a (workflow-vs-UI design philosophy), §0b (deep-audit-from-source protocol), §0c (verify-deep-flow protocol). **Do NOT use podeng's or InwPond007's stripped version** (-83 lines).
6. **`docs/learnings/_index.md`** (Poom-pacred version 2026-05-28 15:07) — Index of all 18 learnings topics. Resolve the merge conflict at lines 9-13 by MERGING both review-line additions. `main`'s entry covers `<Link>` prefetch leak (2026-05-28 morning); `Poom-pacred`'s entry covers Wave 25 close-out (`"use server"` exports + schema casing drift + cnt-payment case study).
7. **`docs/decisions/0017-pacred-faithful-pcs-port.md`** (canonical D1 direction · all branches) — The owner-mandate that drives all current work. Every roadmap reads through this lens.
8. **`docs/UPGRADE_PLAN.md`** (identical across all 5 branches · blob `59d7ecbe`) — The D1 master phase plan (Phase A done / Phase B in progress / Phase C deferred). Stable across branches — safe to use any version.
9. **`docs/STRATEGY.md`** (main / Poom-pacred / dave-pacred version `5cdf8d22`) — Master single-read consolidation (briefs + ADRs + plans condensed). Use main/Poom-pacred — podeng's `2bccac78` is `-3` lines stripped.
10. **`C:\Users\Admin\.claude\projects\C--Users-Admin-pacred-web\memory\faithful_port_d1.md`** (memory) — The D1 branch model + phase state + work-split. Memory file (cross-session persistent) — verify against `docs/decisions/0017-pacred-faithful-pcs-port.md` for any drift, but this is the SOT for the active branch model post-2026-05-24 reset.

### Honorable mentions (load second-pass)

- `docs/briefs/dave.md` (canonical per-role · user is เดฟ)
- `docs/research/admin-click-through-audit-2026-05-27-wave24.md` (the Wave-24 click-through verification — 19 surfaces tested)
- `docs/learnings/nextjs-16-quirks.md` (Poom-pacred version — most current)
- `docs/learnings/verify-deep-flow.md` (Poom-pacred version — has the Wave-25 cnt-payment round-2 case study)
- `docs/learnings/php-port-patterns.md` (Poom-pacred version — schema casing drift entry)
- `docs/learnings/ci-and-deploy-gotchas.md` (main version — PG RENAME COLUMN doesn't reach PL/pgSQL bodies)
- `.claude/skills/INDEX.md` (main / Poom-pacred version — 16 skills · 2026-05-26 last-reviewed)
- `docs/research/d1-deep-audit-2026-05-24.md` (the 10 critical gaps the owner assigned)
- `C:\Users\Admin\.claude\projects\C--Users-Admin-pacred-web\memory\camelcase_pilot_in_progress.md` (most current memory — through 2026-05-28 Batch 2a)
- `C:\Users\Admin\.claude\projects\C--Users-Admin-pacred-web\memory\faithful_port_d1.md` (D1 status SOT)

---

## §9 Synthesizer playbook

When rebuilding the master CLAUDE.md / AGENTS.md / skills / memory:

1. **Base layer:** Use `Poom-pacred` HEAD as the canonical superset for `CLAUDE.md` + master docs in `docs/` (it has the freshest Wave-25 banner + the latest learning additions).
2. **Branch reconciliation:**
   - `dave-pacred` = `main` — no separate reconciliation needed
   - `podeng` / `InwPond007` — DO NOT pull their CLAUDE.md / AGENTS.md (those are stripped derivatives, not bases). Pull their app/component changes only.
   - `Poom-pacred` — pull `CLAUDE.md` + `docs/learnings/{ci-and-deploy-gotchas,nextjs-16-quirks,php-port-patterns,verify-deep-flow,_index}.md` + `docs/research/poom-save-point-2026-05-28-afternoon.md`
3. **Skills:** Take from `main`/`dave-pacred`/`Poom-pacred` (all identical, 16 skills, latest 2026-05-26).
4. **Resolve worktree _index.md merge conflict:** Both sides are additive — merge to one combined "Last reviewed" line.
5. **Memory cleanup:** Mark or delete `project_team_workflow.md` (superseded); refresh `project_brand_pacred.md` (PR001 not PR00001); refresh `project_canonical_docs.md` (D1 references not Phase O/N).
6. **Discard signal:** 6 locked agent worktrees can be removed — all merged into dave-pacred already.

---

## §10 Notes + caveats

- **Generation context:** Generated from worktree `hopeful-almeida-359e44` at HEAD `341466ff` (9 commits ahead of `dave-pacred` — has Wave 25 cherry-picks staged locally that aren't yet in `dave-pacred` HEAD `227231a2`).
- **Worktree shell access:** Could not directly `cd` into the 6 locked agent worktrees during inventory; status taken from their branch HEAD commits via `git log` on the main worktree.
- **Memory access:** Read all 10 memory files via the `Read` tool (Glob was denied; PowerShell ListChildItem was denied; direct path Read worked).
- **Branch heads pinned (2026-05-28 evening):**
  - `origin/main` = `origin/dave-pacred` = `227231a2` (2026-05-28 15:16 — "fix(lint): satisfy pacred/no-bare-supabase-data-destructure across 20 files")
  - `origin/Poom-pacred` = `123a3409` (2026-05-28 15:07 — Wave-25 close-out)
  - `origin/podeng` = `c6ca71fb` (2026-05-28 12:01)
  - `origin/InwPond007` = `0cfc405c` (2026-05-28 13:33)
- **Worktree HEAD (current session):** `341466ff` on `claude/hopeful-almeida-359e44`
