# 🛠 งาน ก๊อต — Vercel + Cloudflare setup (admin2 + CRON_SECRET + prod env audit)
**Created:** 2026-05-29 (เดฟ) · **Owner:** ก๊อต
**Context:** 3-deploy architecture — ดู `docs/team-2026-05-29-3-deploy-architecture.md`

ทั้งหมดนี้คืองานที่ ก๊อต ต้องทำใน Vercel dashboard + Cloudflare DNS. เดฟ apply migrations 0119-0122 ให้แล้ว (ดูข้างล่าง §0). งานที่เหลือเป็น infra config ที่ต้องทำผ่าน console — Claude ทำให้ไม่ได้.

---

## §0 ✅ DONE by เดฟ (2026-05-29) — ไม่ต้องทำซ้ำ

- ✅ Migrations 0119-0122 (ปอน MOMO Phase A-D) **applied to prod** (yzljakczhwrpbxflnmco) · 9 tables + 5 columns · legacy intact · tracked on main `bbbf6ebf`
- ✅ `.env.local` (เดฟ local) switched dev → prod
- ✅ 3-deploy architecture documented + pushed

---

## §1 🔴 CRON_SECRET — ตั้งให้ครบทุก project (ค้างมานาน · ภูม cron live แล้ว)

**ปัญหา:** `vercel.json` มี 11 cron jobs. ทุก `/api/cron/*` route เช็ค `CRON_SECRET` (Bearer token) ก่อนรัน. ถ้าไม่ตั้ง env var นี้บน Vercel prod → cron จะ 401 ทุกครั้ง → ไม่มี job ไหนรันเลย (auto-cancel-orders, momo-sync, sms-balance-check ฯลฯ ตายหมด).

**ทำ:**
1. Generate secret 1 ตัว: `openssl rand -hex 32` (หรือ `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
2. Vercel → **pacred-web** project → Settings → Environment Variables → Add:
   - Key: `CRON_SECRET`
   - Value: `<generated hex>`
   - Environments: **Production** (ติ๊ก Production อย่างเดียวพอ · cron รันแค่ prod)
3. Redeploy (หรือรอ deploy รอบหน้า) — Vercel inject `CRON_SECRET` ให้ทั้ง cron caller + route โดยอัตโนมัติ

**Verify หลัง deploy:**
```bash
# ควร 401 (ถ้าไม่ใส่ token = ถูกต้อง ป้องกันได้)
curl -s -o /dev/null -w "%{http_code}\n" https://pacred.co.th/api/cron/momo-sync
# = 401

# Vercel → project → Cron Jobs tab → ดู last run = success (ไม่ใช่ 401)
```

⚠️ **ถ้าตั้ง admin2 ด้วย (Poom-pacred) → ต้องใส่ CRON_SECRET ตัวเดียวกันด้วย** (ดู §3 + §4 double-cron warning).

---

## §2 🟢 Prod env audit — pacred-web project (ตรวจ env บน Vercel ตรงกับ prod)

เดฟ switch local ไป prod แล้ว · ต้องมั่นใจว่า **Vercel pacred-web project** ก็ใช้ prod project (yzljakczhwrpbxflnmco) + keys ครบ.

**ตรวจ Vercel → pacred-web → Settings → Environment Variables (Production):**

| Var | ค่าที่ถูก | หมายเหตุ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://yzljakczhwrpbxflnmco.supabase.co` | prod project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon JWT | ต้องเป็นของ yzlja… |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service_role JWT | ต้องเป็นของ yzlja… |
| `NEXT_PUBLIC_SITE_URL` | `https://pacred.co.th` | |
| `NOTIFY_BYPASS` | **ไม่ตั้ง หรือ = false** | ⚠️ prod ต้องส่ง notification จริง · code hard-disable bypass บน VERCEL_ENV=production อยู่แล้ว แต่อย่าตั้ง true ให้ชัวร์ |
| `OTP_BYPASS` | **ไม่ตั้ง หรือ = false** | prod ต้องส่ง OTP จริง |
| `LINE_PUSH_BYPASS` | `false` | prod push LINE จริง |
| `CRON_SECRET` | (จาก §1) | |
| `LINE_CHANNEL_*` · `LINE_LOGIN_*` · `NEXT_PUBLIC_LIFF_ID` | ตามที่ owner ส่ง | |
| `MOMO_TOKEN` · `MOMO_JMF_TOKEN` | ตามที่ owner ส่ง | |
| `PACRED_TAMIT_*` · `PACRED_AKUCARGO_*` · `PACRED_LAONET_*` | ตามที่ owner ส่ง | |
| `SUPABASE_S3_*` | ⚠️ key leaked — rotate (ดู §6) | |
| `PROMPTPAY_ID` | ⚠️ ยังว่าง — ต้องใส่เพื่อ /wallet/deposit QR | owner ใส่ |

---

## §3 🟧 admin2.pacred.co.th — สร้าง Vercel project ใหม่ (Poom-pacred branch)

ภูม version จะออนที่ admin2.pacred.co.th จาก `pacred-web` repo branch `Poom-pacred`.

**Vercel → Add New → Project:**
1. Import Git Repository → `pacred-co/pacred-web` (repo เดิม · คนละ project)
2. **Project Name:** `pacred-admin2` (หรือ `pacred-admin-v2`)
3. **Framework Preset:** Next.js (auto)
4. **Root Directory:** `./`
5. **Settings → Git → Production Branch:** เปลี่ยนจาก `main` → **`Poom-pacred`** ⚠️ สำคัญ
6. **Build Command:** `pnpm build` · **Install Command:** `pnpm install`
7. **Environment Variables (Production):** copy ทั้งหมดจาก pacred-web project แล้วแก้:
   - `NEXT_PUBLIC_SITE_URL` = `https://admin2.pacred.co.th` ← เปลี่ยน
   - `CRON_SECRET` = ตัวเดียวกับ §1 (ถ้าจะให้ admin2 รัน cron — ดู §4 ก่อน)
   - ที่เหลือเหมือน pacred-web prod (Supabase prod + LINE + MOMO + TAMIT ฯลฯ)
   - **อย่าใส่** `DEV_BYPASS=true` บน prod
8. Deploy

**Verify:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://pacred-admin2.vercel.app/   # 200/307
```

---

## §4 ⚠️ DOUBLE-CRON WARNING — ต้องตัดสินใจก่อนเปิด admin2

`vercel.json` มี crons ทั้งใน `main` และ `Poom-pacred`. **Vercel รัน cron ตาม production deployment ของแต่ละ project.** ถ้าเปิด admin2 (Poom-pacred) เป็น Vercel project แยก โดย vercel.json ยังมี crons → **cron จะรัน 2 ที่ · ชน DB เดียวกัน**:

| Cron | main schedule | Poom-pacred schedule | ผลถ้ารันทั้งคู่ |
|---|---|---|---|
| `momo-sync` | `30 18 * * *` (วันละครั้ง) | `*/10 * * * *` (ทุก 10 นาที) | ดึง MOMO ซ้ำ · upsert ชนกัน |
| `auto-cancel-orders` | `*/15` | `*/15` | cancel order 2 รอบ · **อันตราย** |
| `send-scheduled-broadcasts` | `*/5` | `*/5` | **ส่ง broadcast ซ้ำ 2 เท่า** 🔴 |

**ต้องเลือก 1 ใน 2:**
- **Option A (แนะนำ):** ลบ `crons` ออกจาก `vercel.json` บน `Poom-pacred` → ให้ `main` (pacred.co.th) เป็นเจ้าของ cron ทั้งหมด เจ้าเดียว. admin2 = UI อย่างเดียว ไม่รัน cron. (ภูม ลบ crons block ใน Poom-pacred/vercel.json + push)
- **Option B:** ให้ `Poom-pacred` เป็นเจ้าของ momo-sync (เพราะ code populate tables 0119-0122 อยู่บน Poom-pacred) แต่ลบ cron อื่นที่ซ้ำ. ซับซ้อนกว่า · ต้องแยกว่า cron ไหนรันที่ไหน.

**เดฟ recommend Option A** — main เป็น cron owner เจ้าเดียว · admin1/admin2 = pure UI. (แต่ momo-sync บน main เป็น `30 18` วันละครั้ง — ถ้าอยากได้ทุก 10 นาที ภูม ต้องแก้ main's vercel.json momo-sync schedule แทน).

→ **ก๊อต/ภูม ตัดสินใจ + แจ้งเดฟ** ก่อนเปิด admin2 production.

---

## §5 ☁️ Cloudflare DNS — admin2.pacred.co.th

pacred.co.th DNS อยู่บน Cloudflare. ต้องเพิ่ม record ให้ admin2 ชี้ Vercel.

**Cloudflare → pacred.co.th zone → DNS → Add record:**

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `admin2` | `cname.vercel-dns.com` | 🟠 DNS only (grey cloud) แนะนำ · หรือ Proxied ถ้าจะใช้ CF cache |

> ⚠️ Vercel แนะนำ **CNAME → `cname.vercel-dns.com`** สำหรับ subdomain. ค่า target ที่แท้จริง Vercel จะบอกตอน Add Domain ใน project (Settings → Domains → admin2.pacred.co.th → จะโชว์ว่าต้องตั้ง CNAME ไปที่ไหน). ใช้ค่าที่ Vercel บอกเป็นหลัก.

**ขั้นตอนจริง:**
1. Vercel → pacred-admin2 project → Settings → Domains → Add → `admin2.pacred.co.th`
2. Vercel โชว์ DNS record ที่ต้องตั้ง (CNAME target)
3. Cloudflare → เพิ่ม CNAME ตามที่ Vercel บอก
4. รอ propagate (ปกติ < 5 นาที กับ Cloudflare)
5. Vercel auto-issue SSL cert (Let's Encrypt) เมื่อ DNS verify ผ่าน

**SSL/TLS mode (Cloudflare → SSL/TLS):** ตั้งเป็น **Full** หรือ **Full (strict)** — อย่าใช้ Flexible (จะ redirect loop กับ Vercel).

**ตรวจ admin.pacred.co.th (ก๊อต baseline · online แล้ว) ว่า DNS ถูก:**
```bash
nslookup admin.pacred.co.th
# ควรชี้ไป Vercel (cname.vercel-dns.com / 76.76.21.x)
```

---

## §6 🔴 S3 access key rotation (ภูม · ค้างจาก 2026-05-20)

Key `e913d7da34ca0089638f100afb74c972` leaked ใน chat ตั้งแต่วันแรก. ยังไม่ rotate.

**ทำ (ภูม หรือ ก๊อต):**
1. Supabase Dashboard → Project (yzljakczhwrpbxflnmco) → Project Settings → Storage → S3 Access Keys
2. Revoke key `e913d7da34ca0089638f100afb74c972`
3. Create new key → copy ทั้ง access key id + secret
4. Update env ทุกที่:
   - Vercel pacred-web (Production) → `SUPABASE_S3_ACCESS_KEY_ID` + `SUPABASE_S3_SECRET_ACCESS_KEY`
   - Vercel admin2 (ถ้ามี)
   - local `.env.local` ของทุกคน
5. Redeploy

---

## 📋 Checklist สรุป (ก๊อต tick ทีละข้อ)

- [ ] §1 ตั้ง `CRON_SECRET` บน pacred-web Vercel (Production) + redeploy → verify cron tab = success
- [ ] §2 audit pacred-web prod env vars ครบ (Supabase prod + bypass=false + tokens)
- [ ] §4 ตัดสินใจ double-cron (Option A: ภูม ลบ crons จาก Poom-pacred/vercel.json) → แจ้งเดฟ
- [ ] §3 สร้าง Vercel project `pacred-admin2` (Poom-pacred branch + prod env + SITE_URL=admin2)
- [ ] §5 Cloudflare: เพิ่ม CNAME admin2 → Vercel target + SSL Full + verify domain
- [ ] §6 rotate S3 key + update env ทุกที่ + redeploy
- [ ] (มี) ใส่ `PROMPTPAY_ID` บน pacred-web prod (เปิด /wallet/deposit QR)

---

## 🔗 Reference
- 3-deploy architecture: `docs/team-2026-05-29-3-deploy-architecture.md`
- Cron routes: `vercel.json` (11 jobs) + `app/[locale]/api/cron/*` (Poom-pacred has the api/cron handlers)
- CRON_SECRET usage in code: `grep -r "CRON_SECRET" app/ lib/`
- Migrations applied: `supabase/migrations/0119-0122` (tracked on main `bbbf6ebf`)
- ⚠️ MOMO consuming code (mapper Phase A-D) ยังอยู่บน `origin/podeng` — ตาราง 0119-0122 ว่างจนกว่า code นั้น merge เข้า main หรือรันบน admin2
