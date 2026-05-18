# เดฟ — Project Lead / Integrator

Last reviewed: 2026-05-18 (post-launch — see latest [`runbook/team-status-*.md`](../runbook/) for current state)
Branch: `dave` (integration) → merges into `main` via ก๊อต gate · Authority: second-tier owner

## 🎯 Current state — DIRECTION PIVOT "D1" (2026-05-18)

🔴 **The owner rejected the rebuilt Pacred app** — its UI *and* its workflow logic-loop look nothing like the legacy **PCS Cargo** system that staff + ~8,898 customers run on daily. **New direction (D1):** Pacred *becomes* the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`. Not a reinterpretation; a faithful port. Read [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) in full — it is the canonical D1 source of truth and supersedes the Tier 0/1/2/3 capability roadmap framing of [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

D1 runs in three phases — **A** data migration · **B** workflow fidelity · **C** Pacred enhancements (the old Tier roadmap + Phase-2 build queue, *deferred not cancelled*, re-sequenced after the faithful port). You drive Phase A and integrate Phase B.

**เดฟ now — pickup list (Phase-A driver + integrator):**

1. **Drive the data migration to production — TOP priority (Phase A).** The pipeline is built and the dry-run is validated — all 117 `pcsc_main` tables load clean into PostgreSQL and reconcile MySQL ↔ PG exactly (0 failures · 0 mismatches); the legacy-password auth bridge is verified. The production load is gated on **your review + go**. Runbook → [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — §6 is the step-by-step prod-load procedure. Before you give the go you need: (a) แต้ม's customer-upload files (`images/users`, `images/shops`, `storage/file`, `storage/slip` — runbook §7, held by แต้ม), (b) a final fresh `pcsc_main` dump at cutover (the 2026-05-18 export will be stale), (c) ก๊อต's production-load gate sign-off. Decide the two open items in runbook §7: the 8 special `PCS<letters>` userIDs and the `PR1`–`PR5` new-customer numbering.
2. **Coordinate Phase B** — workflow fidelity. Sequence ภูม (Phase-B backend — rework admin + customer-portal backend onto the ported `tb_*` schema + legacy workflow) and ปอน (Phase-B frontend — rework the customer UI to match the legacy PCS look + flow). The legacy-vs-Pacred gap map in [`docs/research/`](../research/_index.md) (`PACRED-GAP-ANALYSIS.md` + the `gap-*.md` set) is their Phase-B input — point them at it and break it into a Phase-B work-split.
3. **Integrate the team's Phase-B work** — keep merging ภูม/ปอน pushes into `dave`, verify, distribute back (the `branch-integrate-loop` skill).
4. **Decide the fate of the superseded scaffolding** — the pre-D1 PCS-customer-migration approach (migration `0067_pcs_customer_migration.sql`, the `u2-1-pcs-customer-migration.md` runbook, `actions/admin/pcs-migration.ts`) is replaced by the Phase-A full-system port; the rebuilt `profiles`-era schema coexists with the ported `tb_*` tables during the transition, then retires. Decide when/how it retires.

**Carried-over / ongoing:**
- **Production watch** — Sentry + `admin_audit_log` + Clarity for issues on the currently-live `main`. CSP-1 nonce migration still scheduled week 2 (≈ Mon 2026-06-01).
- **Production flag verification** — confirm `OTP_BYPASS=false`, `LINE_PUSH_BYPASS=false` are settled in prod.

---

## 🚀 D1 focus (read FIRST)

The owner rejected the rebuild on 2026-05-18 — Pacred pivots to a **faithful port** of the legacy PCS Cargo system (`PCS` → `PR`). คุณคือ integrator + Phase-A driver: get the 117-table data migration into production, then sequence and integrate the team's Phase-B workflow-fidelity rework.

**The lens for D1:** fidelity to the legacy PCS system — staff and customers must need **zero retraining**. Don't reinterpret the legacy workflow; reproduce it. Never ship a stage before the quality gate is green.

**Sequenced D1 work** → [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) is the canonical plan (Phase A → B → C). The Tier 0/1/2/3 capability roadmap and the Phase-2 build queue (booking flow, customer-intelligence, internal-chat, disbursement, china-ops, platform-observability) are **deferred to Phase C** — re-sequenced after the faithful port, not cancelled. `UPGRADE_PLAN.md` is now historic context for Phase C, not the current execution doc.

**Defer to Phase C:** the entire Tier 0/1/2/3 roadmap + the Phase-2 build queue. Phase I (9 new ecosystem services) stays deferred behind that.

---

## 🔒 Force-read before any work

1. **[`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)** — ADR-0017, the canonical D1 source of truth (faithful PCS port, Phase A/B/C)
2. **[`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)** — the Phase-A migration runbook (§6 prod-load procedure, §7 open items you decide)
3. [`docs/research/PACRED-GAP-ANALYSIS.md`](../research/PACRED-GAP-ANALYSIS.md) + the `gap-*.md` set — the legacy-vs-Pacred gap map, your Phase-B work-split input
4. [`docs/team.md`](../team.md) §3 (daily workflow) + §3.0 (push frequency — STRICTER now)
5. [`docs/decisions/0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md) — V2 scope (superseded by ADR-0017: V2 is now "faithful PCS port", not "rebuilt owner-pleaser")
6. [`docs/pacred-info.md`](../pacred-info.md) — company DNA SOT
7. Memory: `pacred_company_dna` + `feedback_legacy_port_fidelity` + `push_frequency_strict` (load via /memories — not in repo)

---

## Who you are

**Project Lead + Integrator.** You operate from `dave`. You:

- Consolidate ปอน + ภูม work into `dave` (staging point)
- Cover landing structure with ปอน (เดฟ + Claude = ปอน's structural assist)
- Prep work for ภูม — write specs, hand off ADRs from ก๊อต, sequence the backend backlog
- Hand off advanced / decision-heavy items to ก๊อต (don't do everything yourself)
- Cover ภูม + ปอน when they're blocked
- "ปอนจะโดนลูกพี่ บีฟบ่อยสุด" — owner critiques landing the most; structure stays your job

Per เดฟ brief 2026-05-16: "**เตรียมงานให้ภูมิในส่วนที่เดฟทำ แล้วเอาเรื่องขั้นสูงแบ่งให้กอต ทำกับภูมิ ให้ทั้งหมดทุกคนทำงานขนานไปด้วยกันทั้งหมด แล้วเดฟจะมาช่วยวางโครงสร้างหน้าบ้านกับปอนต่อแล้ว ต้อง cover หน้าบ้าน**"

---

## 🟢 What shipped (this phase — for reference)

- **Analytics + monitoring scaffolds** — GTM + Clarity + cookie-A/B + 9 conversion events + 13 CTA surfaces · Sentry SDK · Upstash rate-limit (6 actions) · hCaptcha (3 forms + 5 actions) — all wired + graceful-degrade
- **LINE Messaging API + LIFF** · 6 cron jobs + `CRON_SECRET` hardening · PromptPay soft-degrade · OTP dual-pepper rotation support
- **Audit tooling** — `pnpm audit:md / env / i18n / all` + `pnpm verify` umbrella in CI
- **Cargo-ops forensics** — decoded the cargo/freight model → [`audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) + PORT_PLAN Part V backlog
- **U1-U4 + Tier 0/1/2** — wire-the-flow · revenue/margin · supervisory layer · lead funnel connected · `/start-order` buy-bridge · `work_items` work-board — all integrated + verified on `dave`
- **~700 new test assertions** — 11 test files covering the new validators

---

## Blockers + alternatives

When you're blocked:

| Blocked on | Alternative work |
|---|---|
| แต้ม hasn't sent the customer-upload files / fresh dump | Coordinate Phase B — break the gap map into a Phase-B work-split for ภูม + ปอน |
| ก๊อต hasn't given the production-load gate sign-off | Dry-run the prod-load procedure on a throwaway PG; review staged `dave` Phase-B work |
| Phase B not yet underway | Decide the fate of the superseded pre-D1 migration scaffolding (`0067` · `pcs-migration.ts`) |

**Note back to ก๊อต when:** the Pacred owner sends creds, a partner needs a decision, or a security concern surfaces.

---

## Hand-offs IN

- **ก๊อต** ADRs + external creds → you action (activate, redeploy, verify)
- **ปอน** SEO/landing PRs in `podeng` branch → you merge into `dave`
- **ภูม** backend feature PRs in `Poom` branch → you merge into `dave`
- **Pacred owner** ad-hoc requests → you triage + sequence

## Hand-offs OUT

- Backend specs → ภูม picks up
- Landing structure scaffolds → ปอน takes design lead
- Hard decisions → ก๊อต writes ADR
- Merged `dave` → ก๊อต reviews + merges to `main`

---

## Push discipline (STRICTER now per memory `push_frequency_strict`)

- Commit local freely during the session
- **Push to `origin/dave` only at save-points** — end of session / before sleep / machine change / big batch done
- Per Claude Code session: **1 push max** (used to be 1-3/day; now save-points-only)
- All 4 teammates following the same discipline now

## Cross-links

- [`docs/team.md`](../team.md) §3 — daily flow
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V/W — cargo + gap-hunt backlogs
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — the warehouse/container/shipment spine
- [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — partner integration ก๊อต locks, you scaffold
- [`docs/decisions/0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md) — V2 scope rules you enforce
- [`docs/briefs/ops-roles.md`](ops-roles.md) — staff role contexts informing admin design
