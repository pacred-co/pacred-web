# Prep: staff-rows + shipment running-number (2026-06-15)

> Readiness plan from the `prep-staff-cost-shipment-2026-06-15` scoping workflow. The cost-leak (Priority 1) is SHIPPED (`2f8e5009`). This doc readies the two build items the owner flagged — each needs ONE owner scope decision before building.

## ✅ DONE this session
- **Cost hidden from staff** (`2f8e5009`) — 6 surfaces gated. Cost-view = super/accounting/pricing (+ freight managers on freight P&L/cockpit). P0 shop+forwarder cost sections now render null for non-cost roles (was leaking the number via a read-only summary to EVERY role). Owner-call left unchanged: freight-quote gross-profit toast + dashboard buy-rate chip.
- **Outstanding cleared**: code-debt waves + teammate P3 fidelity (acc-payment ledger + MOMO-LCL `400b6d48`) verified landed. Stray change-phone WIP discarded. Deferred (correctly): §0c statement-write lint rule (flood risk → warn-only rollout), atomic balance folds (need RPC+migration), freight-receipts/history dup (has a print sub-route — retire carefully), 3 mobile freight tables (ปอน lane).

## 🔜 BUILD ITEM A — Staff RBAC rows ("row พนักงาน")
**Current model:** flat 24-role RBAC on `public.admins.role` (PK `(profile_id, role)` → multi-role supported per person; each grant independently `is_active`). Enforced by `requireAdmin([roles])` + the `proxy.ts` phase-gate. CRUD already exists: `/admin/admins` (directory), `/admin/admins/new` (full provisioning), `/admin/admins/[id]/edit`, `/admin/admins/sales-team` (the recent per-row toggle pattern to mirror). Legacy `tb_admin` bridges via `admin_contact_extras.legacy_admin_id`.

**Gaps:** (1) `adminGrantRole`/`adminToggleRole` carry a STALE 7-value role enum (missing manager/sales/qa/pricing + 13 freight) — must consolidate to the full-24 `ADMIN_ROLES` / `adminChangeRole` first. (2) edit UI assumes one role/admin though the table supports multi. (3) NO per-staffer cost-visibility flag (cost is role-based today). (4) dual-store coherence is manual (a /new admin without a legacy_admin_id won't appear in the sales-team toggle). (5) no person-level activate/deactivate.

**Recommended tiers:**
- **Tier 1 (no migration · reuses everything):** per-row inline controls on `/admin/admins` mirroring the sales-team page — role-change (via `adminChangeRole`) + is_active toggle (via `adminToggleActive`), §0f confirm-gated. **Fix the stale 7-value enum FIRST** so it can grant the full 24 roles. ← **recommended start.**
- **Tier 2 (1 migration · money-path):** add `admins.can_see_cost` + thread into cargo-cost.ts/cost editors — ONLY if per-staffer (not per-role) cost visibility is the intended axis.
- **Tier 3 (defer):** multi-role-per-row UI + person-level activate/deactivate across admins/profiles/admin_contact_extras/tb_admin.

**✅ OWNER DECISION A (2026-06-15): (b) — Tier 1 grid + Tier 2 per-staffer cost-visibility flag.** Build plan:
1. **Fix the stale 7-value role enum FIRST** (adminGrantRole/adminToggleRole → full-24 ADMIN_ROLES / route via adminChangeRole) so the grid can grant every role.
2. **Tier-1 grid** on `/admin/admins`: per-row role-change + is_active toggle (mirror the sales-team toggle page · §0f confirm).
3. **Tier-2 (migration 0185 wave):** add `admins.can_see_cost boolean default false` → thread into the cost gate so a staffer's effective cost-view = `hasRole(cost-roles) OR can_see_cost`. Touch the 6 surfaces gated in `2f8e5009` (shop/forwarder cost sections, freight cockpit/P&L, margin-monitor, customer-margin) + cargo-cost.ts. Add a per-row "เห็นต้นทุน" toggle in the grid (writes can_see_cost). §0e/§0f-careful, dry-run, dev→prod.

## 🔜 BUILD ITEM B — Shipment running-number ("รันเลข shipment")
**Current state:** NO dedicated cargo shipment number — a cargo "shipment" IS the `tb_forwarder` row, numbered by the bare auto-increment `tb_forwarder.id` (surfaced as `[fNo]`, sometimes `PR<id>`), no prefix/period/meaning. The FREIGHT stack already HAS a clean collision-safe one: `freight_shipments.job_no = A{YY}{NNNNN}` via `next_freight_job_no()` (atomic upsert-lock · pattern in `supabase/migrations/0050_freight_shipments.sql:164-188`). Proven siblings: FQ/FI freight codes, member PR. **Latent bug found:** `tb_header_order.hno = 'P' + MAX(id)+1` (cart.ts:310-324) is RACE-PRONE (concurrent submits can dup) — the code comment itself flags a DB sequence as the fix.

**Recommendation:** add a proper cargo shipment number `SH-{YYMM}-{NNNN}` (e.g. SH-2606-0042) via a `next_shipment_no()` SECURITY DEFINER fn mirroring `next_freight_job_no()` EXACTLY (a `shipment_seq(period, next_seq)` counter + atomic `INSERT … ON CONFLICT (period) DO UPDATE SET next_seq=next_seq+1 RETURNING` · BKK TZ · grant execute service_role only). Store as a new `tb_forwarder.shipment_no` column + UNIQUE index. Stamp at every create/commit path (forwarders-new.ts:519 · commit-momo-row-core.ts:482 · cart.ts spawn). Do NOT replicate cart.ts's MAX+1 race. Migration-gated (next free = **0185**). Bundle the `tb_header_order.hno` race fix (same DB-sequence pattern) into the same migration wave.

**✅ OWNER DECISION B (2026-06-15): (b) — ONE unified shipment number across cargo + freight.** Build plan (non-breaking):
1. **ONE shared counter + format `SH-{YYMM}-{NNNN}`** via `next_shipment_no()` (SECURITY DEFINER · atomic `INSERT … ON CONFLICT (period) DO UPDATE SET next_seq=next_seq+1 RETURNING` · BKK TZ · grant service_role only · pattern = `next_freight_job_no()` in 0050:164-188).
2. **Both worlds get a `shipment_no` column** from that one counter: `tb_forwarder.shipment_no` (cargo) + `freight_shipments.shipment_no` (freight), each + UNIQUE index. **Freight KEEPS `job_no` (A-series)** for its existing consumers — we ADD the unified SH- number alongside, NOT repoint/break the A-series (avoids regressing the working freight stack).
3. **Stamp at every create/commit path**: cargo — forwarders-new.ts:519 · commit-momo-row-core.ts:482 · cart.ts spawn; freight — adminConvertQuoteToShipment / the freight shipment create. Backfill existing rows (dry-run-first, advisory-/lock-safe) so old shipments also get an SH- number.
4. **Bundle the `tb_header_order.hno` MAX+1 race fix** (cart.ts:310-324 → a DB sequence) into the SAME 0185 migration wave.

## Build sequence (scope locked · migration-gated · build as a focused run for signup/money-path safety)
1. Tier-1 staff-row grid: fix stale role enum → inline role/active toggles on /admin/admins [no migration].
2. **Migration 0185 wave** (dev-test → prod → DEV-SYNC): `next_shipment_no()` + `tb_forwarder.shipment_no` + `freight_shipments.shipment_no` (+UNIQUE each) + `admins.can_see_cost` + the `hno` race fix.
3. Stamp shipment_no at all create paths (cargo + freight) + backfill existing rows.
4. Tier-2: thread `can_see_cost` into the 6 cost surfaces + the grid's per-row "เห็นต้นทุน" toggle.
5. Gate (typecheck/lint/test/build) + adversarial money-path review before prod.
