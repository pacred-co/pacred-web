# 🚀 Pacred Roadmap — post-launch V2

> **The single canonical forward plan** — phases, stages, and who-owns-what for
> `pacred-web` V2. Updated each save-point. Pacred launched 2026-05-17; V2 runs
> until พี่ป๊อป is satisfied with the owner-pleaser build.
>
> **This doc owns the SEQUENCE.** Per-system detail lives in the design docs
> (linked per item) — this plan does not duplicate them. Master single-read:
> [`STRATEGY.md`](STRATEGY.md). Backlogs it draws from: [`PORT_PLAN.md`](PORT_PLAN.md)
> Part V (cargo) + Part W (gap-hunt). Research that seeded it: [`research/`](research/_index.md).
>
> **Scope = V2 `pacred-web`.** V3 is a separate repo (`pacred-DPX`,
> [ADR-0010](decisions/0010-v2-v3-version-strategy.md)) — out of scope here;
> append V3 ideas to `v3-wishlist.md`.

---

## How to read this

- **Phase** = a band of work. **Stage** = a shippable increment inside a phase.
- A stage is DONE only when verified: `pnpm verify` + a production build smoke
  + a [`qa-flow-simulator`](../.claude/skills/qa-flow-simulator/SKILL.md)
  functional pass (see [AGENTS.md §11](../AGENTS.md)).
- **Mobile-first is cross-cutting** — every customer-visible stage is built +
  checked at a phone viewport. See [`conventions.md` §11](conventions.md) +
  [`mobile-first-playbook.md`](mobile-first-playbook.md). It is not a phase; it
  applies to all of them.

---

## Phase 0 — ✅ FOUNDATION (shipped — in production or staged on `dave`)

**Launch (2026-05-17)** — the cargo revenue path closes end-to-end (signup →
wallet → service-order → admin-paid → receipt); customer portal + 60+ admin
routes live. Prod deploys `314a528` + `4ef2ee6`.

**Post-launch U1-U4 upgrade** — all shipped on `dave`:
- **U1 wire-the-flow** — container unify · container→order status propagation ·
  arrival→billing gate · freight-chain auto-draft/convert · order auto-close ·
  refund money path.
- **U2 revenue/margin** — PCS→Pacred customer-migration tool · per-container
  cost + AP ledger · freight WHT gate · cargo_sacks.
- **U4 supervisory** — staff RBAC console · audit-log export · notification log
  · cron-health · 8-entity global search · customer credit line.

**Capability Tier 0/1/2** — shipped on `dave`:
- **Tier 0 — lead funnel** · `ContactForm` live on `/contact` (`b90806b`).
- **Tier 1 — buy-bridge** · `/start-order` + `QuoteCTA` · a CI `pnpm build`
  step · `/admin/kpi` executive dashboard (`bcd752c`).
- **Tier 2 — internal OS** · `work_items` cross-department board: `/admin/board`
  + `/admin/inbox` + migration `0080` (`bcd752c`).

> Detail + commit history: [`STRATEGY.md`](STRATEGY.md) §9 +
> [`research/capability-tools-strategy-2026-05-18.md`](research/capability-tools-strategy-2026-05-18.md).

---

## Phase 1 — 🚀 RELEASE (now → owner handoff)

| Stage | What | Owner | Gate |
|---|---|---|---|
| **R-1** | **`dave→main` deploy** — carry all of Phase 0's `dave` work to production. A staged, all-green, smoke-gated fast-forward. | เดฟ (gate: ก๊อต) | ภูม applies the post-launch migrations (`0058`-`0080`, per [`runbook/poom-handoff-2026-05-18.md`](runbook/poom-handoff-2026-05-18.md)) to prod Supabase |
| **R-2** | **Tier-0 dashboard** — the conversion-visibility unblock: flip the monitoring env vars in Vercel (Sentry · GTM/GA4 · Clarity · hCaptcha · Upstash — all code-wired + env-gated), verify Google Search Console + submit the sitemap, claim Google Business Profile, set up Meta Business Suite. | ก๊อต + เดฟ | checklist → [`runbook/launch-monitoring-golive-2026-05-17.md`](runbook/launch-monitoring-golive-2026-05-17.md) |

> R-2 absorbs the old "U1-8 launch-monitoring env" item — the code is ready;
> only the Vercel dashboard actions remain. Until R-2 is done Pacred runs ads
> with no conversion tracking — this is the highest-value unblocked task.

---

## Phase 2 — 🎯 TIER-3: the four owner systems (the bulk of forward V2)

Four systems the owner (พี่ป๊อป) named — each fully designed in
[`research/`](research/_index.md). Built in stages, MVP-first.

| # | System | MVP stage | Owner | Sequencing | Design doc |
|---|---|---|---|---|---|
| 1 | **Internal org-chat** — shipment/job-scoped work-comms | IC-1 | ภูม | rides on the shipped `0080` work-board | [`internal-chat-system`](research/internal-chat-system-2026-05-18.md) |
| 2 | **Disbursement** (เบิก-จ่าย) | stage 1 | ภูม | after IC-1 | [`disbursement-system`](research/disbursement-system-2026-05-18.md) |
| 3 | **China-ops** (ปิดตู้) | stage 1 | ภูม | **volume-gated** — build once own-container volume justifies it | [`china-ops-container-closing`](research/china-ops-container-closing-2026-05-18.md) |
| 4 | **Platform observability** (รายงานสถานะ Platform) | IO-1 | เดฟ | parallel — a different lane, non-colliding with ภูม | [`platform-observability-system`](research/platform-observability-system-2026-05-18.md) |

- **Build order** — ภูม: IC-1 → disbursement → china-ops. เดฟ: IO-1 in parallel
  (the monitoring lane).
- **Migration numbers** — assigned at build time, in build order; not
  pre-allocated. `0080` is the last taken. ภูม owns `0073`-`0079` + `0081`+; the
  platform-observability migration coordinates a number with ภูม.
- Per-system stages (IC-2…, IO-2/3/4, disbursement + china-ops stages) live in
  the design docs — not duplicated here.

> **Status note (2026-05-18 morning).** Phase 0 + Phase 1 R-2 code-side
> are complete; R-1 deploy waits on ภูม applying migrations `0058`-`0080`
> to prod Supabase (already applied to dev — verified). Phase 2 builds
> start once R-1 is live + observability dashboards from R-2 are emitting.

---

## Phase 3 — 🔭 FUTURE (signposted, not scheduled)

- **Native apps — Android + iOS.** Most Pacred customers are on phones; a
  native app is the next surface once the mobile web is solid. Keep V2 layouts
  component-clean + mobile-first so they port. A V2-tail / V3 candidate — not
  scheduled.
- **The 9 expansion services** — customs-broker matching · tax-refund · export
  · fumigation · consignment · pay-on-behalf · logistics/messenger (the service
  catalogue in [`../CLAUDE.md`](../CLAUDE.md) marked TBD). Phase I — after
  revenue is stable.
- **U3 partner-integration tools** — MOMO JMF sync (⏸ blocked: the on-record
  API host/format is wrong — needs ก๊อต to clear the real
  `api.momocargo.com:8080` REST spec) · NetBay ใบขนสินค้า · Customs Trader
  Portal · PEAK accounting · real-time ship tracking · fuel-surcharge
  calculator. Each is partner-credential-scheduled.
- **U2-1 backfill** — the PCS→Pacred customer-migration *tool* shipped; running
  the actual data backfill (with the `member_code_seq` offset so a migrated
  `PR1234` never collides with a fresh `PR001`) is an operational step for ภูม.
- **The polish backlog** — the old U4-3 tail (delivery-acknowledgement · yuan
  tax-invoice · wallet-tx lifecycle UX · admin view-as-customer · export hub ·
  editable business config · audit retention) + the [`PORT_PLAN.md`](PORT_PLAN.md)
  Part V / Part W remainder.
- **V3 (`pacred-DPX`)** — the employee-masterpiece rebuild, a separate repo
  ([ADR-0010](decisions/0010-v2-v3-version-strategy.md)). The owner signals when
  to start. Do not refactor V2 toward V3 — append ideas to `v3-wishlist.md`.

---

## Cross-cutting — applies to every phase

- **Mobile-first** — Pacred's customers arrive mostly on phones. Every
  customer-visible change is designed + verified at a phone viewport
  (360 / 390px) FIRST, then scaled up. [`conventions.md` §11](conventions.md) ·
  [`mobile-first-playbook.md`](mobile-first-playbook.md) · the
  `mobile-first-verify` skill.
- **Quality gate** — no stage ships without `pnpm verify` + a production build
  smoke + a `qa-flow-simulator` functional pass. [AGENTS.md §11](../AGENTS.md).
- **Save-point pushes** — commit freely; push at save-points only
  ([`team.md` §3.0](team.md)).
- **Pacred-identity guardrail** — the legacy PCS/TTP operation leaned on
  gray-channel practice (no-document "เหมาภาษี", HS-code / declared-value
  engineering). The R&D docs catalogue it as *lessons*, never *features*. Every
  money / tax / declaration / customs stage builds the legitimate,
  document-complete, fully-audited path only. Full statement:
  [`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md) §5.5.

---

## Work-split — who owns what next

| Owner | Next work |
|---|---|
| **ก๊อต** | Phase 1 R-2 Tier-0 dashboard (env vars · GSC · Google Business · Meta) · gate the `dave→main` deploy · clear the MOMO API docs · production watch |
| **เดฟ** | Phase 1 R-1 `dave→main` deploy (once ภูม clears the migration gate) · integrate the team's pushes · Phase 2 — BUILD platform-observability IO-1 · monitor post-deploy |
| **ภูม** | Phase 1 — apply migrations `0058`-`0080` to prod (unblocks R-1) · Phase 2 — BUILD: internal-chat IC-1 → disbursement → china-ops (volume-gated) · U1/U2 review follow-ups |
| **ปอน** | Frontend tooling (data-driven landing template) · **mobile-first hardening** of the customer surfaces · polish `/contact` + `/start-order` + `QuoteCTA` · SEO audit |

---

## Cross-references

- 📘 Entry point → [`HANDBOOK.md`](HANDBOOK.md) · master single-read → [`STRATEGY.md`](STRATEGY.md)
- 📋 Backlogs → [`PORT_PLAN.md`](PORT_PLAN.md) Part V (cargo) + Part W (gap-hunt)
- 🔬 Research that seeded the phases → [`research/_index.md`](research/_index.md) — esp. [`capability-tools-strategy-2026-05-18.md`](research/capability-tools-strategy-2026-05-18.md) + the 4 owner-system design docs
- 🗄 The migration gate → [`runbook/poom-handoff-2026-05-18.md`](runbook/poom-handoff-2026-05-18.md)
- 🧭 V3 (separate repo — NOT this plan) → [ADR-0010](decisions/0010-v2-v3-version-strategy.md)

---

**End — `UPGRADE_PLAN.md`.** Phase 0 ✅ foundation → Phase 1 🚀 release →
Phase 2 🎯 the four owner systems → Phase 3 🔭 future. Mobile-first + the
quality gate apply across all of them.
