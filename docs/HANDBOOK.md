# 📘 Pacred — Team Handbook

> Entry point for everyone on the team — start here.

Last updated: 2026-05-13

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
- ค่า env เอาจากไหน → ถามเดฟ
- งานของฉันคืออะไร → [`team.md`](team.md) + [`PORT_PLAN.md`](PORT_PLAN.md) Part E + Part N6
- เขียน code ยังไง → [`conventions.md`](conventions.md)
- Architecture → [`architecture.md`](architecture.md)

---

## 🗺️ Documentation map

### ⭐ Canonical (read first, in this order)

| File | คืออะไร | ใครต้องอ่าน |
|---|---|---|
| [`team.md`](team.md) | **Roles + permissions + branch + merge policy** | ทุกคน — ครั้งแรก |
| [`conventions.md`](conventions.md) | Code style + commit format + i18n + DB rules | ทุกคน |
| [`env.md`](env.md) | Every env var explained + production checklist | เดฟ + ภูม |
| [`HANDBOOK.md`](HANDBOOK.md) | ไฟล์นี้ — entry/index |

### 📋 Work tracking (living docs — เดฟ updates)

| File | คืออะไร |
|---|---|
| [`PORT_PLAN.md`](PORT_PLAN.md) | Master plan — PHP feature inventory + sprints + audit results (Part A-N) |
| [`architecture.md`](architecture.md) | System architecture — diagrams, DB schema, auth flow, security |
| [`PACRED-SECOND-BRAIN.md`](PACRED-SECOND-BRAIN.md) | Context notes + gotchas |
| [`decisions/*.md`](decisions/) | Architecture Decision Records (ADRs) |

### 🛠️ Setup guides

| File | คืออะไร |
|---|---|
| [`setup/`](setup/) | OAuth, Supabase, Vercel, LINE, etc. — onboarding |
| [`/supabase/migrations/README.md`](/supabase/migrations/README.md) | DB migration runbook |

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

## 🚦 Daily workflow (TL;DR)

```bash
# Morning — sync main
git checkout main && git pull origin main

# Switch to your branch + merge main
git checkout <my-branch>          # dave / podeng / Poom
git merge main
git push origin <my-branch>

# ทำงาน + commit (เป็นระยะ ไม่รอเย็น)
git commit -m "<type>(<scope>): <message>"

# เสร็จ feature → push
git push origin <my-branch>

# แจ้งเดฟ/ก๊อต review (LINE / Slack / PR)
```

→ Full detail in [`team.md`](team.md) §3

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

## 🎯 Current state (2026-05-13)

- **Active sprint:** Sprint 5 (per [`PORT_PLAN.md`](PORT_PLAN.md) Part N6 + Part N — to be updated with new role mapping)
- **Branch state:** `dave` consolidates `Poom` + `podeng` + own work → ready for review → main
- **Production readiness:** ~65% customer / ~80% admin / 95% HR / 50% infra (see [`PORT_PLAN.md`](PORT_PLAN.md) Part N2)
- **Critical blockers:** 8 env vars unset, 6 missing features, ~10 hardening gaps (see [`PORT_PLAN.md`](PORT_PLAN.md) Part N3 + N9)

---

## ⚠️ Things that bite

1. **Next.js 16** has breaking changes from training data — read [`/AGENTS.md`](/AGENTS.md) before writing any code
2. **`OTP_BYPASS=true`** in dev makes registration skip phone verification — must be `false` in prod (see [`env.md`](env.md) §3)
3. **`LINE_PUSH_BYPASS=true`** is default — notifications only log to console (see [`env.md`](env.md) §7)
4. **`PACRED_RCGROUP_API_URL` unset** → URL paste returns demo product silently (see [`env.md`](env.md) §5)
5. **Middleware file** is `proxy.ts` not `middleware.ts` (Next 16 rename)
6. **i18n key missing** crashes the page — always add both th + en
7. **Don't use `profiles.role`** — use `is_admin()` SECURITY DEFINER function or query `admins` table (per [`decisions/0002-admin-architecture.md`](decisions/0002-admin-architecture.md))

---

## 🔗 Quick links

- Repo: https://github.com/pacred-co/pacred-web
- Production: https://pacred.co (TBD)
- Supabase Dashboard: https://supabase.com/dashboard (link with เดฟ)
- LINE OA: https://lin.ee/Yg3fU0I
- Legacy PHP source (read-only ref): `C:\xampp\htdocs\pcscargo\` (เดฟ's machine)

---

**Welcome to Pacred 🚢** — ติดอะไรถามเดฟได้ตลอดครับ
