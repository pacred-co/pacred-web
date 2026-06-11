# Pacred Web

> เว็บไซต์ทางการของ **Pacred** — บริการนำเข้า–ส่งออก, ชิปปิ้งเคลียร์ศุลกากร, ฝากสั่งซื้อสินค้าจากจีน, และโลจิสติกส์ครบวงจร

📘 **ทีมงานใหม่ — เริ่มที่ [`docs/HANDBOOK.md`](docs/HANDBOOK.md)** (entry + documentation map + quick start)

---

## Stack

- **Next.js 16.2.6** (App Router) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4** — theme define ที่ `app/globals.css` (`@theme inline`, ไม่มี `tailwind.config.js`)
- **next-intl** — i18n รองรับ ภาษาไทย / English
- **next-themes** — light / dark mode
- **lucide-react** — icon set
- **pnpm** — package manager

> ⚠️ Next.js 16 มี breaking changes จากเวอร์ชันก่อนหน้า — middleware ตอนนี้อยู่ที่ `proxy.ts` (ดู [`AGENTS.md`](AGENTS.md)) ก่อนแก้โค้ด ให้อ่าน docs ใน `node_modules/next/dist/docs/`

---

## Getting Started

> 📖 อ่าน [`docs/setup/local-development.md`](docs/setup/local-development.md) ก่อน — มีรายละเอียดทุกขั้นตอน

### Quick start

```bash
# 1. Install
pnpm install

# 2. Setup env
cp .env.example .env.local
# → แก้ค่าใน .env.local ตามคู่มือ docs/setup/

# 3. Setup Supabase (สร้าง project + รัน SQL)
# → ทำตาม docs/setup/supabase.md

# 4. Run dev
pnpm dev
```

เปิด [http://localhost:3000](http://localhost:3000) — locale default `th`, อังกฤษที่ `/en`

### Scripts
| Command | Description |
|---|---|
| `pnpm dev` | start dev server (hot reload) |
| `pnpm build` | production build |
| `pnpm start` | start production server (after build) |
| `pnpm lint` | run ESLint |

---

## Folder Structure

```
pacred-web/
├─ app/[locale]/                  # App Router with locale prefix
│  ├─ (public)/                   # ไม่ต้อง login (home)
│  ├─ (auth)/                     # auto-redirect → / ถ้า login (login, register)
│  ├─ (protected)/                # auto-redirect → /login ถ้าไม่ login (dashboard, orders)
│  └─ complete-profile/           # ต้อง login + allows incomplete profile
├─ app/auth/                      # OAuth callback + signout (no locale)
│
├─ actions/                       # Server Actions (mutations)
│  ├─ auth.ts                     # signIn, register*, OAuth
│  ├─ otp.ts                      # requestOtp, verifyOtp (with bypass)
│  └─ orders.ts                   # demo CRUD pattern reference
│
├─ lib/
│  ├─ supabase/                   # 3 clients: browser, server, admin
│  ├─ auth/                       # get-user, require-auth helpers
│  ├─ sms/gateway.ts              # ThaiBulkSMS adapter
│  ├─ utils/                      # phone normalization, etc.
│  └─ validators/                 # Zod schemas
│
├─ components/
│  ├─ sections/                   # navbar, hero, service, blog, footer, ...
│  ├─ ui/                         # button, carousel, ...
│  └─ icons/                      # brand SVGs (Google/LINE/Facebook)
│
├─ messages/{th,en}.json          # i18n translations
├─ i18n/                          # next-intl config
├─ supabase/                      # SQL schema + migrations
│  ├─ schema.sql
│  └─ migrations/0002_orders.sql
│
├─ public/images/                 # logos, banners, etc.
├─ docs/
│  ├─ architecture.md             # 📐 system blueprint (diagrams, flows)
│  └─ setup/                      # 🔧 service config guides
│     ├─ README.md
│     ├─ local-development.md
│     ├─ supabase.md
│     ├─ thaibulksms.md
│     ├─ google-oauth.md
│     ├─ facebook-oauth.md
│     ├─ line.md
│     └─ vercel.md
│
├─ proxy.ts                       # middleware (i18n + Supabase session refresh)
├─ .env.example                   # env vars template
├─ next.config.ts
├─ CLAUDE.md                      # context for AI agents
└─ AGENTS.md                      # Next.js 16 breaking-change warning
```

---

## Internationalization (i18n)

- ใช้ [next-intl](https://next-intl-docs.vercel.app)
- **Default locale:** `th` — `localePrefix: "as-needed"`
- เพิ่มข้อความใหม่ → แก้ทั้ง `messages/th.json` + `messages/en.json` พร้อมกัน
- อ่านในคอมโพเนนต์:
  ```tsx
  import { useTranslations } from "next-intl";
  const t = useTranslations("namespace");
  // <p>{t("key")}</p>
  ```
- Link ที่ต้อง locale-aware ให้ import จาก `@/i18n/navigation`:
  ```tsx
  import { Link } from "@/i18n/navigation";
  <Link href="/login">เข้าสู่ระบบ</Link>
  ```

---

## Theming

- Theme variables ที่ `app/globals.css` ใต้ `@theme inline`
- Brand color: **`primary-600` = #B30000** (Pacred red)
- Dark mode toggle ใน NavBar (next-themes)
- Tailwind utility classes ตาม theme:
  - `bg-primary-600`, `text-foreground`, `border-border`, `bg-surface`, `text-muted` ฯลฯ
- หลีกเลี่ยง hex hardcode ยกเว้น brand provider (LINE green `#06C755`, Facebook `#1877F2`)

---

## Pages Overview

| Route | สถานะ | หมายเหตุ |
|---|---|---|
| `/` (home) | ✅ live | landing — hero / promotion / service / blog / partner / sales |
| `/login` | ✅ wired | email/phone/member-code + Google/Facebook OAuth (LINE = mocked) |
| `/register` | ✅ wired | Personal + Juristic 3-step (with file uploads) |
| `/dashboard` | ✅ basic | profile info + member_code + quick links (placeholder for full feature) |
| `/complete-profile` | ⏳ placeholder | จะมี form ทีหลัง |
| `/auth/callback` (server) | ✅ | OAuth code exchange |
| `/auth/signout` (POST) | ✅ | clears session |

---

## Service Setup Guides

ก่อน dev/deploy ต้องตั้งค่า service ภายนอก — แยกคู่มือไฟล์ละ service ที่ [`docs/setup/`](docs/setup/):

| คู่มือ | ใช้เมื่อ |
|---|---|
| [`local-development.md`](docs/setup/local-development.md) | เริ่ม dev บน machine ใหม่ |
| [`supabase.md`](docs/setup/supabase.md) | สร้าง project + รัน SQL + ตั้ง auth providers |
| [`thaibulksms.md`](docs/setup/thaibulksms.md) | ปิด `OTP_BYPASS` แล้วใช้ OTP จริง |
| [`google-oauth.md`](docs/setup/google-oauth.md) | เปิดปุ่ม Google login |
| [`facebook-oauth.md`](docs/setup/facebook-oauth.md) | เปิดปุ่ม Facebook login |
| [`line.md`](docs/setup/line.md) | เปิดปุ่ม LINE login |
| [`vercel.md`](docs/setup/vercel.md) | deploy ขึ้น production |

📐 **System architecture** (ก่อนเริ่ม implement feature ใหญ่): [`docs/architecture.md`](docs/architecture.md) — มี high-level diagram, DB schema, auth flows, security model

---

## Tech Decisions (locked)

- **Hosting:** Vercel (frontend + Server Actions) + Supabase Cloud (auth/db/storage)
- **Phone OTP:** ThaiBulkSMS (custom — bypass via `OTP_BYPASS=true` ใน dev)
- **OAuth:** Google + Facebook + LINE (LINE ผ่าน custom OIDC)
- **member_code:** `PR001` running (PR + ขั้นต่ำ 3 หลัก, overflow-safe), auto-gen ผ่าน Postgres trigger
- **Email verification:** optional (Supabase confirm-email = OFF)
- **Password:** min 6 / max 30 (no complexity rules)
- **Backend pattern:** Hybrid — Supabase BaaS + Next.js Server Actions (ไม่มี service แยก)

---

## Conventions

- **Component:** Server Component เป็น default; ใช้ `"use client"` เฉพาะเมื่อต้องการ state / effect / event handler
- **Mutations:** ทำผ่าน **Server Actions** ใน [`actions/`](actions/) — ห้ามเรียก Supabase admin จาก client
- **Data access:** ผ่าน Supabase clients 3 ตัวใน [`lib/supabase/`](lib/supabase/):
  - `client.ts` — browser ("use client")
  - `server.ts` — RSC + Server Action (มี cookies + RLS)
  - `admin.ts` — service-role (bypass RLS, server only)
- **Carousels:** `<ServiceCarousel />` รับ 3 variants (`items` / `imageItems` / `blogItems`) ดู [`components/ui/service-carousel.tsx`](components/ui/service-carousel.tsx)
- **Path alias:** `@/*` → `./*`
- **Icons:** `lucide-react` ทั้งโปรเจกต์ (outline-style); brand icons (Google/LINE/FB) อยู่ที่ [`components/icons/social-icons.tsx`](components/icons/social-icons.tsx)
- **i18n keys:** ตั้งชื่อตาม namespace ของ section/page (`nav.*`, `service.*`, `login.*`, `register.*`, ...) — แก้ทั้ง th + en พร้อมกันเสมอ
- **Localized links:** ใช้ `Link` จาก `@/i18n/navigation` แทน `next/link` (auto-prefix locale)

---

## Adding a new feature

ทำตาม pattern นี้ (อ้างอิง [lib/validators/refund.ts](lib/validators/refund.ts) + [actions/refunds.ts](actions/refunds.ts) + [app/[locale]/(protected)/refunds/](app/[locale]/(protected)/refunds/) เป็นตัวอย่าง · เดิมชี้ `/orders` demo ที่ลบไป 2026-06-10):

1. **SQL** — เพิ่ม table + RLS ที่ `supabase/migrations/00NN_<name>.sql` → รันใน Supabase SQL Editor
2. **Validator** — Zod schema ใน `lib/validators/<name>.ts`
3. **Server Actions** — `actions/<name>.ts` (`"use server"`)
4. **Pages** — ใต้ `app/[locale]/(protected)/<name>/` (auto auth guard)
5. **i18n** — เพิ่ม namespace ใน `messages/th.json` + `en.json`
6. **(optional)** Realtime — `supabase.channel(...)` ใน `"use client"` component

ดูรายละเอียดที่ [`docs/architecture.md`](docs/architecture.md) Section 9

---

## Contributing

1. สร้าง branch: `git checkout -b feature/<name>`
2. แก้โค้ด ตาม conventions ข้างบน
3. เพิ่ม locale string ทั้ง th + en
4. ตรวจ:
   - `pnpm exec tsc --noEmit` (TypeScript)
   - `pnpm lint` (ESLint)
5. PR + รอ review

---

## License

Private © Pacred. All rights reserved.
