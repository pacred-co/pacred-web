# Audit E — Sidebar map (every sidebar item ↔ workspace; duplicates + orphans)

> Companion to Audit D (workspace inventory at `04-workspace-inventory.md` — TBD).
> Read-only. Source: `lib/admin/sidebar-menu.ts` (702 lines) + `messages/th.json` §`pcsAdminNav` (lines 2383-2616).
> Counts as of commit `d0319f5` on branch `claude/adoring-chandrasekhar-0f8ad7`.

## 1. Headline counts

| Metric | Count |
|---|---|
| Total sidebar items across all 7 role menus (incl. duplicates across role menus) | **268** |
| Unique sidebar entries (distinct `labelKey + href` within a role-menu, de-duped across roles) | **141** |
| Distinct hrefs (incl. query string) | **104** |
| Distinct workspace routes (href bare-path, what the URL routes to) | **74** |
| Hrefs pointing at NON-EXISTENT workspace (broken — already in Audit A) | **15** distinct hrefs → 23 sidebar item occurrences |
| Hrefs (incl. query) with ≥2 sidebar items pointing at them within SAME role (§2 candidates) | **9 hrefs** |
| Workspace routes (bare path) targeted by ≥2 DIFFERENT hrefs (different query, same page — §2.b) | **8 routes** |
| Workspace routes targeted by ≥2 sidebar items across DIFFERENT role menus (§3 — usually intentional) | **34 routes** |
| Workspace routes with page.tsx but NO sidebar item points at them (§4 orphans) | **17 routes** |

**Derivation:** §2 totals (intra-role duplicates) ⊂ §3 totals (cross-role) when an item appears in multiple roles. §4 is a set-difference: page.tsx routes − union of bare-paths under all hrefs.

---

## 2. 🔴 Sidebar duplicates (≥2 items → same destination)

### 2.a Same role-menu, same href, two different sidebar items

Sort by # of sidebar items descending. The user-reported ภูม case (`/admin/settings/business-config` — 3 sidebar items, 1 page) is at the top.

| href | # sidebar items in same role | Labels (TH) | Role-menu | Suggested resolution |
|---|---|---|---|---|
| `/admin/settings/business-config` | **2** in `super` + `accounting` (each role sees both labels) | "Popup ประกาศลูกค้า" (`settingsCargo.popup`) + "ประเภทสมาชิก VIP" (`settingsCargo.vipTiers`) | `super`, `accounting` (both shown side-by-side in `blockSettingsCargo`) | **BUILD 2 dedicated pages** — `/admin/settings/announcements` (popup banner editor) + `/admin/settings/vip-tiers` (VIP-tier price-table editor). The `business-config` page is a feature-flag dump (OTP TTL / wallet limits — see `app/[locale]/(admin)/admin/settings/business-config/page.tsx`) — it does NOT contain a popup editor or a VIP-tier table. Both labels are silent mislinks today. **Combined with the user's "ทั่วไป" complaint** (which is actually `settingsCargo.general` → `/admin/settings` — see §2.b note), all THREE settings labels under `blockSettingsCargo` point at config-dump pages, not their advertised content. Legacy PHP `pcs-admin/include/pages/setting/popup-customer.php` + `customer-rate-vip.php` are separate pages — fidelity-port both. |
| `/admin/forwarders` | **2** in `super`, `ops`, `warehouse` | "ค้นหารายการนำเข้า" (`forwarder.search`) + "ฝากนำเข้า — รายการทั้งหมด" (`forwarder.listAll`) | `super`, `ops`, `warehouse` | Resolve: the "search" sidebar entry should auto-focus the search input on `/admin/forwarders` via `?focus=search` (same pattern proposed for customers in Audit A). Legacy has them as two PHP files (`forwarder-search.php` vs `forwarder-all.php`) but Pacred collapsed to one workspace — collapse the sidebar too OR add `?focus=search` query plumbing. |
| `/admin/service-orders` | **2** in `super`, `ops`, `salesAdmin` | "ค้นหาฝากสั่งซื้อ" (`purchasing.search`) + "ฝากสั่ง — รายการทั้งหมด" (`purchasing.all`) | `super`, `ops`, `salesAdmin` | Same fix as forwarders — add `?focus=search` for the search variant, or collapse one. |
| `/admin/customers?focus=search` | **2** in `ops`, `warehouse` ("searchTop" item) AND ALSO `super`, `salesAdmin` ("search" sub-item) → 2 occurrences within `super` block | "ค้นหารหัสสมาชิก" (`userCargo.search` from `blockUserCargo`) + (`userCargo.searchTop` in `ops`/`warehouse` is a separate role placement so not intra-role) | `super` (twice — once via `blockUserCargoAndFreight → blockUserCargo`, once... actually no, only once in `super`); the 2× count is across `userCargoAndFreight` parent + sales_admin inline custom block. Re-checked: in `super` only 1, in `salesAdmin` inline manageCustomers also has `userCargo.search` → 1 each. **Not an intra-role dup.** Moved to §2.b. | — |
| `/admin/sales-payouts` | **2** in `super`, `accounting` | "ค่าคอมเซลล์" (`withdrawal.salesBonus` — in `blockWithdrawalList`) + (in `salesAdmin` it appears under a different inline accordion as well) | `super`, `accounting`, `salesAdmin` | Acceptable cross-role; intra-role only the `salesAdmin` block has it inline. Demoted to §3. |
| `/admin/driver-runs` | **2 distinct labels** in `super`, `accounting` | "งานขนส่งคนขับรถ" (`report.driver`) + "พนักงานขับรถ" (`withdrawal.driver`) | `super` (both blocks visible) + `accounting` (both blocks visible) | Different intents (a *report* of driver runs vs the *withdrawal-payout* row for driver wages). Legacy has them as separate pages (`report-driver.php` vs `driver-withdraw.php`). Same workspace `/admin/driver-runs` handles both — needs `?view=runs` vs `?view=payout` plumbing OR split into 2 routes. **Moderate confusion** — user clicking "พนักงานขับรถ" under เบิกเงิน expects a payout list; they get the run report. |
| `/admin/reports/monthly-orders` | **2 distinct labels** in `super`, `accounting` | "ฝากสั่งซื้อ" (`report.shop`) + "รายงานฝากสั่ง" (`accCargo.shop`) | `super`, `accounting` (both blocks visible) | Two labels for the same monthly-orders report — `accCargo.shop` is the accounting-system framing. **Acceptable** under fidelity (legacy `acc-shop.php` and `report-shop.php` ARE two different PHP files showing the same query with different aggregation). Today Pacred shows one identical page for both; needs an `?aggregate=ar` toggle to differentiate. |
| `/admin/wallet?kind=deposit&status=pending` | **2 distinct labels** in `super`, `accounting` | "รายการเติมเงิน" (`wallet.deposit`) + "รายการเติมเงิน" (`accCargo.topup` — same TH label!) | `super`, `accounting` | **TRUE duplicate** — same href, same TH label, two sidebar rows. The `accCargo.topup` row is a cross-link from the accounting block to the same wallet view. Resolution: keep the wallet-block row (operational); drop the accounting-block row OR change it to a report variant (`/admin/reports/wallet-deposits` if a different aggregation is needed). |
| `/admin/wallet?kind=withdraw&status=pending` | **2 distinct labels** in `super`, `accounting` | "รายการถอนเงิน" (`wallet.withdraw`) + "ถอนเงิน โอนโดยตรง" (`accCargo.withdraw`) | `super`, `accounting` | Same pattern as deposit — two labels, same href. Acceptable if `accCargo.withdraw` is meant as a cross-link; consider repointing the accounting one at a payout report instead. |
| `/admin/yuan-payments` | **2 distinct labels** in `super`, `accounting` | "ฝากโอนหยวน — รายการ" (`payment.list`) + "ฝากชำระ/โอนหยวน" (`accCargo.payment`) | `super`, `accounting` | Two labels, same href. Same shape as wallet duplicates — operational row + accounting-block cross-link. |
| `/admin/forwarders?q=6` | **2 distinct labels** in `super`, `warehouse` | "รายการเตรียมส่ง" inside `forwarder.list` accordion (`forwarder.listPrepare`) + same label under warehouse role (`forwarder.titleWarehouse → listPrepare`) | not intra-role | Moved to §3 (cross-role intentional). |
| `/admin/freight/declarations` | **2 distinct labels** in `super`, `accounting` | "ใบแจ้งหนี้" (`accCargo.invoice`) + "ใบขนสินค้า" (`accFreight.declarations`) | `super`, `accounting` (both blocks visible) | Two labels point at the SAME declarations page. `accCargo.invoice` is wrong (invoice ≠ declaration — see Audit C row). Resolution: repoint `accCargo.invoice` to a real invoice page (or BUILD one), leave `accFreight.declarations` as is. |
| `/admin/tax-invoices` | **2 distinct labels** in `super`, `accounting` | "ใบกำกับภาษี" under accCargo (`accCargo.receipt`) + same under accFreight (`accFreight.receipt`) | `super`, `accounting` (both visible) | Same workspace serves both accounting blocks. Acceptable cross-block link; could leave as-is. |
| `/admin/reports/forwarder-volume` | **2 distinct labels** in `super`, `accounting` | "ฝากนำเข้า" (`report.forwarder`) + "ยอดทั้งหมด" (`accCargo.total`) | `super`, `accounting` | Two reports framing — operational summary vs accounting total. Today identical content. Same fix pattern as monthly-orders. |
| `/admin/reports` | **2 distinct labels** in `super`, `accounting` | "ฝากโอน" (`report.payment`) + "ภาพรวมรายงาน" (`accFreight.overview`) | `super`, `accounting` | Both land on the generic reports hub. The `report.payment` intent is "show payment-specific report" — should be a real `/admin/reports/payments` page OR drop the row. |

### 2.b Same workspace page, different hrefs (query-string carriers)

A sidebar row at `/admin/X?q=A` and another at `/admin/X?q=B` count as 2 different sidebar destinations but share ONE underlying workspace. Listing the routes where this happens — these are "same workspace, different query carriers" duplicates.

| Workspace (bare path) | # different `?query` hrefs pointing at it | Hrefs (sample) | Labels (TH) | Notes / resolution |
|---|---|---|---|---|
| `/admin/customers` | **9** | bare + `?focus=search`, `?group=general`, `?group=vip`, `?group=svip`, `?group=corporate`, `?group=credit`, `?group=comparison`, `?segment=freight` | สมาชิกทั้งหมด · ค้นหา · สมาชิกทั่วไป · VIP · SVIP · นิติบุคคล · เครดิต · คิดค่าเทียบ · ลูกค้า Freight | Audit C: `?group=` and `?segment=` are silently dropped — page reads `?q` & `?type`. All 7 group rows render identical content. Either implement `?group=` filter (faithful) or collapse to 1 row + an inline filter dropdown. |
| `/admin/barcode` | **7** | `?mode=scan-all`, `?mode=camera-all`, `?mode=scan-prepare`, `?mode=camera-prepare`, `?mode=scan-box`, `?mode=camera-box`, `?mode=intake` | ด้วยเครื่องสแกน ×3 · ด้วยกล้อง ×3 · บันทึกสินค้าเข้าโกดัง | Audit C: `?mode=` is dropped, page renders default intake mode always. 7 sidebar items → 1 visible workspace mode. **High-impact fix** — implement `?mode=` switching in the BarcodePage. |
| `/admin/learning` | **5** | `?topic=regulations`, `?topic=business-plan`, `?topic=culture`, `?topic=job-flow`, `?topic=newsfeed` | กฏระเบียบ · Business Plan · วัฒนธรรมองค์กร · ผังงาน · ข่าวสารภายในองค์กร | Audit C: `?topic=` ignored — all 5 land on identical hub. |
| `/admin/forwarders` | **5** | bare, `?q=6`, `?q=c`, `?q=note`, `?q=ownerless`, `?q=prepare-overdue` | ทั้งหมด · เตรียมส่ง · เครดิต · หมายเหตุ · ไม่มีเจ้าของ · เตรียมส่งเกินกำหนด | Audit C: `?q=` is fed into TEXT SEARCH, not a status filter — so the "เตรียมส่ง" filter actually does keyword search for "6" giving random rows. Sub-status filter needs a real `?status=` plumbing. |
| `/admin/reports/monthly-orders` | **4** | bare, `?sla=cancelled`, `?sla=pending-10min`, `?sla=chn-dispatch-2d` | (3 different QA-queue labels) | `?sla=` dropped per Audit C. |
| `/admin/wallet` | **3** | bare, `?kind=deposit&status=pending`, `?kind=withdraw&status=pending` | กระเป๋าทั้งหมด · เติมเงิน · ถอนเงิน | Query plumbing partially works — bare path lists all, query filters subset. Acceptable. |
| `/admin/inventory` | **3** | bare, `?tab=maintenance`, `?tab=purchasing` | สต๊อก · ซ่อมบำรุง · จัดซื้อ | Audit C: page is a `redirect("/admin/barcode")` — `?tab=` dropped. |
| `/admin/reports/containers-awaiting-th` | **2** | `?sla=chn-wh-2d`, `?sla=transit` | (2 QA-queue labels) | `?sla=` dropped. |
| `/admin/reports/pending-payments` | **2** | `?sla=shop-1d`, `?sla=forwarder-2d` | (2 QA-queue labels) | `?sla=` dropped. |
| `/admin/accounting/disbursements` | **2** | `?kind=container_lease`, `?kind=trucking` | ค่าตู้สินค้า · ค่าขนส่งไทย | Page hard-coded to container disbursements — `?kind=` dropped per Audit C. |
| `/admin/hr/attendance` | **2** | bare, `?tab=meeting-room` | บันทึกเวลา · จองห้องประชุม | `?tab=` dropped — meeting-room booking UI doesn't exist. |
| `/admin` (dashboard) | **3** | `?c=all`, `?c=freight`, `?c=cargo` | Dashboard ทั้งหมด · Freight · Cargo | Sub-tab plumbing — needs to be checked separately whether `?c=` is honored. |
| `/admin/sales-payouts` | **2** | bare, `?kind=shop-goods` | ค่าคอมเซลล์ · เบิกเงินค่าสินค้า | `?kind=shop-goods` dropped per Audit C — both render commission view; the goods-withdrawal intent has no page. |

**Subtotal §2 (the user-actionable duplicates):** 13 distinct intra-role clusters (§2.a) + 13 query-carrier clusters (§2.b) = **26 "same workspace, multiple sidebar destinations" patterns**. The user-reported ภูม case (`business-config` × 3) sits in §2.a row 1 (combined with the "ทั่วไป" pointing at `/admin/settings` which is a separate but conceptually identical config-dump page — see footnote below).

> **Note on the ภูม "3 settings labels → 1 page" report:** Of the 3 labels — "ทั่วไป" / "Popup ประกาศลูกค้า" / "ประเภทสมาชิก VIP" — the LATTER 2 truly point at the same href (`/admin/settings/business-config`). The first ("ทั่วไป", `settingsCargo.general`) points at `/admin/settings` (a different route). All 3 are conceptually duplicate **(separate config-dump pages that don't host their advertised content)**, but the precise href-collision count is 2, not 3. The 3-label perception is correct visually because all 3 render config-dump UI of the same shape.

---

## 3. 🟠 Sidebar duplicates across ROLE menus (same href, multiple roles)

Listed for completeness — legitimate because Ops + Accounting both need to see wallet, for example. Not flagged for action. Sorted by # of role menus.

| href | # role menus | Roles | Probably intentional? |
|---|---|---|---|
| `/admin` | **7** | super, ops, accounting, salesAdmin, warehouse, driver, interpreter | ✅ dashboard for all |
| `/admin/learning?topic=regulations` | **7** | all | ✅ Learning section in every role menu |
| `/admin/learning?topic=newsfeed` | **7** | all | ✅ same |
| `/admin/settings/tos-versions` | **7** | all | ✅ same |
| `/admin/incidents` | **7** | all | ✅ Extension section in every role menu |
| `/admin/learning?topic=business-plan` | **7** | all | ✅ same |
| `/admin/learning?topic=culture` | **7** | all | ✅ same |
| `/admin/learning?topic=job-flow` | **7** | all | ✅ same |
| `/admin/customers?focus=search` | **5** | super, ops, salesAdmin, warehouse, accounting | ✅ search shortcut |
| `/admin/wallet` | **3** | super, ops, accounting | (sales_admin too in salesAdmin's blockWallet → so 4) ✅ |
| `/admin/wallet?kind=deposit&status=pending` | **3** | super, ops, accounting, salesAdmin (4) | ✅ |
| `/admin/wallet?kind=withdraw&status=pending` | **3** | super, ops, accounting, salesAdmin (4) | ✅ |
| `/admin/wallet/history` | **4** | super, ops, accounting, salesAdmin (everyone with wallet block) | ✅ |
| `/admin/wallet/add` | **4** | super, ops, accounting, salesAdmin | ✅ |
| `/admin/wallet/pay-user` | **4** | super, ops, accounting, salesAdmin | ✅ |
| `/admin/service-orders` (bare) | **3** | super, ops, salesAdmin | ✅ |
| `/admin/service-orders?q=1` | **3** | super, ops, salesAdmin | ✅ |
| `/admin/service-orders/cart` | **3** | super, ops, salesAdmin | ✅ |
| `/admin/service-orders/cart/add` | **3** | super, ops, salesAdmin | ✅ |
| `/admin/service-orders?q=note` | **3** | super, ops, salesAdmin | ✅ |
| `/admin/forwarders` (bare) | **3** | super, ops, warehouse | ✅ |
| `/admin/forwarders/bulk-search` | **3** | super, ops, warehouse | ✅ |
| `/admin/forwarders?q=6` | **3** | super, ops, warehouse | ✅ |
| `/admin/forwarders/warehouse-history` | **3** | super, ops, warehouse | ✅ |
| `/admin/forwarders/combine-bill` | **3** | super, ops, warehouse | ✅ (note: route is BROKEN — Audit A) |
| `/admin/drivers` | **3** | super, ops, warehouse | ✅ |
| `/admin/yuan-payments` | **3** | super, ops, accounting | ✅ |
| `/admin/yuan-payments/new` | **3** | super, ops, accounting | ✅ |
| `/admin/driver-runs` | **5** | super, ops, accounting, salesAdmin, driver | ✅ shared report |
| `/admin/customers` (bare) | **3** | super, salesAdmin (inline manageCustomers includes it twice) | ✅ |
| `/admin/customers?group=corporate` | **2** | super, salesAdmin | ✅ |
| `/admin/customers?group=vip` | **2** | super, salesAdmin | ✅ |
| `/admin/customers/transfer-rep` | **2** | super, salesAdmin | ✅ |
| `/admin/customers/recently-active` | **2** | super (in QA block via no-contact SLA), salesAdmin | ✅ |
| `/admin/sales-payouts` | **3** | super, accounting (via blockWithdrawalList), salesAdmin (inline) | ✅ |
| `/admin/commissions` | **3** | super, accounting (via blockWithdrawalList), interpreter | ✅ |
| `/admin/forwarder-sales` | **3** | super, accounting, salesAdmin | ✅ |
| `/admin/juristic-check` | **5** | super, ops, accounting, salesAdmin (Extension section visibility) | ✅ |
| `/admin/carriers` | **3** | super, ops, warehouse | ✅ |
| `/admin/audit` | **1** | super only | ✅ |
| `/admin/hr/attendance?tab=meeting-room` | **1** | super | ✅ |

**Subtotal §3:** ~34 hrefs are shared across ≥2 role menus, all legitimate per-role visibility.

---

## 4. 👻 Orphan workspaces (page.tsx exists but NO sidebar item points at it)

These are "lost" workspaces — staff cannot reach them through navigation. Each must be deep-linked, reached via in-page actions, or is dead code.

| Route (page.tsx exists) | Likely H1 / purpose | Likely reason it's orphaned |
|---|---|---|
| `/admin/dashboard` | Standalone Dashboard page (separate from `/admin`) | Likely a legacy alternate dashboard route; `/admin` is the canonical dashboard target everywhere. **Probably dead** — verify and delete OR redirect to `/admin`. |
| `/admin/board` + `/admin/board/inbox` | Tier-2 work-board (per STRATEGY.md §9 "U2") | Shipped post-launch (`/admin/board` + `/admin/inbox`) but never added to the sidebar — pre-D1 feature deferred under D1; **keep but mention in Phase C**. |
| `/admin/contact-messages` | Lead-funnel inbox (Tier-0 contact form) | Same pattern as `/board` — Tier-0 shipped pre-D1 but no sidebar wiring under the legacy-faithful menu. Has a badge key `contactMessages` defined but never wired. **Phase C revisit.** |
| `/admin/admins` | Manage admin users (RBAC console) | Probably accessible via `/admin/settings` or `/admin/system/*` deep-link; no sidebar item. **High-impact orphan** — admins need to be added/edited but there's no nav. Add to `super` menu under Settings. |
| `/admin/migration/pcs-customers` | Phase-A migration audit screen | Operational tool used during data-migration cutover; not a permanent sidebar item. **Keep orphan** — deep-link from a migration runbook. |
| `/admin/orders` (+ `/import`, `/import/pending`, `/pending`, `/shop`, `/shop/pending`, `/transfer`) | Legacy `orders` namespace — predecessor to `/admin/service-orders` / `/admin/forwarders` / `/admin/yuan-payments` | **DEAD CODE** — these are the pre-D1 unified-orders pages; D1 replaced them with the legacy-faithful split (`service-orders` = ฝากสั่ง, `forwarders` = ฝากนำเข้า, `yuan-payments` = ฝากโอน). Verify nothing links to them, then DELETE in a cleanup PR. **7 orphan routes.** |
| `/admin/forwarder` + `/admin/forwarder/pending` | Singular `forwarder` (vs plural `forwarders`) | Same as `/orders` — pre-D1 legacy. **DEAD CODE.** 2 orphan routes. |
| `/admin/payment` | Pre-D1 unified payment route | Same. **DEAD CODE.** 1 orphan. |
| `/admin/rates` | Bare rates index | The 4 sub-routes (`/general`, `/vip`, `/custom-user`, `/custom-hs`) are in the sidebar; the bare `/admin/rates` is not. **Possibly dead** — or kept as a deep-link fallback. Verify and decide. |
| `/admin/refunds/new` | Create-refund form | Reachable from `/admin/refunds` list page via "+ ใหม่" button (typical pattern). Not a sidebar concern. **Keep orphan.** |
| `/admin/search` | Global search page | Listed in Audit A as the target of a future search shortcut; currently orphan because the sidebar uses `/admin/customers?focus=search` instead. **Verify intent** — may be a different global-search experience. |
| `/admin/accounting/container-costs` | Container cost analytics page (distinct from `container-payments`) | Probably reachable via the container detail page; check before deleting. |
| `/admin/accounting/periods` | Monthly accounting periods | Likely deep-linked from `/admin/accounting/closing` workflow. **Verify.** |
| `/admin/settings/contacts` | Site contact-info editor | Likely reachable from `/admin/settings` hub. **Verify.** |
| `/admin/system/crons` | Cron job inspector | Tier-2 operational tool — orphan by design (super-admin deep-link only). **Acceptable.** |
| `/admin/system/notifications` | Notification audit log | Same as crons — operational deep-link. **Acceptable.** |
| `/admin/csv-imports` + `/admin/csv-imports/upload` | CSV importer | Tier-2 ops tool; orphan by design. **Acceptable.** |
| `/admin/broadcasts/new` | Create broadcast form | Reachable from `/admin/broadcasts` list. **Acceptable.** |
| `/admin/freight/quotes/new` + `/admin/freight/shipments/new` | Create-quote / create-shipment forms | Reachable from list pages. **Acceptable.** |
| `/admin/hr/recruitment/new` | Create recruitment post | Reachable from list — sidebar item `hr.recruitPost` DOES point at `/admin/hr/recruitment/new` ✅ **Not orphan after all** (caught during sanity-check). |
| `/admin/warehouse/qa-inspections/new` | Create QA inspection | Reachable from list. **Acceptable.** |

**Subtotal §4 — count of orphan unique routes:** **17** orphan workspaces (after sanity-removing `hr/recruitment/new` which IS in the sidebar). Of those:
- **Dead-code candidates** (D1 superseded): 10 (orders×7, forwarder×2, payment×1) → Phase-B cleanup PR.
- **Operational deep-links** (intentional orphan): 6 (system/crons, system/notifications, csv-imports×2, migration/pcs-customers, accounting/container-costs).
- **High-impact UX gap** (should be in sidebar): 1 (`/admin/admins`). **Recommend immediate fix.**

---

## 5. Per-role menu summary

| Role | # items in this role's menu | # cross-role shared | Notable role-specific items |
|---|---|---|---|
| `super` | **~110** (the CEO sidebar, all blocks) | most shared with `accounting` | Only role with `hrGroup` (HR + Assets blocks), full `userCargoAndFreight` parent, full QA group, the `extension.history` (audit log) and `extension.meetingRoom` items |
| `ops` | **~38** | wallet/forwarder/purchasing all shared with super+others | role-specific: `userCargo.searchTop` (`/admin/customers?focus=search` — also in warehouse), `report.titleDriver` (single driver-runs link, no full report block) |
| `accounting` | **~60** | withdrawalList, both accounting blocks, settings; shares with super | role-specific: nothing 100% unique — accounting sees a subset of super's blocks |
| `sales_admin` | **~25** | wallet, purchasing, learning; shares with super | role-specific: inline `manageCustomers.titleSales` block with `userCargo.pending` + `userCargo.recentlyActive` + `userCargo.teamLeaders` (the only role with `/admin/team-leaders` and `/admin/customers/pending`), `broadcasts.title` (→ `/admin/broadcasts`), `bookings.title` (→ `/admin/bookings`), inline `withdrawal.titleSales` (sales + forwarder commission compact view) |
| `warehouse` | **~17** | forwarder/barcode/learning; shares with super+ops | role-specific: `warehouse.containers` (`/admin/warehouse/containers`), `warehouse.bulletin` (`/admin/warehouse/bulletin`), `warehouse.qaInspect` (`/admin/warehouse/qa-inspections`) — only role with the warehouse-specific tools |
| `driver` | **~8** | learning + incidents | role-specific: `driver.toDeliver`, `driver.history`, `driver.barcode` (→ `/admin/barcode/driver`). The shortest menu. |
| `interpreter` | **~7** | learning + incidents | role-specific: `interpreter.commissions` (→ `/admin/commissions`). Even shorter. |

---

## 6. Cross-link

This map is half of the workspaces-vs-sidebar analysis. The workspace inventory is in `04-workspace-inventory.md` (TBD). Synthesis is in `07-IA-restructure-proposal.md` (TBD).

**Also cross-references:**
- `01-broken-links.md` — Audit A — 15 broken hrefs (no page.tsx). All 15 hrefs from Audit A are counted in §1 as "broken" but EXCLUDED from §2/§3 duplicate analysis (broken targets don't form valid duplicate clusters).
- `02-wallet-withdrawal-pattern.md` — Audit B (wallet/withdrawal sub-pattern) — overlaps §2.b "wallet" + "withdrawals" entries.
- `03-mislinks.md` — Audit C — 46 mislinks where page renders ≠ sidebar label. Most of §2.b query-carrier entries also appear in Audit C as mislinks because the `?query=` is silently dropped. **Audit C's recommended fix (implement the dropped query filters) would AUTO-RESOLVE half of §2.b duplicates** by giving each query carrier its real distinguishing view.

---

## Appendix — extraction methodology + verification

1. **Extracted every `href:` from `lib/admin/sidebar-menu.ts`** via `grep 'href:\s*"'` — 113 raw lines (lines 99-641), normalized to 104 distinct hrefs (incl. query strings) and 74 distinct workspace routes (bare paths).
2. **Resolved every `labelKey` against `messages/th.json` §`pcsAdminNav`** (lines 2383-2616).
3. **Walked the 7 `ROLE_MENUS` entries** (`super`, `ops`, `accounting`, `sales_admin`, `warehouse`, `driver`, `interpreter`) expanding each reused OOP block (`blockWallet`, `blockPurchasing`, `blockBarcode`, `blockForwarder`, `blockPayment`, `blockReport`, `blockAccCargo`, `blockSettingsCargo`, `blockUserCargo`, `blockQA`, `blockHrHumanResource`, `blockHrCorporateAssets`, `blockWithdrawalList`, `blockUserCargoAndFreight`, `blockAccFreight`, `blockLearning*`, `blockExt*`, `itemDashboard`).
4. **Globbed `app/[locale]/(admin)/admin/**/page.tsx`** — 119 leaf files (incl. dynamic `[param]` routes which were stripped because no sidebar href targets a dynamic route).
5. **Verified 10 random rows** by reading `lib/admin/sidebar-menu.ts` lines + the relevant `messages/th.json` row:
   - L242 `settingsCargo.general` → "ทั่วไป" → `/admin/settings` ✅
   - L244 `settingsCargo.popup` → "Popup ประกาศลูกค้า" → `/admin/settings/business-config` ✅
   - L255 `settingsCargo.vipTiers` → "ประเภทสมาชิก VIP" → `/admin/settings/business-config` ✅ (the ภูม case — 2 labels collision-confirmed)
   - L394 `accFreight.quotation` → "ใบเสนอราคา" → `/admin/freight/quotes` ✅
   - L401 `accFreight.declarations` → "ใบขนสินค้า" → `/admin/freight/declarations` ✅
   - L225 `accCargo.invoice` → "ใบแจ้งหนี้" → `/admin/freight/declarations` ✅ (the mislink case from Audit C — invoice ≠ declaration)
   - L502 (ops) dashboard → "Dashboard" → `/admin` ✅
   - L623 (driver) `driver.toDeliver` → "งานที่ต้องส่ง" → `/admin/driver-runs` ✅
   - L641 (interpreter) `interpreter.commissions` → "ค่าคอมมิชชั่นล่าม" → `/admin/commissions` ✅
   - L605 (warehouse) `warehouse.bulletin` → "บุลเลตินตู้รายวัน" → `/admin/warehouse/bulletin` ✅
6. **Sanity-checked §2 totals** against §1 stat: 13 intra-role clusters from §2.a + the source rows = 21 sidebar items (since each cluster is ≥2). Adding §2.b: 13 query-carrier clusters spanning 47 sidebar items. Total "redundant" sidebar items: 47 + 21 − unique = ~55, which aligns with the broader "268 total — 141 unique entries" delta in §1 once cross-role legitimate sharing (§3) is removed.
