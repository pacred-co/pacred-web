# ปอน — Frontend / Customer Portal UI / Landing / SEO

Last reviewed: 2026-06-10 (docs-refresh — branch + standing brand-asset rule synced)
Branch: **`InwPond007`** (primary since 2026-05-28; `podeng` = older sub-task branch) — push to own branch only; เดฟ merges `InwPond007` → `dave-pacred` → `main`

> ## 🎯 2026-05-30 MASTER GAP AUDIT — your lane (read FIRST)
> Full audit: **[`docs/research/legacy-gap-2026-05-30/_MASTER.md`](../research/legacy-gap-2026-05-30/_MASTER.md)** §6 (your 6 tasks) + §8 reachability. **Your lane = customer FRONTEND + data-analysis/monitoring/sync-platform/dashboards. NO write-path / `tb_*`-mutation work** (that's เดฟ/ภูม) — all your tasks are parallel-safe, frontend/read-only.
>
> **Your tasks:**
> 1. **🔴 Orphan / entry-point sweep (reachability — owner directive)** — for every route under `(admin)/admin/*` + `(protected)/*`, confirm ≥1 inbound `<Link>`/sidebar/button. Zero-inbound = orphan → wire nav or flag for delete. Output an orphan-route table. Sprint-0 parallel-safe. (AGENTS.md §0d)
> 2. **3 monitoring/usage dashboards** (read-only) — ยอดการค้นหา (`tb_history_key`) · China search-API volume/cost · SMS usage (`tb_sms_hs`).
> 3. Notification-center + broadcast-popup fidelity (M-1, coordinate `tb_notify` write-target with เดฟ).
> 4. ToS gate fidelity (M-2) · member-root dashboard fidelity (M-5) · receipt/popup polish · status-color/label drift sweep.
>
> The new `cust-08-notify-gates` lane (M-1..M-5: broadcast popups · ToS · re-verify · credit-due nudges) is mostly yours + เดฟ. Branding stays podeng style (you're the brand SOT).

> ## 🚨 2026-05-24 STRATEGY RESET (READ FIRST)
>
> Owner cleaned up branch model. `faithful-port` branch deleted — your flow now goes direct via `dave-pacred` to `main` (ก๊อต gates).
>
> **Just merged into `dave-pacred` (commit `d7b1758`):** your 4 commits including:
> - `5097a2b` feat(home): related-tags + bottom banner + FCL single-price + mobile polish
> - `fbb63fe` feat(podeng): rebuild (protected) chrome + /dashboard in Tailwind, drop legacy CSS leak
>
> เดฟ verifies + pushes to main (next stop after your save-points).
>
> **Your lane unchanged:** customer-facing frontend + brand-asset swap + customer-portal UI fidelity. ก๊อต now leads the admin 1:1 lane (was ภูม before). ภูม resumes V3 enhancements on Poom-pacred (UNLOCKED).
>
> **READ FIRST:**
> - [`docs/research/d1-deep-audit-2026-05-24.md`](../research/d1-deep-audit-2026-05-24.md) — gap analysis
> - [`docs/runbook/faithful-port-plan.md`](../runbook/faithful-port-plan.md) — updated branch model
> - [`docs/research/podeng-brand-asset-swap-2026-05-20.md`](../research/podeng-brand-asset-swap-2026-05-20.md) — your brand-swap inventory (16-icon launchpad set still missing from owner)
>
> **READ FIRST:**
> - [`docs/research/poom-save-point-2026-05-19-night.md`](../research/poom-save-point-2026-05-19-night.md) — branch state · per-role lanes
> - [`docs/runbook/faithful-port-transcription.md`](../runbook/faithful-port-transcription.md) — the method (with §8 admin-specific pattern · though customer pattern is the canonical one for your lane)
> - [`.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md) — supporting skill
> - [`docs/runbook/faithful-port-plan.md`](../runbook/faithful-port-plan.md) — the plan · branch model · the 4-person work-split · status
>
> **🎨 YOUR ADDED TASK — the brand-asset swap.** The 1:1 transcription uses the
> **legacy PCS raster assets** as placeholders wherever a proper `PR` asset does
> not exist yet — icons, emoji-images, logos, background images — staged under
> `public/legacy/pcs/`. **Sweep every one and swap to the official Pacred `PR`
> asset.** Until a `PR` asset exists the legacy one stays (keeps the screen 1:1);
> your job is to make the list shrink. Flag anything where no `PR` equivalent
> exists so เดฟ/owner can source it.
>
> **⚠️ Standing rule for EVERYONE ELSE (L-PAS-06 · threaded 2026-06-10):** ปอน
> refreshes brand-asset image files **in place** — same filename, new binary
> content, even under `public/legacy/pcs/`. Other lanes MUST NOT move, rename,
> or swap any image path ปอน has touched (check her latest commits first).
> Brand-leak scrubs are code-level URL rewrites only — never relocate a
> `public/` file she owns. Full lesson:
> [`docs/learnings/parallel-agent-sprints.md`](../learnings/parallel-agent-sprints.md) L-PAS-06.

## 🎯 Direction — D1: Pacred is a faithful PCS Cargo port

🔴 The owner rejected the rebuilt Pacred app — its UI *and* its workflow look
nothing like the legacy **PCS Cargo** system that staff + ~8,898 customers run
on daily. **D1:** Pacred *becomes* the legacy PCS Cargo system, faithfully —
rebranded `PCS` → `PR`. Owner rule (verbatim): **"copy the original to 100%
sameness FIRST, then improve."** Canonical SOT →
[`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
— read it in full. It supersedes the capability-roadmap framing of
[`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

Three phases: **A** data migration · **B** workflow fidelity · **C** Pacred
enhancements. **Pause the pre-D1 backlog** — the booking-flow detail page, the
customer-intel behavior-tracking, the frontend-tooling landing template, the
public-marketing/SEO push, A/B experiments, the Phase I ecosystem landings are
all **Phase C now** (deferred, *not cancelled*). Your work is **Phase B
frontend**.

## 🟢 Where the project is now

- 🟢 **Phase A — DONE (data loaded).** ~8,898 customers + their orders /
  wallets / shipments are migrated into Supabase **dev + prod** behind the
  117-table `tb_*` schema (`PCS`→`PR` rebranded). **Phase-B frontend is fully
  GO.** ภูม reworks the customer-portal *backend* onto `tb_*` in parallel —
  coordinate the data contract (the legacy `tb_*` status values are the
  canonical vocabulary for your status reconcile).
- 🟢 **Phase B — wave 1 integrated.** The customer 9-icon launchpad home + the
  customer order flow (`/service-order`) are reworked and on `dave`. Wave 1 is
  a *first pass*, not yet element-by-element fidelity-verified.
- ⚪ **Phase C** — deferred (booking-flow detail page · customer-intel tracking
  · frontend-tooling template · SEO/ads push · A/B · Phase I landings).
  Marketing landing pages already shipped stay live; *new* marketing/SEO build
  work waits.

## 🧭 Your lane — PHASE-B FRONTEND ONLY (execution)

เดฟ + ก๊อต are the senior lane; you + ภูม execute. **You own Phase-B frontend
only** — the remaining customer-facing screens, reworked faithfully to the
legacy PCS look + flow, mobile-first, every screen through the
[`legacy-fidelity-check`](../../.claude/skills/legacy-fidelity-check/SKILL.md)
skill. Goal: the ~8,898 existing customers need *zero* retraining.

✋ **Not your lane:** the customer-portal backend / server actions / `tb_*`
queries (ภูม owns backend). Integration (เดฟ). You stay on
`app/[locale]/(public)/`, `components/sections/`, `components/booking/`,
`components/knowledge/`, `components/ui/`, `messages/*.json`, `public/`,
`components/seo/*`.

## 🔱 Phase-B is wave-driven — review before you take a screen

เดฟ + Claude execute the Phase-B customer-UI rework via spawned worktree agents
that land on `dave`, wave by wave, so the team works one direction. **Wave 1 is
integrated** (launchpad home + order flow). Your role on a landed screen: pull
`dave` often → **review + fidelity-verify** each customer screen — the legacy
PCS look + flow, mobile-first at 360/390px, TH+EN i18n parity — and fix the
gaps the agents miss. **Ping เดฟ before taking a fresh screen** so each surface
has exactly one owner.

## 🟡 Your pickup list (Phase-B frontend, priority order)

1. **Rework the remaining customer screens to the legacy PCS look + flow —
   TOP priority.** Wave 1 covered the launchpad home + order flow; the rest are
   yours: **login · register · payment · wallet · address · account ·
   shipment**. Rework each so the layout, navigation, and screen-to-screen
   flow **match what the ~8,898 existing customers already know** — faithful to
   legacy PCS, mobile-first. Spec →
   [`research/d1-fidelity-customer.md`](../research/d1-fidelity-customer.md)
   (the rigorous 11-screen per-element gap map).
2. **Reconcile the divergent status vocabularies.** The rebuilt app's job /
   order statuses don't line up with the legacy PCS status words customers
   recognise. Map the rebuilt status labels onto the legacy PCS vocabulary
   across every customer-visible surface. Coordinate with ภูม — the legacy
   `tb_*` schema carries the canonical status values.
3. **Match the legacy PCS visual language** — work through
   [`d1-fidelity-customer.md`](../research/d1-fidelity-customer.md) +
   the [`d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md) overview so
   every customer screen reads as the same system, rebranded.
4. **Fidelity-verify the wave-1 customer screens** — run
   [`legacy-fidelity-check`](../../.claude/skills/legacy-fidelity-check/SKILL.md)
   on the launchpad home + order flow against legacy PCS; flag gaps to เดฟ.

**Ongoing (self-directed, fit around the pickups):**
- **i18n parity** — keep TH + EN in sync as you rework; watch
  `pnpm audit:i18n` for new untranslated keys.
- **Mobile-first** — every reworked screen checked at 360/390px per
  [`conventions.md`](../conventions.md) §11 + the
  [`mobile-first-verify`](../../.claude/skills/mobile-first-verify/SKILL.md)
  skill (most Pacred customers arrive on phones — fidelity must not break mobile).

**Deferred to Phase C (not a current pickup):** the booking-flow detail page,
the customer-intel behavior-tracking instrumentation, the frontend-tooling
landing template, the public-marketing / SEO push, A/B experiments, the Phase I
ecosystem-service landings — all re-sequenced after the faithful port.

## ✋ Non-collision rule

You = the customer-facing frontend surfaces. ภูม = backend (admin routes +
server actions + `tb_*` queries). เดฟ integrates + drives the Phase-A backfill.
**One owner per surface** — coordinate via เดฟ before taking a fresh surface.

## 🔒 Force-read before any work

1. [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
   — ADR-0017, the canonical D1 SOT
2. [`research/d1-fidelity-customer.md`](../research/d1-fidelity-customer.md) —
   the rigorous customer-portal fidelity gap map (11 screens, per-element),
   your **Phase-B rework spec** · overview
   [`d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md)
3. [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) —
   context for the `tb_*` schema behind the reworked screens
4. [`team.md`](../team.md) §1 (your scope) + §3 (daily flow)
5. [`conventions.md`](../conventions.md) §7 (i18n) + §11 (UI — mobile-first) +
   §12 (Performance/SEO)
6. [`pacred-info.md`](../pacred-info.md) — company DNA SOT — every contact UI
   element imports from `components/seo/site.ts`

## Who you are

**100% หน้าบ้าน + SEO + Marketing.** You operate from `podeng`. You build the
customer-facing UI, landing pages, and the acquisition funnel; own SEO and
mobile UX; keep i18n (TH + EN) complete. Under D1 your top job is the Phase-B
customer-screen rework; the marketing/SEO build is Phase C. Owner critiques
landing the most → เดฟ helps with structural decisions → you execute the design.

## Scope boundaries (per `team.md` §1.3)

✋ **You don't touch:** `actions/`, `lib/`,
`app/[locale]/(auth|protected|admin)/`, `supabase/migrations/`, `app/api/`
(ภูม owns). ✋ **Lead-only:** `CLAUDE.md`, `docs/team.md`,
`docs/conventions.md`, `docs/env.md`, `docs/PORT_PLAN.md`, `package.json`,
`.github/`, `next.config.ts`, `eslint.config.mjs`, `proxy.ts`, `vercel.json`.
✅ **You own:** `app/[locale]/(public)/`, `components/sections/`,
`components/booking/`, `components/knowledge/`, `components/ui/` (primitives),
`messages/*.json`, `public/` (assets), `components/seo/*`.

> ⚠️ The customer screens under `(protected)` are ภูม's path. Phase-B customer
> screen rework = a design contract you coordinate with ภูม via เดฟ — ภูม wires
> the `tb_*` data, you own the look + flow + i18n + mobile.

## Theme + design discipline

Theme tokens in [`app/globals.css`](../../app/globals.css) `@theme inline` —
red brand palette (`primary-600` = `#B30000`), semantic
`--color-foreground / background / surface / border / muted`, dark mode via
`.dark`. Use Tailwind utilities — no hex hardcoding except social-brand colors.
Font: `var(--font-prompt)`. Icons: `lucide-react` outline only. Mobile-first —
every change looks good at 360/390px AND 1440px.

## Blockers + alternatives

| Blocked on | Alternative work |
|---|---|
| The legacy PCS look for a screen is unclear from the gap docs | Move to a different customer surface's rework; flag the gap to เดฟ |
| ภูม hasn't confirmed the legacy `tb_*` status values for a surface | Rework the layout/navigation of another screen; reconcile statuses once ภูม posts the values |
| เดฟ hasn't assigned the next wave screen | Work the gap map directly — inventory which customer screens diverge from legacy |
| Owner critique comes in mid-task | Park current → handle owner critique → resume |

**Note back to เดฟ when:** the legacy PCS look/flow for a screen is ambiguous,
you need a structural call on reconciling the rebuilt UI with the legacy
layout, or you need ภูม's `tb_*` data contract.

## Hand-offs

**IN** — owner brief → เดฟ structural → you design + ship · เดฟ wave screen
assignments + structural skeletons (you execute) · ภูม `tb_*` data contracts
(you wire the UI to). **OUT** — reworked customer screens (faithful to legacy
PCS) → เดฟ merges into `dave` · i18n keys (TH + EN).

## Push discipline (per memory `push_frequency_strict`)

Commit local freely; **push to `origin/podeng` only at save-points** (end of
WFH stretch / before sleep / before owner review). 1 push per stretch. เดฟ
pulls from `origin/podeng` to consolidate. (ปอน takes 3 days WFH for
high-focus periods — push at the end of the stretch.)

## Cross-links

- [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — D1 SOT
- [`team.md`](../team.md) §1.3 — your scope boundaries
- [`research/d1-fidelity-customer.md`](../research/d1-fidelity-customer.md) — your Phase-B rework spec
- [`research/d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md) — Phase-B gap map overview
- [`conventions.md`](../conventions.md) §7/§11/§12 — i18n + UI + Perf-SEO rules
- [`pacred-info.md`](../pacred-info.md) — company info SOT
- `components/seo/site.ts` — `CONTACT`, `ADDRESSES`, `SOCIAL`, `LINE_OA` constants you import
