@AGENTS.md

# Project Snapshot — pacred-web

Last updated: 2026-05-10

> **Pacred** — ระบบเว็บไซต์บริษัทนำเข้า-ส่งออก / ชิปปิ้ง / เคลียร์ศุลกากร / ฝากสั่งซื้อสินค้าจากจีน
> Marketing site + landing pages + (incoming) member portal

## Stack
- Next.js **16.2.6** (App Router) — **โปรดอ่าน AGENTS.md: เวอร์ชันนี้มี breaking changes จาก training data**
- React 19.2.4
- TypeScript 5 (strict)
- Tailwind CSS v4 (`@theme inline` ใน [app/globals.css](app/globals.css) — ไม่มี tailwind.config.js)
- ESLint 9 (flat config, eslint-config-next)
- **next-intl** ^4.11.1 — i18n (th/en) แบบ namespace ใน [messages/](messages/)
- **next-themes** ^0.4.6 — light/dark mode
- **lucide-react** ^1.14.0 — icons (Lucide outline-style ทั้งโปรเจกต์)
- Package manager: **pnpm**

> หมายเหตุ: middleware อยู่ที่ [proxy.ts](proxy.ts) (ไม่ใช่ `middleware.ts` — เป็นรูปแบบของ Next 16)

## Scripts
- `pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`

## Conventions

### Routing & i18n
- Path alias: `@/*` → `./*`
- App Router อยู่ที่ [app/](app/) — locale prefix `as-needed` ([i18n/routing.ts](i18n/routing.ts))
- Locale rooted: `app/[locale]/**`
- Default locale: **th**, supported: th + en
- ใช้ `Link` จาก `@/i18n/navigation` แทน `next/link` เสมอ (เพื่อให้ locale prefix ถูก inject)
- Translations ที่ [messages/th.json](messages/th.json) + [messages/en.json](messages/en.json) — ใช้ namespace ตาม section/page (เช่น `nav.*`, `service.*`, `login.*`, `register.*`)

### Styling
- Theme colors define ใน [app/globals.css](app/globals.css) `@theme inline`:
  - `primary-50` → `primary-950` (red palette, 600 = #B30000 = brand)
  - `--color-foreground / --color-background / --color-surface / --color-border / --color-muted`
  - Dark mode ผ่าน `.dark` class (next-themes)
- Font: **Prompt** (`var(--font-prompt)`) ตั้งใน root layout
- ใช้ Tailwind utility ให้ตรง theme — หลีกเลี่ยง hex hardcode ยกเว้นจำเป็น (เช่น brand color ของ social provider)

### Components
- Section-level: [components/sections/](components/sections/) — เช่น `navbar`, `hero-section`, `service`, `blog`, `partner`, `footer`, `floating-tabs`
- Reusable UI: [components/ui/](components/ui/) — เช่น `button`, `service-carousel`, `promo-carousel`, `sales-carousel`
- Icons: [components/icons/social-icons.tsx](components/icons/social-icons.tsx) — Google/LINE/Facebook brand SVGs
- ปกติ component เป็น Server Component ยกเว้น `<NavBar />` และ carousel ที่มี state → `"use client"`

### Carousels
- `<ServiceCarousel />` ที่ [components/ui/service-carousel.tsx](components/ui/service-carousel.tsx) รองรับ **3 variants** ผ่าน prop:
  1. `items?: ServiceItem[]` → rate cards (route + price + type + note + badges)
  2. `imageItems?: ImageCardItem[]` → red bg + heart icon + bottom badges
  3. `blogItems?: BlogCardItem[]` → full red bg + title overlay
  4. ไม่ส่งอะไร → placeholder 6 ใบเปล่า

## Folder Structure

```
app/[locale]/
├─ (public)/                  # ไม่ต้อง login
│  └─ page.tsx                # home
├─ (auth)/                    # auto-redirect → / ถ้า login แล้ว
│  ├─ layout.tsx              # requireGuest()
│  ├─ login/page.tsx
│  └─ register/page.tsx
├─ (protected)/               # auto-redirect → /login ถ้าไม่ login, → /complete-profile ถ้า incomplete
│  ├─ layout.tsx              # requireAuth()
│  ├─ dashboard/page.tsx
│  └─ orders/                 # demo: pattern reference
│     ├─ page.tsx             # list
│     └─ new/page.tsx         # create form
├─ complete-profile/page.tsx  # auth required, allows incomplete
├─ auth/                      # OAuth callback + signout (no locale prefix)
│  ├─ callback/route.ts
│  └─ signout/route.ts
└─ layout.tsx                 # NextIntl + LocaleHtmlLang

actions/                       # Server Actions
├─ auth.ts                    # signIn, signOut, register*, OAuth
├─ otp.ts                     # requestOtp, verifyOtp (with bypass)
└─ orders.ts                  # demo CRUD

lib/
├─ supabase/{client,server,admin}.ts
├─ auth/{get-user,require-auth}.ts
├─ sms/gateway.ts             # ThaiBulkSMS adapter
├─ utils/phone.ts             # normalizePhone + detectIdentifier
└─ validators/{auth,orders}.ts # Zod schemas

supabase/
├─ schema.sql                 # initial: profiles + documents + otp_codes + RLS + Storage
└─ migrations/0002_orders.sql # demo: orders table
```

## Auth & Backend State (Phase 1-5 ✅ done)

### What works
- **Supabase Auth** — email/phone + password, OAuth Google/Facebook (LINE = mocked)
- **DB** — profiles (auto-gen `PR00001` member_code), documents, otp_codes, orders
- **Storage** — `member-docs/` private bucket, RLS = owner-only
- **OTP** — custom via ThaiBulkSMS, hashed (sha256+pepper), TTL 5min, rate-limited 3/hour
  - **`OTP_BYPASS=true`** in dev → skip SMS + accept any code
- **Sessions** — `proxy.ts` middleware refreshes tokens; cookies set by `@supabase/ssr`
- **Route guards** — `(auth)` redirects logged-in users; `(protected)` redirects guests + incomplete profiles
- **NavBar** — auto-aware: shows login/register buttons OR user menu (avatar + dropdown) based on session

### Pages live
| Route | สถานะ |
|---|---|
| `/` (home) | ✅ UI complete |
| `/login` | ✅ wired (signIn + Google/FB OAuth + LINE mock) |
| `/register` | ✅ wired (Personal + Juristic 3-step + uploads) |
| `/dashboard` | ✅ placeholder (shows profile + member_code + quick links) |
| `/complete-profile` | ✅ placeholder (form to-be-built) |
| `/orders` | ✅ demo (list + create form — pattern reference) |
| `/auth/callback` | ✅ OAuth handler (creates profile if first-time) |
| `/auth/signout` (POST) | ✅ |

### Yet to do
- ❌ OTP UI (UI hidden while `OTP_BYPASS=true`; build when bypass=false)
- ❌ LINE Login channel + Supabase custom OIDC
- ❌ `/complete-profile` actual form (only placeholder right now)
- ❌ `/profile` settings page
- ❌ Tax-ID lookup
- ❌ Tests

## Architecture & Roadmap

📐 **Blueprint:** [docs/architecture.md](docs/architecture.md) — full diagrams, DB schema, auth flows, security model, 5-phase roadmap

### Decisions (all locked)
- Hosting: **Vercel + Supabase Cloud**
- Phone OTP: **ThaiBulkSMS** (custom — bypass via `OTP_BYPASS=true`)
- LINE Login: mocked UI; channel TBD
- member_code: `PR00001` (running, auto-gen via Postgres trigger)
- Email verification: optional (Supabase confirm-email OFF)
- Password: min 6 / max 30, no complexity rules

## Working with this codebase

### Add a section to home
- New component in [components/sections/](components/sections/)
- Import in [app/[locale]/(public)/page.tsx](app/[locale]/(public)/page.tsx)

### Add a new feature/system (pattern)
1. SQL: add table + RLS in `supabase/migrations/NNNN_<name>.sql`
2. Validator: Zod schema in `lib/validators/<name>.ts`
3. Server Action: mutations in `actions/<name>.ts` (`"use server"`)
4. Pages: under `app/[locale]/(protected)/<name>/` (auth-guarded)
5. i18n: add keys in [messages/th.json](messages/th.json) + [messages/en.json](messages/en.json) namespace
6. (optional) Realtime: subscribe via `supabase.channel(...)` in `"use client"` component

→ See [actions/orders.ts](actions/orders.ts) + [app/[locale]/(protected)/orders/](app/[locale]/(protected)/orders/) as a working reference

### Common edits
- Locale string → both `messages/th.json` + `messages/en.json`
- Theme color → `@theme inline` in [app/globals.css](app/globals.css)
- Auth check on a page → `await requireAuth()` from `lib/auth/require-auth.ts`
- Get current user → `await getCurrentUserWithProfile()` from `lib/auth/get-user.ts`
- Mutate Supabase from Server Action → `await createClient()` from `lib/supabase/server.ts`
- Bypass RLS (admin only) → `createAdminClient()` from `lib/supabase/admin.ts`
