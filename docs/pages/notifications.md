# `/notifications`

**การแจ้งเตือนของลูกค้า**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/notifications/page.tsx`

## Database tables

- [`notification_reads`](../database/native/notification_reads.md)
- [`notifications`](../database/native/notifications.md)

## Components

- `components/ui/button`

## Server Actions / internal APIs

- action: `actions/notifications`

## 3rd-party / services

- Notifications (LINE/SMS/email)
- Supabase (Postgres)

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/notifications/types`

## Exports / functions

- `NotificationsPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](./README.md).</sub>
