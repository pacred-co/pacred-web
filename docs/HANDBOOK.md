# 📘 Pacred — Team Handbook

> Entry point for everyone on the team — start here.

Last updated: 2026-05-15

---

## Quick start

```bash
git clone git@github.com:pacred-co/pacred-web.git
cd pacred-web
cp .env.example .env.local         # fill values (ask เดฟ)
pnpm install --frozen-lockfile     # uses pinned Node 24 + pnpm 11
pnpm dev                           # http://localhost:3000
```

**Need help:**
- ค่า env เอาจากไหน → ถามเดฟ (ดู [`env.md`](env.md) ก่อน — มี value sample ครบแล้วถ้าไม่ใช่ secret)
- งานของฉันคืออะไร → [`team.md`](team.md) + [`PORT_PLAN.md`](PORT_PLAN.md) Part O (assignments) + Part P (snapshot)
- 🚨 มี blocker / urgent? → [`PORT_PLAN.md`](PORT_PLAN.md) Part Q (production blockers) + Part R (vendor cutoff)
- เขียน code ยังไง → [`conventions.md`](conventions.md)
- Architecture → [`architecture.md`](architecture.md)
- ที่อยู่ / เบอร์ Pacred / LINE OA IDs → [`pacred-info.md`](pacred-info.md)

---

## 🗺️ Documentation map

### ⭐ Canonical (read first, in this order)

| File | คืออะไร | ใครต้องอ่าน |
|---|---|---|
| [`team.md`](team.md) | **Roles + permissions + branch flow (น้อง pull from `dave`!) + §3.0 push-frequency cost rule + §6 self-directed mode + §9 Claude Code async collab** | ทุกคน — ครั้งแรก |
| [`conventions.md`](conventions.md) | Code style + commit format + i18n + DB rules | ทุกคน |
| [`env.md`](env.md) | Every env var explained + production checklist (16 sections covering Supabase / OTP / SMS / China search / PromptPay / LINE+LIFF / Sentry / Upstash / hCaptcha / etc.) | เดฟ + ภูม |
| [`pacred-info.md`](pacred-info.md) | Company info SOT — addresses, phones, emails, LINE OA, sales reps | ทุกคน — when touching contact UI |
| [`HANDBOOK.md`](HANDBOOK.md) | ไฟล์นี้ — entry/index |

### 📋 Work tracking (living docs — เดฟ updates)

| File | คืออะไร |
|---|---|
| [`PORT_PLAN.md`](PORT_PLAN.md) | Master plan — Parts A-N (PHP audit + early sprints) · O (per-role assignments) · P (latest snapshot) · 🚨 Q (production blockers) · 🚨 R (vendor cutoff decisions) |
| [`architecture.md`](architecture.md) | System architecture — diagrams, DB schema, auth flow, security |
| [`PACRED-SECOND-BRAIN.md`](PACRED-SECOND-BRAIN.md) | Context notes + gotchas |
| [`decisions/*.md`](decisions/) | Architecture Decision Records (ADRs) — `0001-line-notify-replacement` · `0002-admin-architecture` |
| [`audit/*.md`](audit/) | Deep audits — `php-pcscargo-integrations.md` (legacy PHP source mapping) |
| [`runbook/*.md`](runbook/) | Operational runbooks — `vercel-cron-plan.md` (cron count + tier check) |

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

| คน | บทบาท | สโคป | Push to main |
|---|---|---|---|
| **ก๊อต** | Senior Advisor | code review · architecture | ✅ |
| **เดฟ** | Project Lead | runs sprint · infra · integrations | ✅ |
| **ปอน** | Frontend & SEO | landing pages · marketing · SEO | ❌ (own branch only) |
| **ภูม** | Backend & Cargo Port | auth · portal · admin · PHP → Pacred | ❌ (own branch only) |

→ Full role detail in [`team.md`](team.md)

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

## 🎯 Current state (2026-05-15)

- **Active phase:** Sprint 6.5 + Sprint 7+ (per [`PORT_PLAN.md`](PORT_PLAN.md) Part O — per-role assignments + Part P snapshot). ภูม shipped P-15..P-26 + Track G china-search; ปอน Phase A SEO + 7 bonus + customs-clearance rebuild; เดฟ D-11/12/13 scaffolds + D-12-wire/D-13-wire + D-1-LIFF scaffold + LINE creds + LINE_OA constants
- **Branch state:** `main` = ก๊อต-approved (production) · `dave` = เดฟ-merged (staging) · `Poom` + `podeng` = น้อง working branches. ก๊อต now operates from `main`, runs dave→main approval gate
- **Production readiness:** ~88% customer · ~98% admin · ~85% infra · ~75% SEO/landing (per [`PORT_PLAN.md`](PORT_PLAN.md) §P3)
- **🚨 Critical blockers:** Pacred owner provides 7 sets of creds (PromptPay + ThaiBulkSMS + Sentry DSN + Upstash + hCaptcha + LIFF ID + bank acct) + 7 decisions (D-7 payment gateway / D-1 LINE linkage / D-8 HS / etc.) — see [`PORT_PLAN.md`](PORT_PLAN.md) Part Q (3 bundles) + Part R (vendor cutoff Option A-E)
- **Track G blocker:** ภูม shipped P-50..P-53 china-search rewire ✅ but ก๊อต flagged vendor cutoff (TAM/AkuCargo/Laonet = ไอแต้ม) — DON'T set Track G env vars in Vercel until ก๊อต/เดฟ pick replacement strategy

---

## ⚠️ Things that bite

1. **Next.js 16** has breaking changes from training data — read [`/AGENTS.md`](/AGENTS.md) before writing any code
2. **`OTP_BYPASS=true`** in dev makes registration skip phone verification — must be `false` in prod (see [`env.md`](env.md) §3)
3. **`LINE_PUSH_BYPASS=true`** is default — notifications only log to console; LINE creds set 2026-05-14 but bypass stays true in dev (see [`env.md`](env.md) §7)
4. **China-search vendor cutoff (Track G)** — Pacred lib/china-search wired to TAMIT-cloud per audit, BUT vendor = ไอแต้ม which Pacred wants to cut. DON'T set `PACRED_TAMIT_*` in Vercel prod until ก๊อต picks replacement (Option A-E in [`PORT_PLAN.md`](PORT_PLAN.md) Part R1). Code degrades to demo mode when env unset — that's the intended interim
5. **Middleware file** is `proxy.ts` not `middleware.ts` (Next 16 rename)
6. **i18n key missing** crashes the page — always add both th + en. Audit script: `node scripts/i18n-audit.mjs`
7. **Don't use `profiles.role`** — use `is_admin()` SECURITY DEFINER function or query `admins` table (per [`decisions/0002-admin-architecture.md`](decisions/0002-admin-architecture.md))
8. **Push to `main` directly = bypass mode** — only เดฟ for urgent hotfix. Normal flow: น้อง→own branch→เดฟ→`dave`→ก๊อต→`main`
9. **Push frequency = $$** — Vercel builds cost. Commit local often, push at save-points only (~1-3/day). See [`team.md`](team.md) §3.0
10. **`profiles.line_user_id`** stays NULL until D-1-LIFF customer linkage runs — every LINE push to customer is silent no-op until LIFF activated

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
