# Cockpit & money-report robustness + tax-doc + workflow lessons (2026-06-28)

Compounding learnings from the cockpit-overhaul / payment-board / tax-doc session. Read before touching exec reports, forwarder settle paths, or running guide/build workflows.

## 1. ONE corrupt row can tank an exec money report → quarantine, don't sum blind
The Exec cockpit showed **margin −372%** ("ผู้บริหารบ่นตาย"). Root: a SINGLE row (F52093/PR7429) had `fcosttotalprice=฿467,500` on a ฿2,057 sale (a fat-finger · 227× the sale · 1500× its volume-implied cost). It poisoned BOTH the PCSF carrier bucket AND the แสง warehouse bucket (same row, two breakdowns) → the twin −463K/−464K + the company −372%.
- **Fix:** reset the corrupt cost on prod (backup first · reversible · accounting re-costs via the editor).
- **Pattern (durable):** a money-aggregate report must DETECT + QUARANTINE anomalous rows (cost > ฿50k AND > 5× revenue) OUT of the P&L and SURFACE them in a "ต้นทุนผิดปกติ — ตรวจสอบ" panel — never silently fold them in. One bad row must not make the exec number garbage. `actions/admin/reports-cockpit.ts costAnomaly()`.

## 2. A report that reads ONE source silently hides the rest
The cockpit headline read `tb_forwarder` ONLY → it showed ฿117K MTD revenue while **shop alone was ฿372,931** (3× hidden · 76% of revenue invisible). An exec "ภาพรวม" must union ALL services (shop tb_header_order · yuan tb_payment · import tb_forwarder · freight freight_shipments) + a total. When a report claims "ภาพรวม/overview", verify it actually covers all sources — a single-table read is a silent under-count. `reports-cockpit-service.ts`.

## 3. adminMarkForwarderPaid is a TOMBSTONE — use adminPayForwardersOnBehalf
The obvious-named `adminMarkForwarderPaid` (actions/admin/forwarders.ts) is a HARD NO-OP (it read the rebuilt 0-row `forwarders`/`wallet_transactions` twins = a §0e dead-write · double-spend risk). The FAITHFUL forwarder settle = **`adminPayForwardersOnBehalf`** (actions/admin/pay-user.ts · debits tb_wallet · writes tb_wallet_hs type='4' · flips fstatus 5→6 · idempotent + rollback). Always grep for a tombstone comment before reusing a money action by its name.

## 4. §0e can be a dead-READ that ERRORS (not just a dead-write)
The "โบนัสล่ามจีน" sidebar badge counted the `commissions` table — which DOES NOT EXIST on prod (`to_regclass`=null) → the query ERRORED every sidebar load + the badge could never light + it under-counted `withdrawalAll`. Repointed to `tb_withdraw_comm_interpreter_h` status='2'. **Verify a table EXISTS (to_regclass) before trusting a count — a query against a non-existent table degrades to 0 + spams errors, looking like "just empty".**

## 5. A role-demotion migration is COUPLED to its code — deploy together
mig 0220 demotes 9 active `super`→`normies`. If applied to prod while prod runs the OLD code (that doesn't know `normies`), `isGodRole`/requireAdmin reject the unknown role → **9 admins lock out of the live admin**. Such a value-changing-RBAC migration must apply WITH the code that understands the new value (never before). Held 0220-prod for the main push; applied 0220 to dev (0 supers there) + 0221 (additive · safe) to both.

## 6. customs_declarations is freight-centric — cargo needs its own seed path
`adminCreateDeclaration` seeds lines from `freight_invoice_lines` (keyed to `freight_shipment_id`). Cargo ฝากนำเข้า items (`tb_forwarder_item`) had NO seed path → "เลือกสินค้า → ใบขน" needed a NEW action seeding from the items, keyed by the `cargo_forwarder_id` column (no freight_shipment). Produce a DRAFT (editable · safe) — the legal issuance stays the existing guarded flow. `actions/admin/cargo-declaration-from-items.ts`.

## 7. A concurrent Workflow's agents edit the MAIN worktree → a foreground `git add -A` bundles them
The guide-rollout workflow (8 agents · no `isolation`) edited the real working tree concurrently while I built the item-picker. My `git add -A && git commit` for the item-picker SWEPT IN all the completed guide edits → they landed in that commit (e5519426) under a misleading message. Lesson: when a Workflow is running concurrently, a foreground `git add -A` will capture the agents' finished edits too. Either commit narrowly (`git add <my files>`) during a live workflow, or expect the bundle (and gate the WHOLE tree before committing — which caught nothing here since the agents were clean, but could). Always full-tsc + lint the bundled result, not just your own files.
