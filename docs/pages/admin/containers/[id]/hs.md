# `/admin/containers/[id]/hs`

**HS lines ของตู้**

> **Auth:** 🛡 Admin — roles: any admin role · ⚠️ Phase-2+ (super-only at edge)
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/containers/[id]/hs/page.tsx`

## Request data (params)

- **route param** `id`

## Database tables

- [`container_hs_lines`](../../../../database/native/container_hs_lines.md)
- [`containers`](../../../../database/native/containers.md)
- [`hs_codes`](../../../../database/native/hs_codes.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/admin/hs-codes`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/supabase/admin`

## Exports / functions

- `ContainerHsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../../../README.md).</sub>
