<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Pacred — agent behavior rules

> AGENTS.md is loaded into every Claude Code session via `@AGENTS.md` at the top of `CLAUDE.md`. Keep this file narrow: rules that change *how* agents behave, not project facts (facts live in CLAUDE.md / docs/).

## 0a. Workflow vs UI — the design philosophy (read FIRST · 2026-05-23 added)

**Legacy PCS Cargo = workflow source of truth. Our UI = our design — better than legacy.**

We are NOT pixel-cloning the PHP. We are stealing the **logic** (data fields ·
button behaviour · filters · permissions · status flows) and applying **our
own polish** (Tailwind · Lucide icons · cleaner typography · responsive design ·
better empty states). The owner's quote: *"เราแค่ copy ระบบการทำงาน ส่วนหน้าตา
เราเอามาปรับให้สวยเอง"* (we copy the working system, polish the look ourselves).

Before shipping any faithful-port page:
1. **Open the legacy `.php`** under `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\pcscargo\member\pcs-admin\` and list every data field + button + filter
2. **Write the Pacred page with the SAME logic but our design** — never copy Bootstrap-4 markup verbatim
3. **Browser-verify side-by-side** with the legacy (open the owner's screenshot OR render the PHP locally) — add anything legacy shows that we don't
4. **Banner deferred features in the UI** ("Wave 12 ยังไม่เปิด — ใช้ legacy PHP ชั่วคราว") instead of silently linking to a redirect
5. **Tell ภูม what's complete vs what's stubbed** when reporting wave completion — don't make ภูม discover gaps by clicking around
6. **Ask before implementing if unsure** — "should the thumbnail link to full image or detail page?"

**Anti-pattern (what NOT to do):** Ship a "faithful port" with the legacy's
plain Bootstrap-4 chrome and defend it as "matches legacy". Wait for ภูม to
flag mismatches instead of proactively comparing. Silently leave features
unimplemented without bannering.

Full reference + concrete examples: [`docs/learnings/pacred-design-philosophy.md`](docs/learnings/pacred-design-philosophy.md).

---

## 0. Current direction — D1: Pacred is a faithful PCS Cargo port

On **2026-05-18 the owner rejected the rebuilt-from-scratch Pacred app** — its UI and workflow look nothing like the legacy **PCS Cargo** system that staff and ~8,898 customers use daily. The direction is now **D1: Pacred becomes the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`.** This is the canonical lens for every task. Three phases:

- **Phase A — Data migration** — port `pcsc_main` (117 tables) into Supabase, `PCS<n>` → `PR<n>`. *Business data **loaded to dev + prod Supabase** (114 of 117 tables · ~8,898 customers reconciled); 3 oversized log tables + customer image files backfill after the Supabase Pro upgrade.*
- **Phase B — Workflow fidelity** — rework the customer portal + admin back-office so menus, job statuses, container (ตู้) flow, and the end-to-end logic-loop match legacy PCS exactly. Goal: **zero retraining** for staff and customers. *Wave 1 integrated on `dave`; waves 2+ in progress.*
- **Phase C — Pacred enhancements** — layer Pacred's own improvements *only after* the faithful port works. The old Tier 0/1/2/3 roadmap + the Phase-2 build queue are **deferred to Phase C — not cancelled.**

📋 Canonical SOT: **[`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md)** (the D1 decision) + **[`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md)** (the D1 master phase plan — current state · stages · work-lanes). Read ADR-0017 in full before D1 work. In-flight pre-D1 feature work (e.g. BK-1 booking flow, freight V-E1.1) pauses; the team pivots to Phase B.

**2026-05-19 evening — the faithful-port lane.** Phase B is now executed as a literal **1:1 transcription** of the legacy PHP screens (the owner's "100% sameness FIRST" rule). The work runs on a dedicated branch loop — `Poom-pacred` (ภูม · admin) + `dave-pacred` (เดฟ · customer) → `faithful-port` (production) → `main`; `dave`/`Poom` are FROZEN. The plan + branch model + 4-person work-split → **[`docs/runbook/faithful-port-plan.md`](docs/runbook/faithful-port-plan.md)**; the method → **[`docs/runbook/faithful-port-transcription.md`](docs/runbook/faithful-port-transcription.md)**.

## 1. Session-start handshake (MANDATORY — do BEFORE asking what to work on)

After `git fetch` + branch sync at the top of a session, run this handshake **proactively** — do not wait for the user to ask. Skipping = wandering session + forcing the user to re-explain context they already encoded in docs.

**Step 1 — Read your role brief** ([`docs/briefs/<your-name>.md`](docs/briefs/) — routing in [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md)).

**Step 2 — Scan canonical context** (parallel reads):
- [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) — D1, the current direction (see §0)
- [`docs/STRATEGY.md`](docs/STRATEGY.md) — master single-read consolidation (~370 lines)
- [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) — the D1 phase plan (Phase A migration → Phase B workflow fidelity → Phase C) + work-split
- [`docs/learnings/_index.md`](docs/learnings/_index.md) — new entries since last session (immortal-scholar — `.claude/skills/scholar-immortal/`)
- Your brief's "Force-read" cross-links (relevant ADRs, runbooks)

**Step 3 — Surface a state summary to the user** (don't ask first — present it):
- 🟢 **Shipped** — what's behind us (1-3 lines, latest sprint)
- 🟡 **Your pickup list** — top 3-5 P0/P1 from your brief
- 🔴 **Critical blockers** — who you're blocked on, who's blocked on you
- **Recommended first task** — highest-leverage P0 with effort estimate

**Step 4 — Wait for user go-ahead** before implementing. They may redirect to a different pickup.

**Triggers:** any session that starts with sync ("ต่อที่ทำงาน", "เปิดมาใหม่", new worktree, machine change, fresh Claude Code window). Per memory `session_start_handshake`.

## 2. Faithfulness-first lens (D1 — supersedes the revenue-first framing for Phase A/B)

Under D1 the decision lens shifts: Phase A/B work is about making Pacred **be** the working PCS system. For every task ask — **does this make the port more faithful, and the system usable with zero retraining for staff and customers?** Prefer work that closes the gap between Pacred and legacy PCS; de-prioritise anything that adds Pacred-original behaviour (that's Phase C). When porting, **match the legacy PCS workflow exactly** — don't "improve" menus, statuses, or the logic-loop mid-port; faithful first, enhance later.

The old revenue lens (more **true** / **billable** / **measurable**) still holds underneath — a faithful PCS port *is* the billable revenue path — but during Phase A/B "faithful + zero-retraining" is the tie-breaker.

**Plan work properly.** Don't ship half-built to chase a deadline; don't skip the quality gate to "save time".

**⚠️ 2026-05-19 — owner escalation.** The owner reviewed the team's output and **scolded the whole team** — screens were still diverging from legacy PCS. The rule, verbatim: **"ต้องเอาของเดิมมา copy ให้ได้ ให้เหมือนทั้งหมด 100% ก่อน แล้วเราค่อยพัฒนาให้เหนือยิ่งกว่า"** — copy the original to 100% sameness FIRST, then improve. **Applies to everything.** Before shipping any Phase-B rework, run the **`legacy-fidelity-check`** skill — the executable form of this rule. A genuine improvement idea → record it for Phase C; never ship it inside a port diff (it hides divergence in a good-looking change).

📋 D1 work is sequenced in [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) — the D1 phase plan (Phase A migration → Phase B workflow fidelity → Phase C enhancements). The cargo + gap-hunt backlogs it draws from = [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Part V (cargo-forensics) + Part W (gap-hunt). Start with UPGRADE_PLAN, not the raw backlogs.

## 3. Don't preempt brand cleanup

Pacred is splitting from **PCS CARGO + TTP + ไอแต้ม**. References to these survive in code because some APIs are still "borrowed" interim. **Do not scrub these references** until ก๊อต confirms the matching API switchover. The rule lives in [`docs/runbook/pcs-scrub-plan.md`](docs/runbook/pcs-scrub-plan.md).

## 4. V2 ≠ V3 — don't refactor mid-flight

This repo (`pacred-web`) is **V2**. [ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md) supersedes [ADR-0010](docs/decisions/0010-v2-v3-version-strategy.md)'s "V2 = rebuilt owner-pleaser" framing — **V2 is now the faithful PCS port** (D1, see §0). V3 (`pacred-DPX`, separate future repo) is **unaffected** by D1. When tempted to refactor toward your ideal V3 architecture, append to `docs/v3-wishlist.md` instead. Don't ship V3 redesigns into V2.

## 5. Push at save-points only

Commit local freely. Push only when: end of session · before sleep · machine change · location change · big batch done. Per [memory: push_frequency_strict] + [`docs/team.md`](docs/team.md) §3.0. Vercel build cost + push churn distracts the team.

## 6. Customer-visible surfaces have a voice — and a phone

Slogan: **"เร็ว ไว ไม่มีคำว่าทำไม่ได้"**. Copy ตรงเป้า ไม่อ้อม. Every service has a landing page (even if backend not ready → use "ติดต่อทีม" CTA fallback). Don't ship dry copy.

**Mobile-first is non-negotiable.** Most Pacred customers arrive on phones — so every customer-visible change must be designed and checked at a phone viewport (360px Android / 390px iPhone) FIRST, then scaled up to desktop. Build desktop-first and the mobile layout goes wrong. Before pushing any customer surface, verify at 360 + 390px: no horizontal scroll, tap targets ≥ 44px, body text ≥ 16px, primary CTA thumb-reachable. The concrete rules + Tailwind patterns + pitfalls live in [`docs/conventions.md`](docs/conventions.md) §11 and the [`docs/mobile-first-playbook.md`](docs/mobile-first-playbook.md).

## 7. Constants live in `components/seo/site.ts`

Company info (phone / email / address / legal name / tax ID / slogan / LINE OA / social) **must be imported** from this single source. Never hardcode. If you spot hardcoded values, flag them via `L-contact-refactor` tracker in PORT_PLAN.

## 8. Never break the autonomous run

When the user says "จัดมาเลย / รันยาวๆ / ลุยเลย" → pick recommended defaults, don't ask mid-run, save-points-only pushes (per `autonomous_long_runs` memory). The check-in pattern is `AskUserQuestion` only when there's a load-bearing branch you can't infer.

---

## 9. Skills are playbooks — invoke them

The `.claude/skills/` directory contains 14 skills (see [`.claude/skills/INDEX.md`](.claude/skills/INDEX.md)):

- `phase-verify-loop` — close every phase with assume → check → verify → analyze → fix
- `bug-swarm-loop` — hard bug? Spawn 4-5 hunter sub-agents in parallel
- `audit-kpi-dashboard` — generate dashboards from operational data
- `test-coverage-writer` — write unit + integration tests systematically
- `refactor-readability` — refactor without behavior change
- `performance-hunter` — measured perf fixes, never blind
- `scholar-immortal` — capture every learning to `docs/learnings/` (knowledge compounds)
- `copyist-unlimited` — clone templates at scale (N variants)
- `legacy-php-sweep` — port from `D:\xampp\htdocs\pcscargo` to Pacred Next.js
- `qa-flow-simulator` — agent simulates a user journey end-to-end, asserts the real outcome (not just a 200)
- `branch-integrate-loop` — consolidate teammate branches into `dave` safely (integrate → verify → distribute)
- `mobile-first-verify` — render a customer surface at 360/390px + assert it's mobile-clean before pushing
- `legacy-fidelity-check` — audit a D1 port screen against its legacy PCS original before shipping (the owner's "copy 100% first" gate)
- `landing-conversion-audit` — pre-flight a landing page for conversion + tracking + Quality-Score before ads point at it

When a situation matches a skill's description → invoke via the Skill tool (`skill: <name>`). Or describe the situation and let the harness match.

## 10. Capture learnings (immortal scholar)

Every time you learn something tricky — a Next 16 gotcha, a Vercel surprise, a working solution after debugging, a partner-API quirk — write to `docs/learnings/<topic>.md` per the `scholar-immortal` SKILL.md protocol. Even small entries compound. Pacred-specific knowledge that no LLM training has = our moat.

## 11. Production deploy gate — `next start` smoke, not just `pnpm verify`

`pnpm verify` (lint/tsc/test/audit) and `pnpm build` passing does **not** prove pages work in production — none of them execute a real render, and a route can 500 at request time while `build` exits 0. `next dev` masks it too (always renders dynamically). This is how the 2026-05-16 `DYNAMIC_SERVER_USAGE` 500 reached prod.

**Before any deploy to `main`:** `pnpm build && pnpm start`, then `curl` every NEW or CHANGED route (especially dynamic `[param]` routes) — each must return 200 (or an intended 3xx/404). A 500 there = a 500 in production. Full procedure: "Production smoke gate" in [`.claude/skills/phase-verify-loop/SKILL.md`](.claude/skills/phase-verify-loop/SKILL.md).

**The route smoke is necessary but NOT sufficient — it cannot detect a dead database.** Public pages degrade to `200` and protected pages `307`-redirect *before* any DB query, so "every route → 200/307, zero 500s" passed even against a deleted Supabase project on launch day (`docs/learnings/ci-and-deploy-gotchas.md`). To gate a deploy, also run the [`qa-flow-simulator`](.claude/skills/qa-flow-simulator/SKILL.md) skill (asserts a real DB row / balance delta — the functional quality gate) or probe the DB directly: `curl https://<ref>.supabase.co/auth/v1/health` (live → `401 no apikey`; deleted → NXDOMAIN).

**Pattern rule:** a page under a dynamic segment (`[slug]`/`[port]`/`[id]`) that renders `<NavBar>` (or anything reading cookies/auth) MUST have `export const dynamic = "force-dynamic"` — else `DYNAMIC_SERVER_USAGE` 500. See [`docs/learnings/nextjs-16-quirks.md`](docs/learnings/nextjs-16-quirks.md).

## 12. Docs: every `.md` ≤ 2000 lines · no duplication

- **Hard cap: every `.md` file ≤ 2000 lines.** If a file would exceed it, split into a new file and cross-link both ways — never let one file grow past the cap. Agents read docs into a context window; oversized files truncate mid-content.
- **One canonical home per fact — no duplication.** Information lives in exactly ONE file; everywhere else links to it. When you edit a doc and spot the same content duplicated elsewhere, delete the copy and leave a link. Dedup what you touch.
- Detail in [`docs/conventions.md`](docs/conventions.md) §13.

## 13. Worktree base is stale — resync to `dave` before trusting it

A `git worktree` (including the `.claude/worktrees/*` one a session or a spawned `isolation: "worktree"` agent runs in) is **cut from a point-in-time snapshot, and `origin/HEAD` points at `origin/main`** — the *held* production branch, which on this team lags the live integration branch `dave` by dozens of commits. Acting on a stale base re-derives fixes that already exist, fails task premises ("file X is missing" when X is on `dave`), and sets up merge conflicts.

**Rule — at session start (this is §1's `git fetch` step) and in every spawn prompt for a worktree agent:**
```bash
git fetch origin && git merge origin/dave --no-edit && git log --oneline -3
```
- If a task says "X is broken/missing on `dave`" but `ls`/`find` can't see X → **stop and reconcile branch ages**, don't "fix" a phantom. `git worktree list` → the `[dave]` line is the live checkout; inspect THAT, or `git show dave:<file>`.
- When you spawn a worktree-isolation agent, the spawn prompt MUST tell it to resync to `dave` first — otherwise it surveys `origin/main` and reports a stale picture.

Three separate sessions lost time to this; full detail + recovery steps in [`docs/learnings/ci-and-deploy-gotchas.md`](docs/learnings/ci-and-deploy-gotchas.md).

---

For project facts (architecture, schema, env, branches, decisions): see [CLAUDE.md](CLAUDE.md) and the linked docs.
For master strategic single-read: see [docs/STRATEGY.md](docs/STRATEGY.md).
