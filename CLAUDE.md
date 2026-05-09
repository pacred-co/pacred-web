@AGENTS.md

# Project Snapshot — pacred-web

Last updated: 2026-05-09

## Stack
- Next.js 16.2.6 (App Router) — **โปรดอ่าน AGENTS.md: เวอร์ชันนี้มี breaking changes จาก training data**
- React 19.2.4
- TypeScript 5 (strict)
- Tailwind CSS v4 (`@theme inline` ใน app/globals.css — ไม่มี tailwind.config.js)
- ESLint 9 (flat config, eslint-config-next)
- Package manager: pnpm

## Scripts
- `pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`

## Conventions
- Path alias: `@/*` → `./*`
- App Router ที่ `app/` — ยังไม่มี `src/`, components, API routes, หรือ tests
- Font: Geist + Geist Mono ผ่าน `next/font/google`

## Current state
ยังเป็น **create-next-app boilerplate** ทั้งหมด:
- `app/page.tsx` — หน้า template "To get started, edit the page.tsx file."
- `app/layout.tsx` — root layout ตั้ง font + globals.css
- `next.config.ts` — ว่างเปล่า
- ยังไม่มี feature ใดๆ ของ project จริง
