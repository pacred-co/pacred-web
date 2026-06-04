# `/admin/organization-channels`

**ช่องทางองค์กร (LINE/WeChat/โทร)**

> **Auth:** 🛡 Admin — roles: any admin role
> **Group:** `(admin)` · **Source:** `app/[locale]/(admin)/admin/organization-channels/page.tsx`

## Database tables

- [`admins`](../../database/native/admins.md)
- [`tb_organization_domainname`](../../database/legacy/tb_organization_domainname.md)
- [`tb_organization_line`](../../database/legacy/tb_organization_line.md)
- [`tb_organization_tell`](../../database/legacy/tb_organization_tell.md)
- [`tb_organization_wechat`](../../database/legacy/tb_organization_wechat.md)

## Components

- `components/ui/pacred-dialog`

## Server Actions / internal APIs

- action: `actions/admin/organization-channels`

## 3rd-party / services

- Supabase (Postgres)

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Lib modules

- `lib/auth/require-admin`
- `lib/supabase/admin`

## Exports / functions

- `OrgChannelsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
