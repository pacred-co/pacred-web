# `/admin/contact-messages`

**ข้อความติดต่อจากหน้าเว็บ**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/contact-messages/page.tsx`

## Request data (params)

- reads **`searchParams`** (query string)

## Database tables

- [`contact_messages`](../../database/native/contact_messages.md)
- [`work_items`](../../database/native/work_items.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/contact-messages`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/supabase/admin`

## Exports / functions

- `AdminContactMessagesPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
