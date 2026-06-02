# `/complete-profile`

**กรอกข้อมูลโปรไฟล์ให้ครบหลังสมัคร (mid-signup)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(misc)` · **Source:** `app/[locale]/complete-profile/page.tsx`

## Database tables

- [`corporate`](../database/native/corporate.md)
- [`profiles`](../database/native/profiles.md)
- [`tb_users`](../database/legacy/tb_users.md)

## Components

- `components/sections/navbar`
- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/profile`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/auth/get-user`

## Exports / functions

- `CompleteProfilePage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
