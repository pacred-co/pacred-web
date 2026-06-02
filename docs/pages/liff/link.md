# `/liff/link`

**LINE LIFF — เชื่อมบัญชี LINE กับลูกค้า**

> **Auth:** 🔒 Authenticated, allows mid-signup (`requireAuth({allowIncomplete})`)
> **Group:** `(misc)` · **Source:** `app/[locale]/liff/link/page.tsx`

## Database tables

- [`profiles`](../../database/native/profiles.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/line-settings`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_LIFF_ID`

## Lib modules

- `lib/auth/require-auth`

## Exports / functions

- `LiffLinkPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
