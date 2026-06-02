# `/shipments/[code]`

**ติดตามพัสดุตามรหัส**

> **Auth:** 🔒 Authenticated customers (`requireAuth()`)
> **Group:** `(protected)` · **Source:** `app/[locale]/(protected)/shipments/[code]/page.tsx`

## Request data (params)

- **route param** `code`

## Database tables

_None directly (page may be presentational or fetch via a child component)._

## Components

_No `@/components/*` imports (inline JSX or co-located only)._

## Server Actions / internal APIs

- action: `actions/shipments`

## 3rd-party / services

_None detected._

## Environment variables

_None referenced (directly or via imported actions/lib)._

## Lib modules

- `lib/utils/relative-time`
- `lib/warehouse/cargo-type`

## Exports / functions

- `ShipmentDetailPage`

---

<sub>Auto-derived from code (page + co-located + 1-level action/lib transitive) on 2026-06-02. DB/env include those reached through imported server actions. See [pages index](../README.md).</sub>
