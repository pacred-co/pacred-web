# 📘 Pacred — Team Handbook

> Entry point for everyone on the team — start here.

Last updated: 2026-05-15 (emergency revision — cargo revenue sprint)

---

## 🔥 EMERGENCY MODE ACTIVE (2026-05-15)

**Company is burning runway.** Cargo system must go live + receive customers ASAP. Every priority decision passes the lens: *"งานนี้ส่งผลให้รับลูกค้า cargo ได้เร็วขึ้นไหม?"*

📋 Master plan: [`PORT_PLAN.md`](PORT_PLAN.md) **Part T** — per-role T1..T5 emergency pickups + critical path to first revenue + "borrow first, switch later" API plan + revenue-ready DoD checklist.

Each role brief has an **EMERGENCY** section at the top that overrides normal priority during this sprint.

---

## 🧬 Pacred DNA (one-liner)

**บริษัท แพคเรด (ประเทศไทย) จำกัด** · Pacred (Thailand) Co., Ltd. · ทะเบียน `0105564077716` · Slogan **"เร็ว ไว ไม่มีคำว่าทำไม่ได้"** · Owner พี่ป๊อป Visit. Scope = ecosystem นำเข้า/ส่งออก/customs/cargo/logistics ครบวงจร.

Full SOT: [`pacred-info.md`](pacred-info.md) (addresses, phones, 7 dept emails, LINE OA, social, sales reps, code consumers).

Brand-split context: separating from **PCS CARGO + TTP + ไอแต้ม** — clean-up rule = wait for ก๊อต API switchover **before** scrubbing references.

---

## 🛑 Force-read your brief FIRST

Before anything else, every Claude Code agent + every human dev opens THEIR role brief:

| You are… | Open this brief |
|---|---|
| **ก๊อต** (Senior Advisor / Production Watcher) | [`briefs/got.md`](briefs/got.md) |
| **เดฟ** (Project Lead / Integrator) | [`briefs/dave.md`](briefs/dave.md) |
| **ภูม** (Backend / Customer Portal / Admin) | [`briefs/poom.md`](briefs/poom.md) |
| **ปอน** (Frontend / Landing / SEO / Marketing) | [`briefs/podeng.md`](briefs/podeng.md) |
| Anyone designing STAFF admin / RBAC | [`briefs/ops-roles.md`](briefs/ops-roles.md) |

📂 Routing map: [`briefs/INDEX.md`](briefs/INDEX.md) · enforced from [`/CLAUDE.md`](/CLAUDE.md) top section.

---

## Quick start

```bash
git clone git@github.com:pacred-co/pacred-web.git
cd pacred-web
cp .env.example .env.local         # fill values (ask เดฟ)
pnpm install --frozen-lockfile     # uses pinned Node 24 + pnpm 11
pnpm dev                           # http://localhost:3000
```

### Verify scripts (also run automatically in CI)

```bash
pnpm verify         # umbrella: lint + tsc + test:unit + audit:all — run before every push
pnpm lint           # eslint
pnpm exec tsc --noEmit   # typecheck (note: .next/dev/types/* errors are hot-reload artifacts, ignore)
pnpm test:unit      # 240+ assertions, env-independent
pnpm test           # adds placement integration test (needs .env.local + Supabase)
pnpm audit:all      # MD link audit + env var audit + i18n parity (umbrella)
pnpm audit:md       # markdown local-link target audit
pnpm audit:env      # process.env.X references vs .env.example
pnpm audit:i18n     # th vs en key parity + intentional-same classification
```

**Need help:**
- งานของฉันคืออะไร → YOUR brief at [`briefs/<your-name>.md`](briefs/) (emergency section ทับ priority ปกติ)
- 🔥 cargo revenue sprint progress? → [`PORT_PLAN.md`](PORT_PLAN.md) Part T (per-role T-* tasks + DoD checklist)
- Daily integration cycle (pull/push cadence, review checklist) → [`team.md`](team.md) §10
- ค่า env เอาจากไหน → ถามเดฟ (ดู [`env.md`](env.md) ก่อน — มี value sample ครบแล้วถ้าไม่ใช่ secret)
- 🚨 มี blocker / urgent? → [`PORT_PLAN.md`](PORT_PLAN.md) Part Q (production blockers) + Part S (เดฟ↔ก๊อต hand-off)
- เขียน code ยังไง → [`conventions.md`](conventions.md)
- Architecture → [`architecture.md`](architecture.md) + [`architecture/container-centric-model.md`](architecture/container-centric-model.md)
- ที่อยู่ / เบอร์ Pacred / LINE OA IDs → [`pacred-info.md`](pacred-info.md)
- "main มีอะไรใหม่?" → `git log --oneline origin/main..origin/dave` (เดฟ integrate daily 1-2×)

---

## 🗺️ Documentation map

### 🧑‍💻 Role briefs (force-read — open YOUR file first)

| File | คืออะไร | ใครอ่าน |
|---|---|---|
| [`briefs/INDEX.md`](briefs/INDEX.md) | Routing map — which brief is yours + onboarding flow | ทุกคน — ครั้งแรก |
| [`briefs/got.md`](briefs/got.md) | ก๊อต — Senior Advisor / Production Watcher (P0/P1, ADRs, partner picks) | ก๊อต |
| [`briefs/dave.md`](briefs/dave.md) | เดฟ — Project Lead / Integrator (landing pivot, backend prep) | เดฟ |
| [`briefs/poom.md`](briefs/poom.md) | ภูม — Backend / Customer Portal / Admin (container model, tax invoice) | ภูม |
| [`briefs/podeng.md`](briefs/podeng.md) | ปอน — Frontend / Landing / SEO / Marketing (owner critiques, L-5, SEO) | ปอน |
| [`briefs/ops-roles.md`](briefs/ops-roles.md) | 14 STAFF role workspaces — admin UI / RBAC design input | ภูม + ก๊อต (system design) |

### ⭐ Canonical (read after your brief)

| File | คืออะไร | ใครต้องอ่าน |
|---|---|---|
| [`team.md`](team.md) | **Roles + permissions + branch flow (น้อง pull from `dave`!) + §3.0 push-frequency cost rule (save-points only) + §6 self-directed mode + §9 Claude Code async collab** | ทุกคน — ครั้งแรก |
| [`conventions.md`](conventions.md) | Code style + commit format + i18n + DB rules | ทุกคน |
| [`env.md`](env.md) | Every env var explained + production checklist (17 sections covering Supabase / OTP / SMS / China search / PromptPay / LINE+LIFF / Sentry / Upstash / hCaptcha / **MOMO JMF**) | เดฟ + ภูม + ก๊อต |
| [`pacred-info.md`](pacred-info.md) | Company info SOT — addresses, phones, emails, LINE OA, sales reps | ทุกคน — when touching contact UI |
| [`HANDBOOK.md`](HANDBOOK.md) | ไฟล์นี้ — entry/index |

### 📋 Work tracking (living docs — เดฟ updates)

| File | คืออะไร |
|---|---|
| [`PORT_PLAN.md`](PORT_PLAN.md) | Current sprints + hand-off batches — Parts O (per-role assignments) · P (snapshot) · Q (production blockers) · R (vendor cutoff) · S (เดฟ↔ก๊อต async hand-off). ~1435 lines, under 2000-line agent ceiling. |
| [`sprints/archive-a-to-n.md`](sprints/archive-a-to-n.md) | Historic survey + earlier sprint plans (Parts A–N — moved out for size, kept for reference) |
| [`architecture.md`](architecture.md) | System architecture — diagrams, DB schema, auth flow, security |
| [`architecture/container-centric-model.md`](architecture/container-centric-model.md) | **NEW** warehouse / container / shipment data spine — 4 tables, RLS, status enums, CT-1..CT-8 implementation |
| [`integrations/momo-jmf.md`](integrations/momo-jmf.md) | MOMO partner API spec — JWT auth, endpoint inventory TBD, ก๊อต MOMO-1..MOMO-3 |
| [`PACRED-SECOND-BRAIN.md`](PACRED-SECOND-BRAIN.md) | Context notes + gotchas |
| [`decisions/*.md`](decisions/) | ADRs 0001–0010 — LINE Notify replacement · admin architecture · china-search vendor · payment gateway · launch ops · tax invoice · analytics+A/B · DPX ERP phase 2 · ERP schema sketch · **V2/V3 version strategy** |
| [`audit/*.md`](audit/) | Deep audits — `php-pcscargo-integrations.md` (legacy PHP mapping) · `owasp-2026-05.md` (pre-launch OWASP Top-10) |
| [`runbook/*.md`](runbook/) | Operational runbooks — `vercel-cron-plan.md` · `pcs-scrub-plan.md` · `otp-pepper-rotation.md` |

### 🛠️ Setup guides

| File | คืออะไร |
|---|---|
| [`setup/`](setup/) | OAuth (Facebook + Google), Supabase, Vercel, LINE, ThaiBulkSMS, local-dev — onboarding |
| [`/supabase/migrations/README.md`](/supabase/migrations/README.md) | DB migration runbook |
| [`/legacy-schema/README.md`](legacy-schema/README.md) | Legacy MySQL schema reference for PHP→Pacred port |

### 🤖 AI agent specific

| File | คืออะไร |
|---|---|
| [`/CLAUDE.md`](/CLAUDE.md) | Project snapshot for Claude Code agents |
| [`/AGENTS.md`](/AGENTS.md) | Next.js 16 breaking changes (vs training data) |

### ⚙️ Config (lead-only edits)

| File | Purpose |
|---|---|
| [`/.env.example`](/.env.example) | Env template — copy to `.env.local` |
| [`/.nvmrc`](/.nvmrc) | Node version pin (`24`) |
| [`/package.json`](/package.json) | Deps + pnpm pin + engines |
| [`/.github/CODEOWNERS`](/.github/CODEOWNERS) | Auto-review assignment |
| [`/next.config.ts`](/next.config.ts) | Next.js config |
| [`/eslint.config.mjs`](/eslint.config.mjs) | Lint rules |
| [`/proxy.ts`](/proxy.ts) | Middleware (renamed from middleware.ts in Next 16) |
| [`/vercel.json`](/vercel.json) | Cron config |

---

## 👥 Team at a glance

| คน | บทบาท | สโคป | Branch | Push to main |
|---|---|---|---|---|
| **ก๊อต** | Senior Advisor / Production Watcher | decisions · ADRs · tool/partner picks · security audit | (operates from `main`, review-only) | ✅ |
| **เดฟ** | Project Lead / Integrator | runs sprint · infra · prep work for ภูม · cover landing | `dave` (staging) | ✅ |
| **ภูม** | Backend / Customer Portal / Admin | auth · portal · admin · cargo port · container model | `Poom` (own) | ❌ (via เดฟ→ก๊อต) |
| **ปอน** | Frontend / Landing / SEO / Marketing | landing · SEO #1 target · marketing research · WFH 3 days | `podeng` (own) | ❌ (via เดฟ→ก๊อต) |

→ Full role detail in [`team.md`](team.md) + per-role pickup list in [`briefs/`](briefs/)

---

## 🚦 Daily workflow (TL;DR — UPDATED 2026-05-15 + cost discipline)

> **Branch flow:** ปอน/ภูม → push to own branch → เดฟ merges into `dave` (staging) → **ก๊อต** approves + merges into `main` (production). น้อง pull from **`dave`** not `main`. เดฟ bypass dave→main only for urgent hotfix.

```bash
# Morning — sync DAVE (not main!)
git fetch origin
git checkout dave && git pull --ff-only origin dave

# Switch to your branch + merge dave
git checkout <my-branch>          # podeng / Poom (or dave for เดฟ)
git merge dave
git push origin <my-branch>       # if needed; usually skip until save-point

# ทำงาน + commit local-only ฟรี (per §3.0 cost rule — Vercel builds = $$)
git commit -m "<type>(<scope>): <message>"        # commit หลายตัวระหว่างวัน OK
git commit -m "wip: ..."

# เสร็จ feature / save point → squash + push 1 ครั้ง (target ~1-3 push/day)
git rebase -i origin/<my-branch>                  # squash WIP commits
git push origin <my-branch>

# แจ้งเดฟ/ก๊อต review (LINE / Slack / PR)
```

→ Full detail in [`team.md`](team.md) §3 + §3.0 push-frequency cost rule

---

## 📐 Code conventions (TL;DR)

| | |
|---|---|
| Server actions | `actions/<feature>.ts` with `"use server"` — Zod validate, return `{ ok, error?, data? }` |
| Admin actions | `actions/admin/<feature>.ts` — wrap in `withAdmin([roles])` + `logAdminAction()` + `sendNotification()` |
| Auth check | `await requireAuth()` or `await requireAdmin([roles])` |
| DB query | `createClient()` (RLS) or `createAdminClient()` (RLS-bypass, server-only) |
| i18n | `useTranslations("namespace")` — add to both `messages/th.json` + `en.json` |
| Style | Tailwind utility — theme colors from `@theme inline` in `app/globals.css` |
| Icons | `lucide-react` outline only |
| Forms | Native input + Zod validate at server action; `useTransition` for loading state |
| Commits | `<type>(<scope>): <message>` (see [`conventions.md`](conventions.md) §5) |
| Comments | Default to NONE — only when WHY is non-obvious |

→ Full detail in [`conventions.md`](conventions.md)

---

## 🎯 Current state (2026-05-15 — emergency)

- **Active phase:** 🔥 **Cargo Revenue Sprint** (Part T). Brief-driven async execution but priorities are revenue-first. ทุกคนเริ่ม session ด้วยเปิด brief → emergency section → ทำงาน T-* tasks → push at save-points.
- **Branch state:** `main` = ก๊อต-approved (production) · `dave` = เดฟ-merged (staging — Poom + podeng consolidated) · `Poom` + `podeng` = น้อง working branches.
- **Production readiness:** ~88% customer · ~98% admin HR / ~50% admin ops · ~85% infra · ~85% SEO/landing (analytics substrate live)
- **Recent landmarks (latest first):**
  - **2026-05-15 evening (ปอน landed):** Customs page v2 banner+breadcrumb+new copy · shared section tweaks (ContactSales reusable + mobile swipe + shorter SalesCarousel) · mobile FloatingTabs center call FAB
  - **2026-05-15 (DNA + emergency):** Company DNA embed across CLAUDE.md/AGENTS.md/site.ts (tax-ID `0105564077716` + slogan + 7 dept emails + sales/docs footer pair) · PORT_PLAN Part T cargo revenue sprint · brand-cleanup gate doc · daily integration cycle §10 in team.md
  - 6 role briefs (`docs/briefs/`) + container-centric model (`docs/architecture/`) + MOMO JMF spec (`docs/integrations/`) + V2/V3 strategy ADR-0010 + PORT_PLAN split (Parts A–N archived)
  - L-22 GTM + L-23 Clarity + L-24 cookie A/B substrate shipped (silent until ก๊อต K-12/K-13 lands env vars)
  - 9 conversion events + 13 CTA surfaces + first live experiment `home_hero_cta` telemetry
  - OWASP Top-10 desk audit + PCS scrub sweep + OTP dual-pepper rotation support
  - Sentry SDK (D-11) + Upstash rate-limit (D-12) + hCaptcha (D-13) wired — awaiting creds from ก๊อต
  - Cron jobs (5) + CRON_SECRET hardening + footer i18n + LINE_OA constants centralized
  - Migrations 0028–0032 + Track A integration tests (P-28..P-31) consolidated
  - MOMO JMF partner token captured in 5 worktrees + `.env.example`; endpoint inventory TBD (ก๊อต MOMO-1..MOMO-3)
- **V2 vs V3 strategy (ADR-0010 locked):** This repo (`pacred-web`) = **V2 owner-pleaser**. Future ERP rebuild = **V3 `pacred-DPX`** (separate repo, employee masterpiece). V3 wishlist appends to `docs/v3-wishlist.md` (TBD) — don't refactor V2 into V3 mid-flight.
- **🔥 Revenue path blockers (block customer-receiving cargo system — Part T):**
  - **ก๊อต:** T-G1 API borrow audit · T-G3 owner-call bundle (bank/PromptPay/tax-ID) · T-G4 GTM + Clarity · T-G5 Sentry/Upstash/hCaptcha · T-G2 MOMO endpoints
  - **ภูม:** T-P1 admin workflow buttons · T-P2 container model + customer view · T-P3 wallet bulk-approve · T-P4 tax invoice flow · T-P5 stub accounting page
  - **ปอน:** T-N1 SEO audit (why pacred.co not indexed?) · T-N2 ad-landing quality · T-N3 funnel CTA wiring · T-N4 Phase I landing shells · T-N5 mobile QA
  - **เดฟ:** T-D1 cargo flow smoke test · T-D2 backend specs for ภูม · T-D3 GTM verify post-K-12 · T-D4 soft-launch 5 friendly customers
- **Each role's next pickup:** see your brief at [`briefs/<your-name>.md`](briefs/) — emergency section at top overrides normal priority. Don't re-derive from PORT_PLAN.

---

## ⚠️ Things that bite

1. **EMERGENCY mode active** — revenue-first lens. ถ้างานไม่ unblock cargo revenue path → defer. See [`PORT_PLAN.md`](PORT_PLAN.md) Part T.
2. **Skipping your brief = wandering session.** Open [`briefs/<your-name>.md`](briefs/) FIRST. CLAUDE.md top section enforces this.
3. **Next.js 16** has breaking changes from training data — read [`/AGENTS.md`](/AGENTS.md) before writing any code
4. **`OTP_BYPASS=true`** in dev makes registration skip phone verification — must be `false` in prod (see [`env.md`](env.md) §3)
5. **`LINE_PUSH_BYPASS=true`** is default — notifications only log to console; LINE creds set 2026-05-14 but bypass stays true in dev (see [`env.md`](env.md) §7)
6. **China-search vendor cutoff (Track G)** — `lib/china-search` wired but vendor (ไอแต้ม) being cut. DON'T set `PACRED_TAMIT_*` in Vercel prod until ก๊อต ADR-0003 R1 lands replacement. Code degrades to demo mode when env unset — intended interim.
7. **MOMO JMF token in `.env.local`** — captured 2026-05-16, but `MOMO_JMF_BASE_URL` + endpoint inventory still TBD (ก๊อต MOMO-1). Don't write integration code referencing endpoints until inventory locks.
8. **Middleware file** is `proxy.ts` not `middleware.ts` (Next 16 rename)
9. **i18n key missing** crashes the page — always add both th + en. Audit script: `pnpm audit:i18n`
10. **Don't use `profiles.role`** — use `is_admin()` SECURITY DEFINER function or query `admins` table (per [`decisions/0002-admin-architecture.md`](decisions/0002-admin-architecture.md))
11. **Push to `main` directly = bypass mode** — only เดฟ for urgent hotfix. Normal flow: น้อง→own branch→เดฟ→`dave`→ก๊อต→`main`
12. **Push frequency = save-points only** — Vercel builds cost + push churn distracts the team. Commit local often, push at sleep / machine change / location change / big batch done. ~1 push per session. See [`team.md`](team.md) §3.0.
13. **`profiles.line_user_id`** stays NULL until D-1-LIFF customer linkage runs — every LINE push to customer is silent no-op until LIFF activated
14. **V2 ≠ V3** — this repo is V2 owner-pleaser. Don't refactor V2 into your ideal architecture; that's V3 (`pacred-DPX`) territory. See [ADR-0010](decisions/0010-v2-v3-version-strategy.md).
15. **Admin sidebar bg = white** (per เดฟ 2026-05-16 brief) — rest of admin chrome uses landing theme tokens. Don't introduce a dark admin variant.
16. **Don't preempt brand cleanup** — references to PCS Cargo / TTP / ไอแต้ม survive because some APIs still borrowed interim. Scrub *after* ก๊อต confirms the matching API switchover. See [`runbook/pcs-scrub-plan.md`](runbook/pcs-scrub-plan.md).

---

## 🔗 Quick links

- Repo: https://github.com/pacred-co/pacred-web
- Production: https://pacred.co (TBD — `NEXT_PUBLIC_SITE_URL` ใน Vercel env)
- Supabase Dashboard: https://supabase.com/dashboard (link with เดฟ)
- **LINE OA Pacred:**
  - Channel ID: `2009931373` (Messaging API — for push notifications)
  - Premium ID: `@pacred` · Basic ID: `@683wolja`
  - Short URL: https://lin.ee/Yg3fU0I
  - Add-friend: https://line.me/R/ti/p/%40pacred
  - Code: import `LINE_OA` from `components/seo/site.ts`
- **Pacred company info:** [`docs/pacred-info.md`](pacred-info.md) (addresses + phones + emails + sales reps)
- Legacy PHP source (read-only ref): `C:\xampp\htdocs\pcscargo\` (เดฟ's machine — full audit at [`docs/audit/php-pcscargo-integrations.md`](audit/php-pcscargo-integrations.md))

---

**Welcome to Pacred 🚢** — ติดอะไรถามเดฟได้ตลอดครับ
