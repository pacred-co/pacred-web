# ADR-0011 — ERP RBAC granular roles per module (V3 prep)

**Status:** 🟡 **DRAFT** — เดฟ scaffold 2026-05-16 night. ก๊อต to review + lock. Target = V3 (`pacred-dpx` repo); inform V2's incremental moves but do not refactor V2 mid-flight (per [ADR-0010](0010-v2-v3-version-strategy.md)).
**Date:** 2026-05-16 night
**Phase:** V3 prep · Sprint 7+ Track D (per [ADR-0014](0014-customer-self-service-state-transitions.md) reservation note)
**Owner:** เดฟ (scaffold) · ก๊อต (review + lock) · ภูม (implements when V3 starts)

> **Reservation slot:** ADR-0011 was reserved (per [ADR-0014](0014-customer-self-service-state-transitions.md) note); this lands here. ADR-0012 (ERP shell) + ADR-0013 (V2→V3 migration) follow.

---

## Context

Pacred V2 uses **role-bundle RBAC** per [ADR-0002 admin architecture](0002-admin-architecture.md):

```ts
admins.role ∈ { super, ops, accounting, sales_admin, warehouse, driver }
+ V-H1 adds: interpreter
```

Roles are bundles: `ops` = "can do A + B + C". `is_admin(['super','accounting'])` checks role membership; super implicit-bypasses everything.

**Why this is good for V2 (cargo loop, ~15 admin staff):**
- Simple. 7 roles, 1 column on `admins`. Easy mental model.
- `is_admin([roles])` calls scattered across 130+ action sites — uniform pattern.
- Adding a role = INSERT into admins + ALTER enum. ภูม has shipped 3 new roles (warehouse, driver, interpreter) this way without friction.

**Why it breaks at V3 (full ERP, ~50+ staff per [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md)):**

1. **14 staff roles** in the ops-roles brief (Sales / Marketing / Doc-clear / Carrier-ops / Yard / Pickup / Driver-coord / Accounting / Finance / Admin / HR / IT / Manager / CEO). Cramming 14 enum values means most queries are `is_admin(['sales','marketing','doc-clear','manager'])` — verbose + error-prone.
2. **Per-module permission slicing.** Example: "accounting can read invoices but ONLY their own department's; finance can read ALL but cannot post journal entries." Role-bundle can't express "read same / write different / scope by attribute."
3. **Audit + compliance.** Thai accounting law (per [ADR-0006](0006-tax-invoice-flow.md) + [ADR-0015](0015-withholding-tax-model.md)) requires explicit segregation of duties: the person who creates an invoice can't be the same who approves it. Bundle-RBAC can't enforce this without ad-hoc per-action code.
4. **Per-customer / per-team scoping.** Sales rep should see only their own customers; team lead sees the team's; CEO sees all. Bundle-RBAC has zero attribute scoping built in.
5. **V3 acceptance criterion** (per [ADR-0010](0010-v2-v3-version-strategy.md)): "employees love it, work without owner intervention." Permission self-management requires owner-self-serve granularity.

---

## Options considered

### Option A — Keep role bundles, add more roles (status quo extended)
Just add more enum values: `sales_jr / sales_sr / doc_clear / carrier_ops / yard / pickup_driver / fleet_coord / accounting_jr / accounting_sr / finance / hr / it / manager / ceo`.
- ➕ Trivial migration. Zero new infra.
- ➖ Doesn't solve segregation-of-duties (the same person could be both `accounting_jr` AND `finance` if super grants both).
- ➖ No attribute scoping (sales rep still sees all customers without ad-hoc `eq('owner_rep', adminId)` in every query).
- ➖ Owner must edit migrations to add roles — not self-serve.

### Option B — Per-permission grants (Casbin / Oso / OpenFGA style)
Separate `roles` + `permissions` + `role_permissions` tables. Each action gates on a permission name (`wallet.approve_deposit`, `invoice.issue`, `customer.suspend`). Owner self-manages role↔permission grants via admin UI.
- ➕ Truly granular. Segregation of duties via permission grant.
- ➕ Owner-self-serve role-design via UI.
- ➖ ~3x more code complexity. Every action needs to declare `requirePermission('wallet.approve_deposit')` not `requireRole(['accounting'])`.
- ➖ RLS policies become 2-step (does this role have this permission? then check ownership).
- ➖ Performance: every action = 1 extra DB read (permission check) unless cached.

### Option C — Hybrid (this ADR's proposal) ✅
Keep role enum AS the **default permission bundle** (V2-style fast path) AND introduce **per-role permission grants** (V3 layer on top). Plus **attribute scopes** for owner/team filtering.
- Roles continue to exist (UI calls them "Job titles"). Each role has a DEFAULT permission set.
- Owner can grant/revoke permissions on top of role defaults via `admin_permission_grants` table.
- RLS policies check `has_permission(adminId, 'wallet.approve_deposit', target_id?)` instead of `is_admin([roles])`.
- Attribute scoping via `permission_scopes` — e.g. `customer.view` grant has scope `{own_team_only: true}` → query is augmented with `owner_team_id = adminId.team_id`.
- ➕ V2 → V3 migration safe: enum stays, permission table added incrementally; old `is_admin([roles])` calls continue to work via a defaults-translation layer.
- ➕ Owner can self-serve via admin UI (grants/revokes).
- ➕ Attribute scoping addresses the "see own customers only" case at the RBAC layer (not ad-hoc per query).
- ➖ Hybrid = 2 mental models (role + permission). Mitigation: UI surfaces only "Job title" by default; "Edit permissions" is super-only advanced view.

### Option D — Casbin / Cedar / OpenFGA fully external policy engine
Use a dedicated policy service.
- ➕ Battle-tested for complex scenarios.
- ➖ External service = network hop on every check. Latency + failure mode.
- ➖ Pacred is small ERP; overkill.
- ➖ Pacred staff cannot self-manage from a Casbin DSL.
- ❌ **Rejected.**

---

## Decision

**Adopt Option C — Hybrid (role bundles + per-role permission grants + attribute scopes).**

Migration path (per [ADR-0013 V2→V3 migration](0013-erp-v2-v3-migration-strategy.md), TBD):
1. **V3 phase 1 (parallel run):** add `admin_permissions` + `admin_permission_grants` + `admin_scopes` tables. Backfill from current role enums (each role → its default permission set).
2. **V3 phase 2:** introduce `has_permission()` SQL function that respects grants + scopes; `is_admin([roles])` continues to work via translation (e.g. `is_admin(['accounting'])` ≡ `has_permission(adminId, 'role:accounting')`).
3. **V3 phase 3:** new code paths use `has_permission('wallet.approve_deposit')`. Old `is_admin()` calls slowly migrate per file.
4. **V3 phase 4:** owner admin UI for permission management.

### Permission catalog (sketch — DETAILED CATALOG = part of V3 schema work)

Per-module permissions, name = `<module>.<verb>` (mirror admin_audit_log naming):

```
wallet.approve_deposit         wallet.approve_withdrawal      wallet.adjust_balance
yuan_payment.approve           yuan_payment.bulk_approve
customer.view_all              customer.view_team             customer.view_own
customer.suspend               customer.approve_signup        customer.convert_juristic
forwarder.view_all             forwarder.view_team            forwarder.view_own
forwarder.status_transition    forwarder.assign_driver        forwarder.cancel
service_order.status_transition  service_order.issue_receipt
tax_invoice.issue              tax_invoice.cancel             tax_invoice.credit_note
freight_quote.create           freight_quote.approve          freight_quote.send
freight_invoice.issue          freight_invoice.cancel         freight_invoice.payment_record
commission.approve             commission.mark_paid
container.create               container.set_status           container.attach_shipment
qa_inspection.record           qa_inspection.waive
accounting_period.close        accounting_period.reopen
broadcast.send_all             broadcast.send_specific
hs_code.write                  rates.write                    settings.write
admin.grant_role               admin.grant_permission         admin.suspend
audit_log.read                 audit_log.export
```

~50 permissions total expected at V3 launch. Grouped by module = ~12 modules.

### Attribute scopes (sketch)

```sql
create table admin_permission_grants (
  admin_id uuid references profiles(id),
  permission text references admin_permissions(name),
  scope_kind text check (scope_kind in ('global','team','own','department')),
  scope_value jsonb,   -- e.g. {"team_id": "uuid"} or {"department": "accounting"}
  granted_by uuid references profiles(id),
  granted_at timestamptz default now(),
  expires_at timestamptz nullable,
  primary key (admin_id, permission)
);
```

Scope examples:
- `customer.view` with `scope_kind='team'` → sees only customers where `owner_rep_id IN (select id from admins where team_id = admin.team_id)`
- `accounting_period.close` with `scope_kind='global'` → can close any period (finance + super)
- `qa_inspection.record` with `scope_kind='department', value={"department":"warehouse"}` → only warehouse staff

### Default role → permission bundles (V3 phase 1 backfill)

| Role | Permission bundle (default) |
|---|---|
| super | ALL permissions, scope=global |
| accounting | wallet.* + yuan_payment.* + tax_invoice.* + accounting_period.close + freight_invoice.* (scope=global) |
| sales_admin | customer.view_team + customer.view_own + freight_quote.* (scope=own) + commission.* (own) |
| ops | forwarder.* + container.* + service_order.status_transition + customer.view_all (scope=global) |
| warehouse | qa_inspection.* + container.set_status + container.attach_shipment (scope=department=warehouse) |
| driver | forwarder.view_assigned (scope=own_assignment) |
| interpreter | commission.view_own + forwarder.view_assigned (scope=own_assignment) |

---

## Consequences

**Positive**
- Owner can self-serve role + permission editing (V3 admin UI).
- Segregation of duties enforceable: super grants `tax_invoice.issue` to A and `tax_invoice.cancel` to B; A cannot cancel her own invoices.
- Attribute scopes solve "see own / see team / see all" without ad-hoc query rewrites.
- Migration from V2 is gradual + non-breaking; existing `is_admin([roles])` calls keep working.
- Per-permission audit becomes possible (record which permission was checked per action — Sentry-grade visibility).

**Negative**
- 2 mental models (role + permission). Mitigated by UI surfacing only roles by default.
- ~50 permission strings to maintain (catalog drift risk — solve via TypeScript const enum + DB seed sync test).
- Slightly more DB reads per action (~5ms each, cacheable via session-level memo).

**Neutral**
- `is_admin([roles])` continues to work in V2 + early V3 — no big-bang refactor.

---

## V1 scope (the actual schema for V3 phase 1)

Migration `pacred-dpx/migrations/0001_rbac_granular.sql` (in the V3 repo, not V2):

```sql
create table admin_permissions (
  name text primary key,
  module text not null,
  description text,
  display_order int default 0,
  created_at timestamptz default now()
);

create table admin_role_default_permissions (
  role text not null,
  permission text references admin_permissions(name) on delete cascade,
  scope_kind text check (scope_kind in ('global','team','own','department')) default 'global',
  scope_value jsonb,
  primary key (role, permission)
);

create table admin_permission_grants (
  admin_id uuid references profiles(id) on delete cascade,
  permission text references admin_permissions(name) on delete cascade,
  scope_kind text check (scope_kind in ('global','team','own','department')) default 'global',
  scope_value jsonb,
  granted_by uuid references profiles(id),
  granted_at timestamptz default now(),
  expires_at timestamptz nullable,
  notes text,
  primary key (admin_id, permission)
);

create or replace function public.has_permission(
  p_admin_id uuid,
  p_permission text,
  p_target_attrs jsonb default null
) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  -- 1. Check explicit grants first (override role defaults)
  -- 2. Fall back to role defaults via admin_role_default_permissions
  -- 3. Check scope against p_target_attrs
  -- ... (full body part of V3 schema work)
begin
  -- placeholder
  return false;
end;
$$;
```

---

## Open questions for ก๊อต (lock these)

1. **Permission catalog finalize** — the ~50 strings sketched above; any missing? Confirm naming convention `<module>.<verb>` (vs e.g. `<verb>:<module>` or hierarchical `wallet.deposit.approve`).
2. **Scope kinds** — confirm 4 (`global` / `team` / `own` / `department`) are sufficient. Or add `customer_id`-bound for white-label scenarios?
3. **Grant expiration** — should `admin_permission_grants.expires_at` be enforced (cron auto-revokes) or just informational?
4. **UI design** — should permissions UI show role defaults + override grants separately, or merged? Recommend: merged view with "(inherited from role)" / "(explicit grant)" tag per row.
5. **V2 cutover** — when V2 ships its last feature, what's the trigger to start V3 phase 1? Recommend: V2 cargo + freight loops both have >=1 year of production data (so we know real access patterns before redesigning).

---

## Cross-references

- V2 RBAC baseline → [ADR-0002](0002-admin-architecture.md)
- V2 vs V3 strategy → [ADR-0010](0010-v2-v3-version-strategy.md)
- Future ADR-0012 (ERP frontend shell) — sibling
- Future ADR-0013 (V2→V3 migration) — sibling
- Ops roles inventory → [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md) (14 staff workspaces)
- DPX ERP phase 2 → [ADR-0008](0008-dpx-erp-phase-2.md) + schema sketch [ADR-0009](0009-erp-schema-sketch.md)
- Existing `is_admin()` function → `supabase/migrations/0015_admin_rbac.sql`

**End of ADR-0011 (DRAFT).** ก๊อต: review, answer 5 open Qs, flip Status → Accepted (or push back). ภูม: DO NOT implement until V3 starts; this is V3 territory per ADR-0010.
