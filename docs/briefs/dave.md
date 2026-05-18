# เดฟ — Project Lead / Integrator

Last reviewed: 2026-05-18 (post-launch — see latest [`runbook/team-status-*.md`](../runbook/) for current state)
Branch: `dave` (integration) → merges into `main` via ก๊อต gate · Authority: second-tier owner

## 🎯 Current state — POST-LAUNCH (production live since 2026-05-17)

🟢 Pacred launched. The cargo revenue path works end-to-end. U1/U2/U4 **and the Tier 0/1/2 capability batches** are shipped on `dave`. The canonical forward roadmap is [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) — read it first; the post-launch capability synthesis [`research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) seeded it and its §"Work split" table mirrors the pickup list below.

**เดฟ now — pickup list (integrator + post-launch driver):**

1. **Run the `dave→main` deploy** — gated on ภูม recreating dev Supabase + applying migrations `0058`-`0080` to prod. A staged, all-green 1-command fast-forward — fires the moment ภูม confirms the migration gate. See [`runbook/poom-handoff-2026-05-18.md`](../runbook/poom-handoff-2026-05-18.md).
2. **Tier-0 dashboard (with ก๊อต)** — flip the monitoring env vars in Vercel (Sentry / GTM / GA4 / Clarity / hCaptcha / Upstash) · verify Google Search Console + submit the sitemap · claim Google Business Profile · set up Meta Business Suite. *The one thing still blocking ad-conversion visibility — this also covers connecting Meta + TikTok pixels via the GTM container.* Checklist → [`runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md).
3. **Integration cycle** — keep merging ภูม/ปอน pushes into `dave`, verify, distribute back (the `branch-integrate-loop` skill).
4. **Platform observability — IO-1 ✅ SHIPPED** (`50729cf`) — auto-incident capture (`error.tsx` / `global-error.tsx` + Server-Action wrapper + Sentry-webhook ingest, *no submit button*) + `platform_incidents` (migration `0077`) + `/admin/incidents` triage queue + the `/my-issues` customer view. ⚠️ migration `0077` must be applied to prod to activate it. **Next: IO-2** (unified event log + per-dept KPI panels) → [`research/platform-observability-system-2026-05-18.md`](../research/platform-observability-system-2026-05-18.md).
5. **Monitor post-deploy** — Sentry + `admin_audit_log` + Clarity for first-customer issues. Re-run `qa-flow-simulator` functional QA once ภูม posts the new dev Supabase ref (blocked until then). CSP-1 nonce migration ships week 2 (≈ Mon 2026-06-01).

**Carried-over / ongoing:**
- **V-F1 legacy-cutover burn-down** — track each legacy dependency removal (China product API · server · SMS) toward the locked legacy-retirement date (week 10, 2026-07-27). F1-* weekly check-ins → [`runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md).
- **Production flag verification** — confirm `OTP_BYPASS=false`, `LINE_PUSH_BYPASS=false`, and the first `OTP_PEPPER` quarterly rotation are settled in prod post-launch.

---

## 🚀 Post-launch focus (read FIRST)

The emergency cargo sprint is over — Pacred is in production. คุณคือ integrator: keep ภูม + ปอน + ก๊อต shipping cleanly, drive the post-launch roadmap, watch production.

**The lens:** does this make the product more **true** / **billable** / **measurable**? — and never ship a stage before the quality gate is green.

**Sequenced post-launch work** → [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) is the canonical forward roadmap. It was seeded by [`research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) — Tier 0 connect (✅ code shipped, dashboard pending) → Tier 1 buy-bridge (✅ shipped) → Tier 2 internal OS (✅ work-board shipped) → Tier 3 owner systems (designed). The earlier U1-U4 sequence has all shipped. The cargo + gap-hunt backlogs they draw from = [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V + Part W.

**Defer:** Phase I (9 new ecosystem services) until revenue is stable. U3 tools + Tier-3 systems are partner-/volume-scheduled.

---

## 🔒 Force-read before any work

1. **[`docs/UPGRADE_PLAN.md`](../UPGRADE_PLAN.md)** — THE canonical forward roadmap (post-launch phase/stage plan)
2. [`docs/research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) — the Tier 0/1/2/3 synthesis + work-split that seeded the roadmap
3. [`docs/team.md`](../team.md) §3 (daily workflow) + §3.0 (push frequency — STRICTER now)
4. [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V/W — the cargo + gap-hunt backlogs the roadmap draws from
5. [`docs/decisions/0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md) — V2 scope rules (DON'T refactor mid-flight)
6. [`docs/pacred-info.md`](../pacred-info.md) — company DNA SOT
7. Memory: `pacred_company_dna` + `owner_pop_v2_v3_strategy` + `push_frequency_strict` (load via /memories — not in repo)

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
| ภูม hasn't cleared the migration gate | Tier-0 dashboard work · start platform-observability IO-1 |
| ภูม hasn't posted the new dev Supabase ref | Build platform-observability IO-1 (no dev-DB dependency for the design/scaffold) |
| ก๊อต hasn't flipped the monitoring env vars | Integration cycle — consolidate ภูม/ปอน pushes; review staged `dave` |

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
