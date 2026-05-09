# Pacred Web

> เว็บไซต์ทางการของ **Pacred** — บริการนำเข้า–ส่งออก, ชิปปิ้งเคลียร์ศุลกากร, ฝากสั่งซื้อสินค้าจากจีน, และโลจิสติกส์ครบวงจร

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

### 1. Install
```bash
pnpm install
```

### 2. Run dev server
```bash
pnpm dev
```
เปิด [http://localhost:3000](http://localhost:3000) — locale default `th`, อังกฤษที่ `/en`

### 3. Build / Start production
```bash
pnpm build
pnpm start
```

### Scripts
| Command | Description |
|---|---|
| `pnpm dev` | start dev server |
| `pnpm build` | production build |
| `pnpm start` | start production server |
| `pnpm lint` | run ESLint |

---

## Folder Structure

```
pacred-web/
├─ app/[locale]/          # App Router (locale-prefixed routes)
│  ├─ page.tsx            # หน้าแรก (home)
│  ├─ login/              # หน้าเข้าสู่ระบบ
│  ├─ register/           # หน้าสมัครสมาชิก (Personal + Juristic 3-step)
│  └─ layout.tsx          # locale layout (next-intl provider)
│
├─ components/
│  ├─ sections/           # section-level (navbar, hero, service, blog, footer, ...)
│  ├─ ui/                 # reusable UI (button, carousel, ...)
│  └─ icons/              # brand SVG icons (Google/LINE/Facebook)
│
├─ messages/              # i18n translations
│  ├─ th.json
│  └─ en.json
│
├─ i18n/                  # next-intl config
│  ├─ routing.ts          # locales + defaultLocale
│  ├─ navigation.ts       # localized Link
│  └─ request.ts
│
├─ public/images/         # logos, banners, partner logos, hero icons
├─ docs/
│  └─ architecture.md     # 📐 blueprint สำหรับระบบ auth + backend
├─ proxy.ts               # middleware (next-intl routing)
├─ next.config.ts
└─ AGENTS.md              # คำเตือนสำหรับ AI agents
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
| `/` (home) | ✅ UI complete | hero + promotion + service + blog + partner + sales + footer + floating tabs |
| `/login` | ✅ UI complete | ❌ ยังไม่ต่อ backend |
| `/register` | ✅ UI complete | ❌ ยังไม่ต่อ backend (Personal + Juristic 3-step) |
| `/dashboard` | ⏳ planned (Phase 4) | |

---

## Roadmap

ระบบ **auth + backend** ใช้ **Supabase + Next.js Server Actions** (ไม่มี backend service แยก)

📐 **อ่าน blueprint ก่อน implement:** [`docs/architecture.md`](docs/architecture.md)

ครอบคลุม:
- High-level architecture diagram
- DB schema + RLS
- 6 auth flows (sequence diagrams)
- OTP flow ผ่าน 3rd-party SMS
- Security model
- Future systems pattern
- 5-phase implementation roadmap

### ตัดสินใจแล้ว
- **Hosting:** Vercel + Supabase Cloud
- **Phone OTP:** 3rd-party SMS gateway (custom logic)
- **OAuth:** Google + Facebook + LINE Login
- **Tax-ID lookup:** future (manual ก่อน)

---

## Conventions

- **Component:** Server Component เป็น default; ใช้ `"use client"` เฉพาะเมื่อต้องการ state/effect/event handler
- **Carousels:** `<ServiceCarousel />` รับ 3 variants (`items` / `imageItems` / `blogItems`) ดู [`components/ui/service-carousel.tsx`](components/ui/service-carousel.tsx)
- **Path alias:** `@/*` → `./*`
- **Icons:** ใช้ `lucide-react` ทั้งโปรเจกต์ (outline-style); brand icons (Google/LINE/FB) อยู่ที่ `components/icons/social-icons.tsx`
- **i18n keys:** ตั้งชื่อตาม namespace ของ section/page (`nav.*`, `service.*`, `login.*`, `register.*`, ...)

---

## Deployment

วางแผนใช้ **Vercel** สำหรับ frontend + Server Actions และ **Supabase Cloud** สำหรับ auth/db/storage

- Push ไป main → Vercel preview/production deploy อัตโนมัติ
- Env vars (production): ตั้งใน Vercel dashboard

ดูรายละเอียด env vars ที่ [`docs/architecture.md`](docs/architecture.md) Section 8

---

## Contributing

1. สร้าง branch: `git checkout -b feature/...`
2. แก้โค้ด — ทุก mutation ผ่าน Server Action; ทุก data access ผ่าน Supabase client (3 ตัวใน `lib/supabase/`)
3. เพิ่ม locale string ทั้ง th + en
4. `pnpm lint` ก่อน commit
5. PR + รอ review

---

## License

Private © Pacred. All rights reserved.
