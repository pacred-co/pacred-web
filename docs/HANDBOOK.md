# 📘 Pacred — Team Handbook

> Entry point for everyone on the team — start here.

Last updated: 2026-05-18 (post-launch revision)

---

## 🚀 POST-LAUNCH (production live since 2026-05-17)

**Pacred is in production.** The cargo revenue path works end-to-end and the emergency "เผาเงิน" sprint is behind us. Current focus = stabilise + deepen the launched product.

📋 Current roadmap: [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) — the post-launch execution sequence (§0 gate → U1 wire-the-flow → U2 revenue/margin → U3 ecosystem tools → U4 supervisory). U1/U2/U4 batches have shipped on `dave`; the `dave→main` deploy is gated on ภูม applying migrations `0058`-`0072` to prod Supabase.

Decision lens (post-launch): does this make the product more **true** · **billable** · **measurable**? — and never code an UPGRADE_PLAN item before its §0 gate is green.

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
- งานของฉันคืออะไร → YOUR brief at [`briefs/<your-name>.md`](briefs/) + [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) (post-launch roadmap)
- 🚀 post-launch progress / what's next? → [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) (U-items) + [`STRATEGY.md`](STRATEGY.md) §9 (shipped vs pending)
- Daily integration cycle (pull/push cadence, review checklist) → [`team.md`](team.md) §10
- ค่า env เอาจากไหน → ถามเดฟ (ดู [`env.md`](env.md) ก่อน — มี value sample ครบแล้วถ้าไม่ใช่ secret)
- 🚨 มี blocker / urgent? → latest `runbook/team-status-*.md` + [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) §0 (the deploy gate)
- เขียน code ยังไง → [`conventions.md`](conventions.md)
- Architecture → [`architecture.md`](architecture.md) + [`architecture/container-centric-model.md`](architecture/container-centric-model.md)
- ที่อยู่ / เบอร์ Pacred / LINE OA IDs → [`pacred-info.md`](pacred-info.md)
- "main มีอะไรใหม่?" → `git log --oneline origin/main..origin/dave` (เดฟ integrate daily 1-2×)

---

## 🗺️ Documentation map

### 🎯 Master strategy + skills (read once per session)

| File | คืออะไร |
|---|---|
| [`STRATEGY.md`](STRATEGY.md) | **Master strategic single-read** — every brief / ADR / plan condensed into one ~400-line read. Open every session for full context. |
| [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) | **Post-launch roadmap** — the current execution doc (§0 gate → U1 wire-the-flow → U2 revenue/margin → U3 tools → U4 supervisory). Start here for "what's next". |
| [`../.claude/skills/INDEX.md`](../.claude/skills/INDEX.md) | 10 starter skills — playbooks the agent follows when triggered (phase-verify · qa-flow-simulator · bug-swarm · KPI dashboard · test writer · refactor · perf hunter · scholar · copyist · legacy PHP sweep) |
| [`learnings/_index.md`](learnings/_index.md) | Compounding knowledge corpus — every dev / agent adds new gotchas via `scholar-immortal` skill. 1-min scan each session. |

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
| [`glossary.md`](glossary.md) | WHT / 50-ทวิ / Form-E / D/O / CBM / ใบกำกับภาษี / ใบขนสินค้า / GZE-GZS / CBX-EK + code formats + role workspaces + forbidden legacy patterns | ทุกคน — when a term ใหม่ |
| [`HANDBOOK.md`](HANDBOOK.md) | ไฟล์นี้ — entry/index |

### 📋 Work tracking (living docs — เดฟ updates)

| File | คืออะไร |
|---|---|
| [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) | **The current execution doc** — post-launch roadmap (U1-U4 + the §0 deploy gate) |
| [`PORT_PLAN.md`](PORT_PLAN.md) | Sprint history + cargo/gap-hunt backlogs — Parts O–W (Part V = cargo-forensics, Part W = gap-hunt). ~1825 lines — watch the 2000-line cap; archive oldest Parts before adding. |
| [`sprints/archive-a-to-n.md`](sprints/archive-a-to-n.md) | Historic survey + earlier sprint plans (Parts A–N — moved out for size, kept for reference) |
| [`architecture.md`](architecture.md) | System architecture — diagrams, DB schema, auth flow, security |
| [`architecture/container-centric-model.md`](architecture/container-centric-model.md) | **NEW** warehouse / container / shipment data spine — 4 tables, RLS, status enums, CT-1..CT-8 implementation |
| [`integrations/momo-jmf.md`](integrations/momo-jmf.md) | MOMO partner API spec — JWT auth, endpoint inventory TBD, ก๊อต MOMO-1..MOMO-3 |
| [`PACRED-SECOND-BRAIN.md`](PACRED-SECOND-BRAIN.md) | Context notes + gotchas |
| [`decisions/*.md`](decisions/) | ADRs 0001–0010 — LINE Notify replacement · admin architecture · china-search vendor · payment gateway · launch ops · tax invoice · analytics+A/B · DPX ERP phase 2 · ERP schema sketch · **V2/V3 version strategy** |
| [`audit/*.md`](audit/) | Deep audits — `php-pcscargo-integrations.md` (legacy PHP mapping) · `owasp-2026-05.md` (pre-launch OWASP Top-10) · **NEW** `chat-analysis-2026-05-16.md` (7 LINE groups, 10 leak holes, MOMO 9-status enum) · **NEW** `legacy-cleanup-2026-05-16.md` (~115 dead files + 6 NEW critical security findings) |
| [`runbook/*.md`](runbook/) | Operational runbooks — `vercel-cron-plan.md` · `pcs-scrub-plan.md` · `otp-pepper-rotation.md` · **NEW** `cargo-smoke-test-T-D1.md` (9-step T-D1 runbook) · **NEW** `cron-registry.md` (all 6 cron routes documented) · `team-status-2026-05-16.md` (live coordination) |

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

## 🎯 Current state (2026-05-18 — post-launch)

- **Active phase:** 🚀 **Post-launch UPGRADE** ([`UPGRADE_PLAN.md`](UPGRADE_PLAN.md)). Production launched 2026-05-17; the cargo revenue path works end-to-end. Brief-driven async execution — start each session with your brief → UPGRADE_PLAN → work U-items → push at save-points.
- **Branch state:** `main` = production (live, 19 launch-week migrations on prod) · `dave` = integration, **30+ commits ahead of `main`** (carries the shipped U1/U2/U4 batches) · `Poom` + `podeng` = น้อง working branches, synced to `dave`.
- **Production readiness:** launched — customer portal + 60+ admin routes + cargo loop all live. The bar is now "is the flow *true* / *billable* / *measurable*" — see [`STRATEGY.md`](STRATEGY.md) §9 for the full shipped-vs-pending snapshot.
- **Recent landmarks (latest first):**
  - **Post-launch U4** — admin supervisory layer (audit-log export · notification log · cron-health · staff RBAC console · global search) + customer credit line / pay-later (`0071`)
  - **Post-launch U2** — PCS→Pacred customer migration (`0067`) · per-container cost + AP/disbursement ledger (`0069`) · cargo_sacks (`0068`) · freight WHT gate
  - **Post-launch U1** — container unify (`0059`) · container→order status propagation · arrival→billing gate · freight-chain wiring · refund money path (`0058`)
  - **Launch (2026-05-17)** — W-1 security keystone (`0062`) · W-3 wallet-integrity (`0063`) · `0064` overdraw-guard · S-3/S-4/S-7 · production smoke gate passed → `dave→main` deployed
  - **~700 new test assertions** across 11 test files covering the new validators
- **Next `dave→main` deploy** — gated on ภูม recreating dev Supabase + applying migrations `0058`-`0072` to prod. See [`runbook/poom-handoff-2026-05-18.md`](runbook/poom-handoff-2026-05-18.md).
- **V2 vs V3 strategy (ADR-0010 locked):** This repo (`pacred-web`) = **V2 owner-pleaser**. Future ERP rebuild = **V3 `pacred-DPX`** (separate repo). V3 wishlist appends to `docs/v3-wishlist.md` — don't refactor V2 into V3 mid-flight.
- **Each role's next pickup:** see your brief at [`briefs/<your-name>.md`](briefs/) + the [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) U-item table for your role.

---

## ⚠️ Things that bite

1. **Post-launch — `dave→main` is gated.** Any new `supabase/migrations/*` must be applied to **prod** Supabase before the deploy, else the new routes 500. See [`UPGRADE_PLAN.md`](UPGRADE_PLAN.md) §0.
2. **Skipping your brief = wandering session.** Open [`briefs/<your-name>.md`](briefs/) FIRST. CLAUDE.md top section enforces this.
3. **Next.js 16** has breaking changes from training data — read [`/AGENTS.md`](/AGENTS.md) before writing any code
4. **`OTP_BYPASS=true`** in dev makes registration skip phone verification — `false` in prod (flipped at launch after ThaiBulkSMS signup). See [`env.md`](env.md) §3.
5. **`LINE_PUSH_BYPASS=true`** is the dev default — notifications only log to console; LINE creds + LIFF are set, bypass stays true in dev. See [`env.md`](env.md) §7.
6. **China-search vendor cutoff** — `lib/china-search` wired but the legacy vendor is being cut. Code degrades to demo mode when env unset — intended interim until ก๊อต ADR-0003 R1 lands a replacement (deferred T+30d).
7. **MOMO JMF API surface is wrong on record** — the decoded `?api=` endpoints are stale; the real surface is `api.momocargo.com:8080` REST (datanew L-0). U1-7 MOMO sync is blocked until ก๊อต corrects the API docs. Don't write integration code against the old endpoints.
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
- Legacy PHP source (read-only ref): **`D:\xampp\htdocs\pcscargo\`** (เดฟ's machine — canonical path per 2026-05-15 brief — full audit at [`docs/audit/php-pcscargo-integrations.md`](audit/php-pcscargo-integrations.md) — sweep skill at [`.claude/skills/legacy-php-sweep/`](../.claude/skills/legacy-php-sweep/SKILL.md))

---

## 🌳 Appendix — Obsidian brain bridge (future routing)

> **Why this section.** เดฟ asked: "ไปจบที่ทำสมองใน obsidian หรือมีแนะนำก็บอก". Captured here at the end of HANDBOOK because it's deliberately scoped as future work (don't build now; the foundations needed for it land first).

### What problem this solves

The repo accumulates:
- ADRs (`docs/decisions/`)
- Learnings (`docs/learnings/`)
- Briefs (`docs/briefs/`)
- Strategy + audits + runbooks (`docs/`)
- Skills (`.claude/skills/`)
- Memories (in `~/.claude/projects/.../memory/`)

These work *inside* a Claude Code session. But the user wants a brain that:
- Persists across machines + repos (not just `pacred-web`)
- Lets เดฟ + ก๊อต *browse* the knowledge graph as humans (not via grep)
- Captures non-code observations (sales call notes, partner-meeting takeaways, owner conversations)
- Has bi-directional links + tag search + visual graph
- Eventually feeds back into the agent (RAG via files-on-disk)

Obsidian fits naturally because it's flat markdown + bi-directional links + works without internet + has plugin ecosystem.

### Recommended approach (when we get there)

**Tier 1 — Mirror, don't fork (recommended start):**
- Create a Pacred-org Obsidian vault on shared drive (Google Drive / iCloud / a Pacred-owned NAS)
- Vault structure mirrors `docs/` plus non-code zones:
  ```
  pacred-vault/
  ├── 00-meta/              (vault README, tag conventions, MOC index)
  ├── 10-strategy/          (mirror of pacred-web docs/STRATEGY.md + roadmap notes)
  ├── 20-decisions/         (mirror of docs/decisions/ ADRs + meeting notes feeding them)
  ├── 30-people/            (1 note per team member + per Pacred staff role + per customer-contact)
  ├── 40-partners/          (MOMO, TAM, LINE, ThaiBulkSMS, Vercel, Supabase notes)
  ├── 50-learnings/         (mirror of docs/learnings/ + non-code learnings: sales / process / customer feedback)
  ├── 60-experiments/       (Ad campaigns, A/B results, customer interview transcripts)
  ├── 70-finance/           (when bank acct is sorted)
  ├── 80-projects/          (one note per project — pacred-web V2 · pacred-DPX V3 · etc)
  └── 90-inbox/             (capture inbox — daily notes / ideas / quick captures)
  ```
- **Sync rule:** `docs/` and `docs/learnings/` are *source of truth* for code-related notes. Obsidian mirrors them via a sync script (cron / pre-commit hook). Non-code notes live ONLY in Obsidian.

**Tier 2 — Plugins to install:**
- **Dataview** — query notes like a DB (e.g., "show every ADR locked in last 30 days")
- **Templater** — note templates (matching the `scholar-immortal` skill protocol)
- **Linter** — auto-format frontmatter
- **Calendar / Daily notes** — for daily standups
- **Tasks** — pull T-G / T-P / T-N / T-D Part T tasks into a dashboard
- **Excalidraw** — for system diagrams when text doesn't suffice
- **Smart Connections** (optional) — semantic search via embeddings; useful when corpus is large

**Tier 3 — Feed agents from the vault:**
- Vault on local disk → Claude Code reads via filesystem (no special integration needed)
- Add path to `.claude/skills/scholar-immortal/SKILL.md` once vault exists: "also write to `$PACRED_VAULT_PATH/50-learnings/...`"
- ก๊อต ADRs / strategy updates flow vault→repo via the same sync script

### When to start

Not now. Pre-requisites:
- Pacred revenue path live (cargo system ships, customers transacting)
- 3-4 weeks of `docs/learnings/` entries accumulated → enough corpus to make a vault worth opening
- ก๊อต has bandwidth for a 1-week setup sprint

Track on `docs/v3-wishlist.md` (TBD file — ก๊อต creates per ADR-0010).

### Alternative routes considered

| Tool | Why considered | Why not (yet) |
|---|---|---|
| **Notion** | Pretty UI, blocks editor, real-time collab | Vendor lock-in; markdown export is lossy; ลูก-knowledge stays inside their data centers (privacy concern post-IPO) |
| **Roam Research** | Bi-directional links pioneered | Subscription cost · less plugin ecosystem · markdown-export less clean than Obsidian |
| **Logseq** | Open source · markdown · graph view | Less mature plugin ecosystem · steeper learning curve for non-devs (ปอน / ภูม) |
| **Plain markdown in repo only** | What we have now | Doesn't bridge to non-code notes · no browse UI · ปอน/ภูม don't open Claude Code daily |
| **Confluence / Linear / Jira** | Enterprise-grade | Heavy · costs scale per seat · markdown round-trip lossy · ลูก-locked |

**Recommendation:** Obsidian (Tier 1 setup) when pre-reqs met. Free for personal use. Sync via plain markdown. Easy migration if we change tools later.

---

**Welcome to Pacred 🚢** — ติดอะไรถามเดฟได้ตลอดครับ
