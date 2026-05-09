@AGENTS.md

# Project Snapshot — pacred-web

Last updated: 2026-05-09

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

## Current State

### หน้าที่เสร็จแล้ว (UI complete)

**1. Home** — [app/[locale]/page.tsx](app/[locale]/page.tsx)
- NavBar (logo, nav links, login/register buttons, locale switcher with flags, theme toggle)
- SearchBar
- HeroSection (banner + 3 stat cards พร้อม icon + เลขสีแดง #B30000)
- Promotion (heading, 4 coupon cards, 2 carousels, 5 country link cards)
- Service (20 containers: 20 product categories grid, banners, rate carousels (LCL/FCL/FF), feature cards, about 2-column text)
- Sales (sales staff marquee — 60s cycle)
- Blog (1 hero + 3 small video cards 70/30 layout, 2 article carousels, 25 tag link cards)
- Partner (logo marquee, 24 logos)
- Footer
- FloatingTabs (vertical menu + LINE chat button)

**2. Login** — [app/[locale]/login/page.tsx](app/[locale]/login/page.tsx)
- Logo + title + email/phone/member-code field + password + forgot link + submit
- Divider + 3 social buttons (Google/LINE/Facebook with brand SVG icons)
- Link → /register
- ✅ UI พร้อม | ❌ ยังไม่ต่อ backend

**3. Register** — [app/[locale]/register/page.tsx](app/[locale]/register/page.tsx)
- Logo + title + login link
- 2 tabs: **Personal** (single form) / **Juristic** (3-step wizard)
- Personal: name, surname, phone, password, service chips (multi-select 6 อัน), how-know select, email, agree
- Juristic Step 1: phone, password, services, how-know
- Juristic Step 2: tax ID, company name, address (4 fields)
- Juristic Step 3: 3 file uploads + agree
- Step indicator with active/done states
- Divider + 3 social buttons
- ✅ UI พร้อม | ❌ ยังไม่ต่อ backend

### ยังไม่ทำ
- ❌ Backend / API routes / Server Actions
- ❌ Database (จะใช้ Supabase Postgres + RLS)
- ❌ Authentication (Supabase Auth)
- ❌ File storage (Supabase Storage)
- ❌ Protected routes (`/dashboard`, `/profile`, etc.)
- ❌ OTP via 3rd-party SMS gateway
- ❌ OAuth (Google/LINE/Facebook) integration
- ❌ Tax-ID lookup API (future)
- ❌ Tests

## Architecture & Roadmap

📐 **Blueprint อยู่ที่ [docs/architecture.md](docs/architecture.md)** — มี:
- High-level architecture (Vercel + Supabase + 3rd-party services)
- DB schema (ER diagram) + RLS policies
- 6 auth flows (sign up personal/juristic, sign in, OAuth, sign out, session refresh) — sequence diagrams
- OTP flow detail (3rd-party SMS, ไม่ใช้ Supabase phone auth)
- Security model (3 Supabase clients, env vars, rate limiting)
- Future systems pattern
- 5-phase implementation roadmap

### ตัดสินใจแล้ว
- Hosting: **Vercel + Supabase Cloud**
- Phone OTP: **3rd-party SMS gateway** (custom logic, ไม่ใช้ Twilio ของ Supabase)
- LINE Login: ใช้ผ่าน Supabase OIDC + LINE Official Account
- Tax-ID lookup: **future** (manual ก่อน)
- Implementation: ทำตาม **5 phases** เรียง 1→5

### ที่ยังต้องตัดสินใจก่อน Phase 1
- SMS gateway provider (ThaiBulkSMS / Twilio / 1moby ฯลฯ)
- LINE Login channel มีไว้แล้วหรือยัง
- member_code format (PC001 running หรือ random)
- Email verification บังคับหรือ optional
- Password policy ขั้นต่ำ

## Working with this codebase

- เพิ่ม section ใหม่ใน home: สร้าง [components/sections/](components/sections/) ใหม่ + import ใน [app/[locale]/page.tsx](app/[locale]/page.tsx)
- เพิ่ม locale string: แก้ทั้ง [messages/th.json](messages/th.json) + [messages/en.json](messages/en.json) พร้อมกัน
- เพิ่ม theme color: แก้ที่ `@theme inline` ใน [app/globals.css](app/globals.css)
- ทำ feature ใหม่ที่ใช้ auth/db: ทำตาม pattern ใน [docs/architecture.md](docs/architecture.md) Section 9 (Future Systems Pattern)
