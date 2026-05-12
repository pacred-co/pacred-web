# ADR-0002 — Admin back-office architecture

**Status:** Accepted
**Date:** 2026-05-13
**Phase:** G1
**Owner:** ก๊อต (pending review on `dave` branch)

---

## Context

Legacy PHP system put admin under `pcs-admin/` — a sibling directory to
`member/` sharing the same MySQL DB. Pacred needs an admin back-office
to: approve customer deposits / withdrawals, execute yuan transfers,
update forwarder + service-order statuses, attach tracking numbers,
approve sales payouts, manage rates and customer groups, etc.

Two options for how to ship that admin app:

| Option | Pros | Cons |
|---|---|---|
| **A. Same Next.js app, `/admin/*` route group** | Shared auth, deploy, env, types, components. One CI/CD. Faster iteration. | Admin code ships in customer bundle (mitigated by route-segment code split). RBAC at app layer must be airtight. |
| **B. Separate Next.js app (`admin.pacred.co`)** | Total isolation. Smaller customer bundle. Different design system. | Two repos / monorepo overhead. Auth session sharing requires cross-subdomain Supabase config. Two deploys, two CI/CD pipelines. Type duplication. |

## Decision

**Option A — same Next.js app, gated by `/admin/*` route group + RBAC.**

Why:
- Code reuse is high (forwarders/service_orders/wallet share 90%+ types
  + queries between customer and admin views — only display + write
  permissions differ).
- Pacred team is small; one deploy pipeline is a feature not a bug.
- Route-segment code splitting means admin pages don't bloat customer
  bundles in production.
- Single Supabase project, single set of RLS policies, single set of
  migrations.

## Implementation contract

### 1. Folder layout

```
app/[locale]/
├─ (public)/       — landing
├─ (auth)/         — login/register
├─ (protected)/    — customer portal  (existing — Phases B–F)
└─ (admin)/        — admin back office (Phase G)
   ├─ layout.tsx       — requireAdmin() gate
   ├─ admin/
   │  ├─ page.tsx              — dashboard
   │  ├─ customers/page.tsx
   │  ├─ forwarders/page.tsx
   │  ├─ forwarders/[fNo]/page.tsx
   │  ├─ service-orders/...
   │  ├─ yuan-payments/...
   │  ├─ wallet/transactions/...
   │  ├─ sales/payouts/...
   │  ├─ team-leaders/...
   │  ├─ rates/...
   │  └─ settings/...
```

### 2. RBAC (Phase G2 schema)

```sql
-- One row per (profile, role).
admins (profile_id, role, granted_at, granted_by)

-- Roles are codes: 'super' | 'ops' | 'accounting' | 'sales_admin'.
-- 'super' implies all permissions; others can do specific things.

-- Helper used by RLS policies that need admin-elevated access.
create function is_admin(any_role text[] default null)
  returns boolean
  security definer
  language plpgsql
  set search_path = public
as $$
declare ok boolean;
begin
  select exists (
    select 1 from public.admins
     where profile_id = auth.uid()
       and (any_role is null or role = any(any_role) or role = 'super')
  ) into ok;
  return coalesce(ok, false);
end;
$$;
```

`is_admin()` is `SECURITY DEFINER` so RLS policies can call it without
triggering recursive policy checks on the `admins` table itself.

### 3. App-layer gate

`app/[locale]/(admin)/layout.tsx` calls `requireAdmin()`:
- Redirects to `/login` if not signed in
- Returns 404 if signed in but not an admin
- Returns the user + role(s) for layout decisions

`requireAdmin(roles?: string[])` — variadic — pages that need specific
role can guard further: `await requireAdmin(["accounting"])`.

### 4. RLS strategy for admin writes

Each customer-side table that needs admin mutations gets an
additional set of policies guarded by `is_admin()`. Example for
`forwarders`:

```sql
-- Customer can update only own pending_payment rows (existing)
-- Admin can update ANY row (Phase G addition)
create policy "forwarders_admin_all" on public.forwarders
  for all
  using (public.is_admin())
  with check (public.is_admin());
```

This dual-policy approach keeps existing customer policies untouched
and adds admin overrides as a separate concern. RLS evaluates `using`
clauses with OR across all policies of the same action — so a customer
sees own rows OR an admin sees all rows.

### 5. Audit trail

Every status-changing admin write goes through actions that record
`admin_id` + `admin_id_update` on the target row + an optional admin
audit log (Phase G later).

## Out of scope for Phase G initial

- Admin RBAC fine-grained permissions (start with role-only)
- Org-chart / HR features (`tas_*` tables, `tb_organization_*`)
- Container tracking ops (admin warehouse staff)
- Cron job dashboards (sheet sync / carrier API sync)
- mPDF receipts → @react-pdf/renderer (Phase H — needs designer input)
- Cross-DB `notify.php` writes to WP (already dropped per CLAUDE.md #16)

Phase G initial covers **daily ops** for the launch-day team:
- Approve deposits + execute withdrawals
- Execute yuan transfers
- Update forwarder + service_order status
- Approve sales payouts
- View customer list
- Manage team_leaders + rates (basic CRUD)

## References

- Legacy admin: `D:\xampp\htdocs\pcscargo\member\pcs-admin\` (~187 files)
- [CLAUDE.md § Admin-side feature map](../../CLAUDE.md)
- [CLAUDE.md § Critical migration concerns](../../CLAUDE.md) — #5 (FK), #15 (RBAC redesign), #16 (drop cross-DB write)
