# เดฟ — Project Lead / Integrator

Last reviewed: 2026-05-18 (post-launch — see latest [`runbook/team-status-*.md`](../runbook/) for current state)
Branch: `dave` (integration) → merges into `main` via ก๊อต gate · Authority: second-tier owner

## 🎯 Current state — POST-LAUNCH (production live since 2026-05-17)

🟢 Pacred launched. The cargo revenue path works end-to-end. U1/U2/U4 batches are shipped on `dave`. The post-launch roadmap is [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

**เดฟ now (integrator + post-launch driver):**
1. **`dave→main` deploy** — gated on ภูม recreating dev Supabase + applying migrations `0058`-`0072` to prod. The push is a 1-command fast-forward, staged + all-green — fires the moment ภูม confirms. See [`runbook/poom-handoff-2026-05-18.md`](../runbook/poom-handoff-2026-05-18.md).
2. **U1-8 monitoring env** — flip Sentry / GTM / Clarity / hCaptcha / Upstash in Vercel per [`runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md).
3. **Integration cycle** — keep merging ภูม/ปอน pushes into `dave`, verify, distribute back (the `branch-integrate-loop` pattern).
4. **Re-run `qa-flow-simulator`** functional QA once ภูม posts the new dev Supabase ref (blocked until then).
5. **Monitor** Sentry + `admin_audit_log` + Clarity for first-customer issues; CSP-1 nonce migration week 2 (≈ Mon 2026-06-01).

---

## 🚀 Post-launch focus (read FIRST)

The emergency cargo sprint is over — Pacred is in production. คุณคือ integrator: keep ภูม + ปอน + ก๊อต shipping cleanly, drive the post-launch UPGRADE roadmap, watch production.

**The lens:** does this make the product more **true** / **billable** / **measurable**? — and never code an UPGRADE_PLAN item before its §0 gate is green.

**Sequenced post-launch work** → [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) — §0 gate → U1 wire-the-flow (✅ shipped) → U2 revenue/margin (✅ shipped) → U3 ecosystem tools → U4 supervisory (✅ shipped). The cargo + gap-hunt backlogs it draws from = [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V + Part W.

**Defer:** Phase I (9 new ecosystem services) until revenue is stable. U3 tools are partner-scheduled.

---

## 🔒 Force-read before any work

1. **[`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part T** (emergency — your T-D1..T-D4)
2. [`docs/team.md`](../team.md) §3 (daily workflow) + §3.0 (push frequency — STRICTER now)
3. [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part S4 (เดฟ self-batch — normal pipeline items)
4. [`docs/decisions/0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md) — V2 scope rules (DON'T refactor mid-burn)
5. [`docs/pacred-info.md`](../pacred-info.md) — company DNA SOT
6. Memory: `pacred_company_dna` + `cash_burning_p0_emergency` + `owner_pop_v2_v3_strategy` + `push_frequency_strict` (load via /memories — not in repo)

---

## Who you are

**Project Lead + Integrator.** You operate from `dave`. You:

- Consolidate ปอน + ภูม work into `dave` (staging point)
- Cover landing pivot (Phase P4): help ปอน structure landing pages (เดฟ + Claude = ปอน's structural assist)
- Prep work for ภูม — write specs, hand off ADRs from ก๊อต, sequence the backend backlog
- Hand off advanced / decision-heavy items to ก๊อต (don't do everything yourself)
- Cover ภูม + ปอน when they're blocked
- "ปอนจะโดนลูกพี่ บีฟบ่อยสุด" — owner critiques landing the most; structure stays your job

Per เดฟ brief 2026-05-16: "**เตรียมงานให้ภูมิในส่วนที่เดฟทำ แล้วเอาเรื่องขั้นสูงแบ่งให้กอต ทำกับภูมิ ให้ทั้งหมดทุกคนทำงานขนานไปด้วยกันทั้งหมด แล้วเดฟจะมาช่วยวางโครงสร้างหน้าบ้านกับปอนต่อแล้ว ต้อง cover หน้าบ้าน**"

---

## Current state of your domain

### 🟢 Done (this two-week sprint)

Infrastructure scaffolds shipped + wired:

- **Analytics stack** — L-22 GTM + L-23 Clarity + L-24 A/B (cookie-based) + 9 conversion events + 13 CTA surfaces + `home_hero_cta` live experiment
- **Sentry SDK** (D-11) — scaffolded, awaits DSN from ก๊อต
- **Upstash rate-limit** (D-12) — wired into 6 server actions
- **hCaptcha** (D-13) — wired into 3 forms + 5 actions
- **LINE Messaging API + LIFF** — creds set, code scaffolded (D-1-LIFF + LINE_OA constants)
- **Cron jobs** — 5 routes scaffolded (sales-daily-digest, refresh-active-customers, expire-probation, expire-driver-assignments, auto-cancel-orders) + CRON_SECRET hardening (D-17)
- **PromptPay** soft-degrade — friendly notice instead of throw
- **OTP dual-pepper** rotation support + runbook
- **OWASP audit + PCS scrub + footer i18n + dead URL/comment cleanup**
- **Audit scripts** — `pnpm audit:md / env / i18n / all` + `pnpm verify` umbrella in CI
- **Migration sweeps + Track A integration tests** (consolidated from ภูม Poom)

**2026-05-16 night session (autonomous run):**
- **Theme 3-bug fix** (`235dbc3`) — always-light-on-open · single-click toggle · dark-mode contrast
- **Combined migration SQL** — `docs/setup/migrations-0023-0038.sql` (one idempotent paste-and-run file for ภูม)
- **Cargo-ops forensics** — decoded the cargo/freight model from the ไอแต้ม chat + 10 real China-cargo documents → `docs/audit/cargo-ops-forensics-2026-05-16.md` + **PORT_PLAN Part V** (`V-A1…V-F3` backlog + `V-ADM1` admin polish)
- **ADR-0015** (withholding tax) + **ADR-0016** (freight value model) — DRAFTs awaiting ก๊อต lock
- STRATEGY.md synced · theme-desync learning captured · team-status checkpoint

### 🟡 Pending — your pickup list (priority order)

#### P0 — Landing pivot (cover ปอน — Part P4 strategic shift)

| # | Task | Effort | Source |
|---|---|---|---|
| **L-5-home** | Help ปอน polish home page priority sections (Pricing? Reviews? Sales?) — design lead Claude+เดฟ; ปอน executes copy/visual | ~3–4h | Part S5 (ปอน Phase B) |
| **L-22-activate** | After ก๊อต K-12 lands `NEXT_PUBLIC_GTM_ID` → verify GTM Preview Mode shows events | ~30m | Tracks DV-5 |
| **L-23-activate** | After ก๊อต K-13 lands `NEXT_PUBLIC_CLARITY_ID` → verify Clarity dashboard receives sessions | ~30m | Tracks DV-6 |
| **L-22-Ads** | GTM container — connect Meta Pixel + TikTok Pixel (ad attribution) | ~2h | Marketing setup |

#### P1 — Backend prep for ภูม

✅ Shipped: Phase G2 schema (`0034`) · MOMO scaffold (`lib/integrations/momo-jmf/`) · container schema (`0033`). Current prep = **Part V** (cargo-forensics backlog) — spec it so ภูม implements fast:

| # | Task | Effort | Source |
|---|---|---|---|
| **V-D schema spec** | Spec the container/volume-integrity cluster — V-D1 CBM-per-source · V-D2 canonical cargo-type enum · V-D3 carrier container-no link → `docs/port-specs/` | ~2h | PORT_PLAN Part V |
| **ADR-0015/0016 lock-chase** | Get ก๊อต to review + lock the 2 DRAFT ADRs (WHT + freight value) → unblocks V-A6 / V-E2 | ~30m | ADR-0015/0016 |
| **V-F1 migration burn-down** | Track each legacy cutover (China product API · server · SMS) that removes the ไอแต้ม single-point-of-failure | ongoing | PORT_PLAN Part V V-F1 |

#### P1 — Production hardening (when ก๊อต creds land)

| # | Task | Effort |
|---|---|---|
| **OTP_PEPPER** rotation execution — first quarterly rotation | ~30m |
| **`OTP_BYPASS=false`** flip in prod after ThaiBulkSMS keys land | ~10m |
| **`LINE_PUSH_BYPASS=false`** flip in prod after LIFF activation | ~10m |

#### P2 — Backlog (when above clear)

| # | Task | Effort | Source |
|---|---|---|---|
| **DV-7 L-24 demo experiment** | Wire actual UI variant for `home_hero_cta` (e.g. hero CTA copy A/B) | ~2h | ADR-0007 |
| **DV-8 home polish Phase 2** | After ปอน confirms priority page | ~3–4h | Part S5 |
| **Vercel cron count audit** | 5 crons; Hobby plan max=2 — verify Pro tier or consolidate | ~15m | P-vercel-plan |

---

## Blockers + alternatives

When you're blocked:

| Blocked on | Alternative work |
|---|---|
| ก๊อต hasn't provided GTM_ID/CLARITY_ID | Move to backend prep for ภูม (Phase G2 schema spec, MOMO scaffold) |
| ปอน hasn't picked priority page for L-5 | Take a P2 backlog item or write a marketing-data-extract script |
| Pacred owner hasn't provided bank/PromptPay | Document the gap in Part Q; move on |

**Note back to ก๊อต when:** Pacred owner sends creds, partner needs decision, security concern surfaces.

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
- All 4 teammates following same discipline now

## Cross-links

- [`docs/team.md`](../team.md) §3 — daily flow
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part S4 — your self-batch DV-1..DV-8
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — what you're prepping for ภูม
- [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — partner integration ก๊อต locks, you scaffold
- [`docs/decisions/0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md) — V2 scope rules you enforce
- [`docs/briefs/ops-roles.md`](ops-roles.md) — staff role contexts informing admin design
