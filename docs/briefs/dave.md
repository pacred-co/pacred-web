# เดฟ — Project Lead / Integrator

Last reviewed: 2026-05-15 (emergency revision — cargo revenue sprint)
Branch: `dave` (working) → merges into `main` via ก๊อต gate · Authority: second-tier owner

---

## 🔥 EMERGENCY (read FIRST — overrides normal priority)

บริษัทเผาเงิน. พี่ป๊อปเครียดมาก. คุณคือ integrator — ทำให้ภูม + ปอน + ก๊อต ส่งของได้ + path ไป revenue คุย flow ได้.

**เดฟ P0 (do these in this order — Part T2):**
1. **T-D1 Cargo flow end-to-end smoke test** — signup → topup → service-order → admin paid → receipt issues. Find every gap. Fill or assign to ภูม (~4h test + 2h fix)
2. **T-D2 Backend specs for ภูม** — G2 tax invoice schema `0034_tax_invoices.sql` + container `0033_containers.sql` (draft → ภูม reviews → applies)
3. **T-D3 L-22 GTM verify** (after ก๊อต K-12) — events flow into GTM Preview Mode → GA4 → reports ก๊อต sees
4. **T-D4 Internal soft-launch coordination** — pick 5 friendly customers (พี่ป๊อป's network) for first real transactions

**Defer:** DV-7/DV-8 backlog polish until revenue path live. Landing pivot Phase 2 only when ก๊อต K-12 lands (otherwise no data).

Read [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part T for the full per-role emergency table + T1 critical path + T5 revenue-ready DoD checklist.

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

### 🟡 Pending — your pickup list (priority order)

#### P0 — Landing pivot (cover ปอน — Part P4 strategic shift)

| # | Task | Effort | Source |
|---|---|---|---|
| **L-5-home** | Help ปอน polish home page priority sections (Pricing? Reviews? Sales?) — design lead Claude+เดฟ; ปอน executes copy/visual | ~3–4h | Part S5 (ปอน Phase B) |
| **L-22-activate** | After ก๊อต K-12 lands `NEXT_PUBLIC_GTM_ID` → verify GTM Preview Mode shows events | ~30m | Tracks DV-5 |
| **L-23-activate** | After ก๊อต K-13 lands `NEXT_PUBLIC_CLARITY_ID` → verify Clarity dashboard receives sessions | ~30m | Tracks DV-6 |
| **L-22-Ads** | GTM container — connect Meta Pixel + TikTok Pixel (ad attribution) | ~2h | Marketing setup |

#### P1 — Backend prep for ภูม

| # | Task | Effort | Source |
|---|---|---|---|
| **Phase G2 schema spec** | Draft migration files matching ADR-0006 tax invoice + ADR-0009 schema sketches | ~2h | ADR-0006 G2a |
| **MOMO sync scaffold** | Create `lib/integrations/momo-jmf/*.ts` skeleton ready for ก๊อต's endpoint inventory | ~1h | momo-jmf.md Step 3 |
| **Container schema migration** | Write `00NN_containers.sql` per [container-centric-model](../architecture/container-centric-model.md) — ภูม reviews + applies | ~2h | container model |

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
