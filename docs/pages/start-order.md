# `/start-order`

**จุดเริ่มสั่งซื้อ (buy-bridge)**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(public)` · **Source:** `app/[locale]/(public)/start-order/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

_None directly (page may be presentational or fetch via a child component)._

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

_None._

## 3rd-party / services

_None detected._

## Environment variables

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

## Lib modules

- `lib/supabase/server`

## Exports / functions

- `StartOrderPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
