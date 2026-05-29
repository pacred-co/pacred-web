# 3-Deploy Architecture — Final (2026-05-29)
**Owner directive:** ตั้ง 3 deploys คู่ขนาน · ใช้ DB prod เดียวกัน · ทีมเลือกใช้ admin version ตามถนัด.

---

## 🗺 Architecture

```
┌─────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ pacred.co.th            │  │ admin.pacred.co.th           │  │ admin2.pacred.co.th          │
│ pacred-web/main         │  │ pacred-admin-next/main       │  │ pacred-web/Poom-pacred       │
│ Website + customer      │  │ ก๊อต admin baseline 246 pages│  │ ภูม admin V2 (Wave 1-30+)    │
└─────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
            │                              │                                │
            └──────────────────────────────┼────────────────────────────────┘
                                           ▼
                         Shared Supabase prod: yzljakczhwrpbxflnmco
```

## 🟢 Deploy #1 — pacred.co.th (customer-facing)
- **Repo:** `pacred-co/pacred-web`
- **Branch:** `main`
- **Role:** Website + customer member portal + ปอน's MOMO admin (transitional)
- **Vercel project:** (existing)
- **Domain:** pacred.co.th
- **Active devs:** เดฟ (integrator) · ปอน (frontend on `InwPond007`)

## 🟢 Deploy #2 — admin.pacred.co.th (ก๊อต baseline)
- **Repo:** `pacred-co/pacred-admin-next`
- **Branch:** `main`
- **Role:** Standalone admin app · ก๊อต 1:1 PHP→Next port · 246 pages
- **Vercel project:** `pacred-admin-next.vercel.app` (existing)
- **Domain:** admin.pacred.co.th
- **Auth:** NextAuth v5 Credentials (tb_admin) + DEV_BYPASS=true ใน dev
- **Routes:** ไม่มี `/admin` prefix (top-level) — `/dashboard` · `/admins` · `/accounting` · `/api-forwarder-momo` · `/barcode` · ฯลฯ
- **Active devs:** ก๊อต (baseline) · ภูม (future hand-off)

## 🟧 Deploy #3 — admin2.pacred.co.th (ภูม V2) ⚠️ NEW · ก๊อต ตั้ง Vercel project
- **Repo:** `pacred-co/pacred-web` (= main customer repo)
- **Branch:** `Poom-pacred`
- **Role:** ภูม enhanced admin · Wave 1-30+ · Pacred Tailwind · brand-red · sidebar groups
- **Vercel project:** TBD (ก๊อต ตั้งใหม่)
- **Domain:** admin2.pacred.co.th
- **Auth:** ใช้ Supabase SSR ของ pacred-web (admin guard `is_admin()` + `admins` table per ADR-0002)
- **Routes:** มี `/admin` prefix (locale-aware) — `/admin/customers` · `/admin/forwarders` · `/admin/api-forwarder-momo/sync` · ฯลฯ
- **Active devs:** ภูม (active push Wave 30 cron + Wave 29 #213 barcode rewrite ล่าสุด)

---

## 🔥 NEW Vercel project setup — admin2.pacred.co.th

1. **Vercel UI** → New Project → Import `pacred-co/pacred-web`
2. **Project name:** `pacred-admin2` (or `pacred-admin-v2`)
3. **Production Branch:** `Poom-pacred` (not `main`)
4. **Framework Preset:** Next.js
5. **Root Directory:** `./` (no monorepo nesting)
6. **Build & Output:**
   - Build command: `pnpm build`
   - Install command: `pnpm install`
7. **Env vars (copy full prod env from pacred-web Vercel project):**
   - `NEXT_PUBLIC_SUPABASE_URL=https://yzljakczhwrpbxflnmco.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...` (prod anon)
   - `SUPABASE_SERVICE_ROLE_KEY=...` (prod service_role)
   - `NEXT_PUBLIC_SITE_URL=https://admin2.pacred.co.th` ← **change this**
   - All LINE_* + MOMO_TOKEN + TAMIT/AkuCargo/Laonet keys
   - `NOTIFY_BYPASS=false` (admin2 = prod, real notifications fire)
   - `LINE_PUSH_BYPASS=false` (same)
   - `OTP_BYPASS=false` (same)
   - Do NOT set `DEV_BYPASS=true` on prod
8. **Domain:** add `admin2.pacred.co.th` in Domains tab
9. **Deploy** — ภูม push commit ใหม่ → auto-deploy (เหมือน main)

## 🔐 Same Supabase prod project · 3 deploys

ทุก deploy ใช้ DB เดียว → schema/data ใช้ชุดเดียว ⇒ change ที่ admin1 เห็นที่ admin2 + main ทันที. RLS policies ต้องครอบทุก deploy ใช้งานได้.

⚠️ **Auth differences:**
- pacred-web (main + Poom-pacred) → Supabase SSR auth (`@supabase/ssr`) · admin guard `is_admin()` SECURITY DEFINER
- pacred-admin-next → NextAuth Credentials · ตรง tb_admin · token cookie แยก

ทั้ง 2 systems read same `tb_admin` / `profiles` tables · session storage ต่างกัน.

---

## 🛠 Local dev — 3 servers

```bash
# Terminal 1: pacred-web (port 3000)
cd ~/pacred-web
git checkout main
pnpm dev                        # → http://localhost:3000

# Terminal 2: pacred-admin-next (port 3001)
cd ~/pacred-admin-next
git checkout main
pnpm dev --port 3001            # → http://localhost:3001 (DEV_BYPASS=true)

# Terminal 3: pacred-web/Poom-pacred (port 3002) — admin2 preview
cd ~/pacred-web-poom            # separate clone OR worktree
git checkout Poom-pacred
pnpm dev --port 3002            # → http://localhost:3002
```

⚠️ **Note:** Local clones must point at PROD Supabase (`yzljakczhwrpbxflnmco`) — see `.env.local` template at top of repo · backup of DEV at `.env.local.dev-backup-*`.

---

## 📦 Migration ownership

Single source of truth: **`pacred-web/supabase/migrations/`** ที่เดียว.
- Numbered `0001..0118` (เดฟ + ภูม + ปอน historic)
- New migrations: append `0119`, `0120`, etc.
- ปอน's MOMO Phase A-D = `0119..0122` (pending verify apply prod)
- pacred-admin-next/supabase/migrations/ × 4 = ก๊อต's own RPC migrations (separate concern)

ใครจะแก้ schema → คุยเดฟก่อน → เดฟ เขียน migration + apply prod + push.

---

## ⚠️ Pending action items

| # | Owner | Task | Effort |
|---|---|---|---|
| 1 | ก๊อต | สร้าง Vercel project ใหม่สำหรับ admin2 (Poom-pacred branch) | 15 นาที |
| 2 | ก๊อต | DNS: ตั้ง admin2.pacred.co.th → Vercel | 5 นาที |
| 3 | เดฟ + ปอน | Verify migrations 0119-0122 apply prod (MOMO Phase A-D) | 30 นาที |
| 4 | ภูม | S3 access key rotation `e913d7da34ca0089638f100afb74c972` (leaked) | 5 นาที |
| 5 | ก๊อต | CRON_SECRET env var บน Vercel prod (ภูม cron live) | 5 นาที |
| 6 | เดฟ | ทำ next session: 3 BIG P0 cluster D + 4 LOAD-BEARING fidelity gaps | 8-11 วัน |

---

## 🎯 Resume command (next session at home/work)

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune && git pull origin main --no-edit
head -100 CLAUDE.md                                       # 3-deploy architecture
cat docs/team-2026-05-29-3-deploy-architecture.md         # this doc
bash scripts/setup-dave.sh                                # auto status + pickup
```
