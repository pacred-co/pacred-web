# 🔐 Pacred role + workspace system — analysis & unified build design (2026-06-30)

> Owner: *"role and workspaces ต้องเริ่มทำได้แล้ว"* (we must be able to start building roles + workspaces now).
> **Headline finding: the unified model the owner wants is already ~80% built** — the
> 3-axis `money-tier × department × position→workspace` model landed in migrations
> **0220 + 0221** (ปอน · 2026-06-27/28) and is wired end-to-end through `menuForStaffer`.
> The remaining work is **completion + wiring + the freight 8-role positions + a per-position
> queue landing page**, NOT a from-scratch rewrite. This doc reconciles the 3 role models in
> play and gives a concrete, incremental build plan.

---

## 1. The CURRENT role system — what exists in code today

### 1a. `admins.role` — the CHECK constraint (the only enforced enum)

`admins` is one row per `(profile_id, role)` GRANT (a person can hold several; the
list dedupes to one effective role per person). The CHECK constraint has been
expanded across migrations and **currently allows 26 values** (mig 0220):

| Origin mig | Values added |
|---|---|
| 0015 | `super` `ops` `accounting` `sales_admin` |
| 0033 | `warehouse` `driver` |
| 0054 | `interpreter` |
| 0091 | `sales` `qa` + 13 `freight_*` roles (#16–28) |
| 0118 / 0123 | `manager` |
| 0158 | `pricing` |
| **0193** | **`ultra`** ("Ultra Admin Z" — the true god role) |
| **0220** | **`normies`** + migrate every active `super` → `normies` |

### 1b. The 2026-06-27 PIVOT — role became a VISIBILITY TIER, not a function

This is the load-bearing recent change (owner ปอน, mig 0220). **`admins.role` is no
longer "what job you do" — it is "how much money you can see".** Only THREE roles are
assignable from the UI (`ASSIGNABLE_ROLES = [ultra, super, normies]`):

| Tier (role) | ต้นทุน (cost) | กำไร (profit) | ยอดขาย (sales) | Navigation |
|---|---|---|---|---|
| **ultra** | ✅ | ✅ | ✅ | god-nav (full CEO menu) |
| **super** | ❌ | ✅ | ✅ | god-nav (full CEO menu) |
| **normies** | ❌ | ❌ | ✅ | god-nav (full CEO menu) |

- Enforced by `lib/admin/money-visibility.ts`: `canViewCost` ∈ {ultra, accounting, pricing};
  `canViewProfit` ∈ {ultra, super, accounting, pricing}. (accounting/pricing kept for existing
  holders; the picker no longer assigns them.)
- All 3 are **god-nav**: `isGodRole(roles)` (`lib/admin/god-role.ts`) returns true for
  ultra/super/normies → they bypass every Phase gate + every `requireAdmin([...])` action gate.
- The other 23 function roles (manager/ops/accounting/sales/.../freight_*) **still exist as
  valid CHECK values** so the ~250 operational `requireAdmin([...])` gates compile and the
  god-nav bypass covers them — but they are **RETIRED from the role picker**. Owner: *"ลบ role
  ไปเลย แก้เป็นสิทธิ์การมองเห็นแทน · เดี๋ยว role ทำเพิ่มมาอีกอัน"*.

### 1c. How the gates work today (3 layers)

1. **`requireAdmin(requiredRoles?)`** (`lib/auth/require-admin.ts`) — admin-vs-non-admin gate.
   Not signed in → `/login`; admin without a required role → `notFound()`. `isGodRole` satisfies
   any required-role check. This is the per-action / per-layout gate (~250 call sites).
2. **Phase gate** (`lib/admin/phase-access.ts` · `canAccessRoute`) — defense-in-depth for direct
   URL access. `PHASE_2_PLUS_ROUTES` lists Phase 2/3/4 prefixes; non-god roles are blocked from
   them. ultra/super/normies always pass.
3. **Status-transition gate** (`lib/auth/check-fstatus-transition.ts` · `canAnyRoleFlipFstatus`)
   — the per-(from→to) matrix for `tb_forwarder.fstatus`. **This is already the "allowed
   status-transitions per role" half of a workspace** (warehouse owns 1→4, accounting owns 4→5/5→6,
   driver owns 6→7, super/manager override everything). Money-safe, per-row, locked with tests.

### 1d. Navigation per role (`lib/admin/sidebar-menu.ts`)

Legacy PCS didn't filter one flat array — it `require_once`'d ONE purpose-built menu file per
`company/department/section`. Pacred reproduces this: it defines OOP menu BLOCKS once, then
hand-assembles a menu per role in `ROLE_MENUS: Record<AdminRole, MenuSection[]>`. Selection:
- `menuForRoles(roles)` — legacy single-pick: god → full menu; else highest-precedence role's menu
  (`ROLE_PRECEDENCE`).
- `menuForRolesUnion(roles)` — Pacred escape-hatch for multi-hat staffers (dedup'd union).
- **`menuForStaffer(roles, workspaceRole)`** — the NEW position-aware selector (see §3).

---

## 2. The THREE role models in play — and the reconciliation

There are three role taxonomies floating in the repo/docs. They look contradictory but
**reconcile cleanly onto the 3-axis model** (which is the right answer).

### Model A — Current RBAC (code, authoritative for ENFORCEMENT)
- 26 CHECK values; 3 assignable visibility tiers (ultra/super/normies); 23 function roles
  retired-but-valid. (§1.)

### Model B — The 14 ops-role workspaces (`docs/briefs/ops-roles.md`, 2026-05-16)
Marketing · Sales · Pricing · Planning · CS · Docs · Acc-AR · Acc-AP · HR · Messenger · Warehouse
· Driver · Sub-driver · (+ Developer/meta). This is a **JOB/WORKSPACE catalogue** — "what each
seat does + which pages it needs". Its own header now says it predates the CEO department chart
and the RBAC remap is **pending**.

### Model C — The freight 8-role workflow (`accounting-3account-freight-workflow-2026-06-30.md` §3)
Sales · Pricing · Document/CS · Operation/Transport · Accounting · Manager · CEO/Admin · Customer.
Each role has: an ordered **status list** (its allowed transitions) + an allowed action set
("❌ แก้ราคาหลังอนุมัติ"). This is the **per-workspace queue + status-transition** spec — exactly
the missing dimension that turns a "menu" into a "workspace".

### The reconciliation — ONE unified model (3 independent axes per staffer)

The repo already chose this (mig 0221 comment). Every staffer has **three independent axes**:

```
┌─────────────┬───────────────────────────────────┬──────────────────────────────────────────┐
│ AXIS        │ stored in                         │ controls                                   │
├─────────────┼───────────────────────────────────┼──────────────────────────────────────────┤
│ money tier  │ admins.role ∈ {ultra,super,normies}│ cost/profit VISIBILITY (canViewCost/Profit)│
│ department  │ admin_contact_extras.department    │ grouping (6 depts · departments.ts)        │
│             │   (1 of 6 · DEPARTMENT_KEYS)       │                                            │
│ position    │ admin_contact_extras.position_id   │ WORKSPACE: which menu/pages/queue + which   │
│  ↓          │   → admin_positions.workspace_role │   status-transitions (the real "job")      │
│ workspace   │   (an AdminRole menu key)          │                                            │
└─────────────┴───────────────────────────────────┴──────────────────────────────────────────┘
```

- **Model B's 14 roles → POSITIONS** (rows in `admin_positions`, CRUD-able).
- **Model C's 8 freight roles → POSITIONS too** (same table), each mapping to a `freight_*`
  workspace_role (the menu) + reusing the status-transition matrix for its queue.
- **Model A's function roles (warehouse/accounting/sales/freight_*) → workspace_role TEMPLATES**
  (the `ROLE_MENUS` keys a position points at). They live on as MENU TEMPLATES + ACTION-GATE
  keys, even though they're no longer assigned as `admins.role`.

So: **`admins.role` = money lens. `position` = the job. `workspace_role` = the menu/action
template the position reuses.** Model B = the position catalogue; Model C = the per-position
queue+transition spec. Nothing has to be thrown away.

---

## 3. The "workspace" concept — what's built vs. what it should be

A **workspace** = the focused view one position lives in all day. It has 4 parts:

| Part | What it is | Status today |
|---|---|---|
| **(a) Menu** | the position's sidebar tree (its surfaces) | ✅ BUILT — `ROLE_MENUS` + `menuForStaffer(roles, workspaceRole)` resolves position→menu; wired in `admin-sidebar.tsx:529` |
| **(b) Allowed status-transitions** | the from→to flips the role owns | ✅ BUILT for cargo `fstatus` (`canAnyRoleFlipFstatus`); 🟡 freight status model not yet role-gated |
| **(c) Queue / landing** | "my work right now" — the rows in MY stage awaiting MY action | 🟡 PARTIAL — freight ops cockpit (`/admin/freight/operations` Kanban) + QA queues + `/admin/board/inbox` exist, but there's no per-position **default landing** that drops a staffer straight into their queue |
| **(d) Action set** | what the position may DO (gated mutations) | ✅ BUILT — `requireAdmin([...])` per action; the 23 function-role keys still gate ~250 actions |

**How a workspace resolves today (the wiring that already works):**
```
admin_contact_extras.position_id
  → admin_positions.workspace_role          (getStafferWorkspaceRole / getStafferPositionInfo)
    → ROLE_MENUS[workspace_role]            (the menu)
      → menuForStaffer(roles, workspaceRole) renders the position-scoped sidebar
```
Plus the sidebar header shows "แผนก / ตำแหน่ง" (department / position name) from
`getStafferPositionInfo`. **ultra/super always get the full CEO menu (oversight); a staffer
with a position gets ONLY that position's workspace; no position = falls back to role menu
(normies → full menu, back-compat).**

`admin_positions` (mig 0221) is already CRUD-able ("สร้างได้ เพิ่มได้") and **seeded with 12
positions** mapping the owner's examples to the closest legacy `workspace_role`:

| Position (ตำแหน่ง) | department | workspace_role (menu template) |
|---|---|---|
| ผู้บริหาร | executive | super |
| เซลล์ (Sales) | biz_cs | sales |
| CS / บริการลูกค้า | biz_cs | sales_admin |
| Pricing / ตั้งราคา | biz_cs | pricing |
| การตลาด (Marketing) | marketing | sales_admin |
| โกดัง (Warehouse) | logistics | warehouse |
| คนขับรถ (Driver) | logistics | driver |
| เอกสาร / Document | logistics | freight_import_doc |
| ทรัพยากรบุคคล (HR) | hr | super |
| บัญชี (Accounting) | finance | accounting |
| การเงิน (Finance) | finance | accounting |
| ผู้พัฒนาระบบ/Developer | it | super |

---

## 4. The GAP — what's missing for "เริ่มทำได้แล้ว"

Despite the strong foundation, six gaps stand between "model exists" and "owner can operate it".

**G1 — No per-position QUEUE landing (the #1 missing piece of "workspace").**
A workspace today scopes the MENU but every position still lands on the generic `/admin`
dashboard. Model C is explicit that each role = an ordered status list = a queue. There is no
`workspaceLanding(position)` → "the X rows in MY stage awaiting MY action". The pieces exist
(freight ops cockpit, QA queues, inbox, the fstatus badges) but aren't assembled into a
per-position home.

**G2 — Most `ROLE_MENUS` workspace templates are placeholders for the new positions.**
`menuSales == menuSalesBase` (CS+Sales share one base — "Cs กับ เซลล์ประมาณนี้"). The 13
`freight_*` menus are STUBS ("[Full Export Operations Access]" placeholders — `menuForStaffer`
will render thin/empty trees). Marketing/HR/IT positions fall back to `super` or `sales_admin`
(too broad). The freight 8-role workflow (Model C) has NO dedicated menus yet.

**G3 — The freight 8-role workflow (Model C) isn't modelled as positions/transitions.**
Sales/Pricing/Document-CS/Operation/Accounting/Manager are real seats with ordered freight
status lists + action bans ("❌ แก้ราคาหลังอนุมัติ"). The cargo `fstatus` matrix exists but
there's no equivalent freight status-transition matrix gated per workspace_role.

**G4 — `position_id` is optional + barely populated.**
The column is nullable; the create-admin form picks it as a dropdown but most existing staff
have none → they fall back to the role menu (and most are now `normies` → full menu). So the
scoping mostly isn't ACTIVE yet. No backfill assigns positions to current staff.

**G5 — Departments have no workspace surface of their own.**
6 departments exist for grouping but there's no "my department's board" (e.g. a logistics
manager seeing warehouse+driver+doc queues). The CEO org chart (Model B header note) calls for
a department→position→workspace remap that hasn't been done.

**G6 — Position-scoping has a money-leak risk to verify.**
`menuForStaffer` scopes the MENU by position but money visibility is STILL keyed on
`admins.role` (the tier), independent of position. A `super`-tier person assigned a "Warehouse"
position correctly sees the warehouse menu but still sees PROFIT everywhere (tier wins). That's
by design (tier = money, position = job) but must be confirmed intentional — a warehouse seat
probably shouldn't be `super` tier. Needs a "position implies a default/max tier" guardrail or
at least an HR convention.

---

## 5. The build design — concrete + incremental (extend, don't rewrite)

Keep all three existing pieces (`admins.role` tier · `departments` · `admin_positions`).
Build in this order; each step ships independently.

### Step 1 (foundation already done — just FINISH wiring) — make position-scoping REAL
- **Backfill `position_id`** for every active staffer (one-shot script · dry-run→apply per AGENTS
  §11). Map each current person to one of the 12 seeded positions by their real job. This turns
  the scoping ON for real staff (closes G4).
- **No schema change.** Confirm `menuForStaffer` is the live selector in `admin-sidebar.tsx`
  (it is, line 529) and that `getStafferPositionInfo` powers the header.
- **Add the G6 guardrail**: in the create/edit-admin form, when a position's department ≠
  executive/finance, default the money tier to `normies` (warning if the operator picks super/ultra
  on a logistics/warehouse seat). Convention-level; no enforcement change.

### Step 2 — the per-position QUEUE landing (closes G1, the real "workspace")
Add a pure SOT `lib/admin/workspace-landing.ts`:
```ts
// workspace_role → { landingHref, queueLabel, badgeKeys }
export const WORKSPACE_LANDING: Record<AdminRole, WorkspaceLanding> = {
  warehouse:  { href: "/admin/forwarders?status=4", label: "ของถึงไทย รอดำเนินการ", badges: [...] },
  accounting: { href: "/admin/forwarders?status=5", label: "รอวางบิล / รอชำระ",     badges: [...] },
  driver:     { href: "/admin/drivers/work",        label: "งานส่งวันนี้",          badges: [...] },
  freight_*:  { href: "/admin/freight/operations?stage=<role>", ... },
  sales/sales_admin: { href: "/admin/board/inbox", ... },
  ...
};
```
- `/admin` reads the staffer's `workspace_role` → redirects (or renders the queue card) for their
  landing. The fstatus matrix already defines WHICH rows are "theirs" (the `from` states the role
  owns) — reuse `TRANSITION_OWNERS` to compute the queue filter, so the queue and the
  allowed-actions stay in sync by construction.
- This is mostly composition of existing surfaces (forwarders filters, freight cockpit, QA queues,
  inbox) behind one position-aware redirect. Low risk, high "เริ่มทำได้แล้ว" value.

### Step 3 — build the real workspace MENUS for the new positions (closes G2)
- Flesh out the freight 8-role menus (Model C) from the actual surfaces:
  `freight_sales` → leads + bookings + quotes; `pricing`/`freight_pricing` → quote/rate editor;
  `freight_*_doc` → cargo-declarations + customs-doc-kit + taxdoc-workspace; `freight_operation`
  → the ops cockpit; `accounting` → billing/AR. Reuse the existing `block*` items — assemble, don't
  invent.
- Split `menuSales` ≠ `menuCs` when the owner wants ("split later if needed" is already flagged).
- Give marketing/HR/IT positions trimmed menus instead of falling back to `super`.

### Step 4 — the freight status-transition matrix per workspace (closes G3)
- Mirror `check-fstatus-transition.ts` for the freight status model
  (`lib/auth/check-freight-status-transition.ts`): the 6 transport flavours' ordered status lists
  (Model C / `accounting-3account-freight-workflow` §3) gated to the 8 freight positions
  (Sales → Pricing → Doc/CS → Operation → Accounting; Manager/CEO override). Lock with tests like
  the cargo one. This is what enforces "Sales ❌ แก้ราคาหลังอนุมัติ".

### Step 5 — department boards (closes G5 · optional, later)
- A `/admin/department/[key]` overview that unions the queues of the positions in that department
  (for a department manager). Pure composition over Step 2's landings.

### Do we need a new "workspace" table? — **NO.**
The workspace is fully derivable: `position_id → workspace_role → (menu via ROLE_MENUS) +
(landing via WORKSPACE_LANDING) + (transitions via TRANSITION_OWNERS) + (actions via the
requireAdmin gate keys)`. Everything keys off `admin_positions.workspace_role`, which already
exists. **Extend `admin_positions`** if a position needs to override a default (e.g. a custom
landing href or an explicit allowed-transition set) — add nullable columns
(`landing_href text`, `allowed_transitions jsonb`) later, only when a position diverges from its
template. Start template-driven (Step 2's static map keyed by workspace_role); promote to
per-position columns only on real divergence.

### Do we extend `admins_role_check`? — **only to ADD a money tier, never a function role.**
The owner's "เดี๋ยว role ทำเพิ่มมาอีกอัน" is about FUNCTION, and function = a new POSITION row
(CRUD, zero migration). Only widen the CHECK when a genuinely new MONEY-VISIBILITY tier is needed
(rare). Adding a job = `INSERT INTO admin_positions` + (if it needs a distinct menu) a new
`ROLE_MENUS` template key. Keep the 23 retired function roles as valid values + menu/gate keys.

---

## 6. Money-safety + correctness notes (must hold through any build)

- **Never gate a cost/profit number with `isGodRole`** — all 3 tiers are god-nav, so that would
  leak cost to super/normies. Always use `canViewCost` / `canViewProfit`. Hide at the DATA layer
  (omit the field before render / skip the CSV column), never via CSS (§ money-visibility.ts).
- **Position scopes the MENU, tier scopes the MONEY** — keep them independent. Step 1's G6
  guardrail is the safety net so a low-trust seat isn't accidentally a high-money tier.
- **The queue filter and the action gate must derive from ONE source** (`TRANSITION_OWNERS`) so a
  staffer never sees a row in their queue they can't act on, or an action for a row that isn't in
  their queue (§0e reachability + the self-explaining-row standard §0g).
- **Fail-soft everywhere position resolution is read** — `getStafferWorkspaceRole` already returns
  null on error → falls back to the role menu, never a blank sidebar. Keep that for the landing too.

---

## 7. TL;DR for the owner / next builder

- **Already built (Jun 27–28, mig 0220/0221):** the unified 3-axis model — money-tier (ultra/
  super/normies) × department (6) × position→workspace_role — wired into the sidebar via
  `menuForStaffer`. `admin_positions` is CRUD-able + seeded with 12 positions.
- **The 3 role models reconcile:** Model A (current RBAC) = the money tier + retained
  menu/gate keys; Model B (14 ops roles) = the position catalogue; Model C (freight 8-role) =
  the per-position queue + status-transition spec.
- **What to build, in order:** (1) backfill `position_id` so scoping goes live + add the
  tier-vs-position guardrail; (2) per-position QUEUE landing (the real missing "workspace" — a
  static `workspace_role → landing` map reusing the existing transition matrix + surfaces);
  (3) flesh out the freight/marketing/HR menus; (4) the freight status-transition matrix; (5)
  department boards (later).
- **No new workspace table, no role-enum rewrite.** Add a job = a `admin_positions` row. Add a
  money tier = a CHECK widen (rare). Everything else is composition over what exists.

### Key files
- `lib/auth/require-admin.ts` — AdminRole enum (26) + the admin gate
- `lib/admin/god-role.ts` — `isGodRole` (ultra/super/normies = god-nav)
- `lib/admin/money-visibility.ts` — `canViewCost` / `canViewProfit` (the tier split)
- `lib/admin/departments.ts` — 6 departments + `defaultWorkspace`
- `lib/admin/positions.ts` — position read helpers (`getStafferWorkspaceRole` / `getStafferPositionInfo`)
- `lib/admin/sidebar-menu.ts` — `ROLE_MENUS`, `menuForStaffer`, `commonServicesTail`, `positionMenu`
- `lib/admin/phase-access.ts` — the Phase URL gate
- `lib/auth/check-fstatus-transition.ts` — the cargo status-transition matrix (the model to mirror for freight)
- `supabase/migrations/0220_admin_visibility_tiers_normies.sql` — the tier pivot
- `supabase/migrations/0221_admin_positions.sql` — the positions/workspace table
- `components/sections/admin-sidebar.tsx:529` — where `menuForStaffer` is called
- `docs/briefs/ops-roles.md` — Model B (14 ops roles)
- `docs/research/accounting-3account-freight-workflow-2026-06-30.md` §3 — Model C (freight 8-role)
