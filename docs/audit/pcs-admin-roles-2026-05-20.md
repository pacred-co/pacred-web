# PCS Admin Roles & Sidebar — Doc-vs-Implementation Audit

**Audit date:** 2026-05-20
**Auditor:** Agent Y (read-only)
**Doc audited:** `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\N'POOM - PCS LEARNNING\PCS_ADMIN_ROLES_AND_MENUS.md` (1,303 lines, v1.0 dated 19 May 2026, authored by พี่เดฟ for ภูม)
**Implementation audited:** `lib/admin/sidebar-menu.ts` (~750 LOC) + `lib/auth/require-admin.ts` (`AdminRole` enum)
**Verification:** `pnpm tsc --noEmit` clean before and after (no code touched · pure read).

---

## 1. Executive Summary

The PCS Cargo legacy admin had **34 distinct role files** spanning three companyType partitions: `1=CargoAndFreight` (15 roles), `2=Freight` (13 roles), `3=Cargo` (6 roles). Pacred's `AdminRole` enum collapses them into **7 buckets**: `super | ops | accounting | sales_admin | sales | warehouse | driver | interpreter`. (Note: enum actually defines **7**, not 8 — `sales` is **not** a separate enum value; only `sales_admin` exists.)

### Headline counts

| Status | Count | Roles |
|---|---|---|
| 🟢 **Match** (legacy role correctly mapped → has a working Pacred bucket with the right menu shape) | **3** | `super` (=CEO #1) · `warehouse` (=Warehouse Staff #33) · `driver` (=Driver #34) |
| 🟡 **Partial** (mapped bucket but missing items, mis-named, or covers multiple legacy roles loosely) | **4** | `ops` (covers CS Purchasing #31 loosely) · `accounting` (covers Accounting Mgr #6 + Staff #7 but missing Refund-to-Wallet leaves) · `sales_admin` (covers Cargo Sales #30 + Sales Mgr #29 + Sales All #12 — three legacy roles fused) · `interpreter` (covers a NON-legacy role — see §3) |
| 🔴 **Missing role entirely** (legacy role with no Pacred mapping at all) | **23** | All 13 Freight roles (#16-28) · HR Manager #2 · HR Staff #3 · Maid #4 · QA & QC #5 · Marketing Manager #8 · Pricing #9 · Marketing/Creative #10 · Graphic/Editing #11 · IT Frontend/Backend/Fullstack #13/14/15 · CS Purchasing-as-Interpreter (the legacy interpreter sub-role) |
| ➕ **Extra (Pacred-original)** | several | Phase-2 items: `broadcasts` · `bookings` · `incidents` · `warehouse.bulletin` · `warehouse.qaInspect` · `customers/recently-active` · `customers/pending` queue · `team-leaders` bonus tool · `commissions` interpreter-portal split |

### Top-line verdict

The 7-role enum is a **defensible compression of the 34 legacy roles** for D1 launch — the missing 23 are mostly Freight (entire companyType=2, deferred until Phase B-Freight starts) and HR/IT/Marketing sub-roles that Pacred currently treats as `super` or `accounting`. **The two genuine functional gaps that block fidelity right now are:**
1. **`QA & QC` role #5** has no Pacred enum value — the 12 SLA-breach queues exist as a Phase-2 single leaf `itemQAAll` visible to `super` only, but no `qa` admin role can be assigned to a dedicated QA staffer.
2. **`HR` (Manager #2 + Staff #3)** has no Pacred enum value — HR work is folded into `super`. Anyone hired as "HR only" currently has to be made `super` (over-privileged).

The 1:1 transcription of menu shape is **broadly faithful** for the 3 mapped legacy roles (super/warehouse/driver) and **drifted by ภูม's "Pacred-is-one-company" merge** for the rest (the merge is documented + sanctioned in the code comments, but it does diverge from the doc's 3-companyType structure — owner has approved this divergence per the 2026-05-20 ค่ำ brief).

---

## 2. Per-Role Tables (Legacy doc vs Pacred implementation)

Legend: 🟢 Match · 🟡 Partial · 🔴 Missing · ➕ Extra · ❓ Unclear

### CompanyType 1: CargoAndFreight (15 roles)

| # | Legacy role (doc) | Doc line | Pacred enum mapping | Menu shape gap | Severity |
|---|---|---|---|---|---|
| 1 | **CEO / Super Admin** | 108-300 | `super` → `menuSuper` | Doc lists 22 sections incl. organization (chart/table/recruitment/people/attendance/asset-mgmt — `organization-chart.php`, `time-attendance-system.php`, etc.). Pacred collapses HR into a 2-leaf `blockHr` (`/admin/hr/humanresource` + `/admin/hr/assets`) — operational items moved to page top-menubar per ภูม brief. Doc's "QA & QC" 12-leaf SLA tree → Pacred's single-leaf `itemQAAll` (Phase 2). Withdrawals tree matches well (`blockWithdrawalList`). **Doc's "ย้ายพนักงานขายที่ดูแลลูกค้า" (`transferSalesCustomers.php`, line 230) is mapped to `customers/transfer-rep`** — good. **Doc's "บัญชีธนาคารพนักงาน" (`admin-acc.php`, line 152) has no obvious Pacred route.** | 🟢 Match (with sanctioned consolidation) |
| 2 | **HR Manager** | 304-318 | ❌ None | No `hr_manager` enum value. Real HR staffer must be `super` today. | 🔴 Missing role |
| 3 | **HR Staff** | 322-341 | ❌ None | No `hr_staff` enum value. Real HR staffer must be `super` today. | 🔴 Missing role |
| 4 | **Maid / แม่บ้าน** | 345-354 | ❌ None | Doc shows minimal menu (Dashboard + self-attendance only). Pacred has no `maid` enum — they'd need an admin record. | 🔴 Missing role (low priority — likely outside admin scope) |
| 5 | **QA & QC** | 358-382 | ❌ None | Doc has a full QA workspace (12 SLA-breach queues + transferSalesCustomers). Pacred's `itemQAAll` exists as Phase 2 visible to `super` only — **a real QA staffer has no role to login as**. | 🔴 Missing role + 🔴 critical access gap |
| 6 | **Accounting Manager** | 386-414 | `accounting` → `menuAccounting` | Doc has `รายรับ - รายจ่าย` (ประวัติรายการ/รายรับ/รายจ่าย — `acc-system.php` parent + children, line 396-399) and `ระบบบัญชี Cargo` (`acc-system-cargo.php` line 409) and `คืนเงินเข้า Wallet` parent with 2 leaves (acc-shop-refund + acc-forwarder-refund, line 406-408). Pacred's `blockAccounting` is 2 leaves (cargo + freight) only — deeper hierarchy lives in page top-menubars per ภูม brief. **`คืนเงินเข้า Wallet` (refunds-to-wallet) is documented but no leaf exists in the sidebar — relies entirely on page top-menubar of `/admin/accounting/cargo` (assumed but unverified by this audit).** | 🟡 Partial — refund-to-wallet path unclear |
| 7 | **Accounting Staff** | 418-435 | `accounting` (same as Mgr) | Doc says Staff sees a **subset** of Manager's items (no `รายรับ-รายจ่าย`, no `คืนเงินเข้า Wallet`, no `ระบบบัญชี Cargo`). Pacred makes no Mgr/Staff distinction inside `accounting` — both get identical menu. | 🟡 Partial — no Mgr/Staff sub-distinction |
| 8 | **Marketing Manager** | 439-457 | ❌ None | Doc has `จัดการลูกค้า` + 4 cargo MODULES + 3-leaf settings subset (`notify` + `popup` + `adjust-words-below-search`). No Pacred `marketing` role. | 🔴 Missing role |
| 9 | **Pricing** | 461-480 | ❌ None | Doc gives Pricing **full** `settings` access (`rate/general`, `rate-vip`, `settings-vip`, etc. — pricing approvals route here). No Pacred `pricing` role — `super` only today. | 🔴 Missing role (revenue-relevant — pricing changes touch real rates) |
| 10 | **Marketing / Creative** | 484-497 | ❌ None | 3-leaf settings subset only (`notify` + `popup` + `adjust-words-below-search`). | 🔴 Missing role |
| 11 | **Graphic / Editing** | 501-513 | ❌ None | Extension toolbox only. | 🔴 Missing role (low priority) |
| 12 | **Sales All (Marketing Dept)** | 517-546 | `sales_admin` (loose) | Doc shows a fairly full wallet + customer + 4 cargo modules + commission section. `sales_admin` has the customer block + sales-payouts but `wallet` is also there (matches doc's `กระเป๋าสตางค์` line 524). **Doc's "ตั้งค่า (admin_mew/admin_fogus only)" gate (line 535-537) — Pacred has no equivalent per-admin-account allowlist for `notify`/`popup`.** | 🟡 Partial — per-account notify/popup gate missing |
| 13 | **IT Frontend** | 550-560 | ❌ None | Doc says "Full System Access — same as CEO". In Pacred this would be `super` — acceptable. | 🔴 Missing role (treat as super) |
| 14 | **IT Backend** | 564-570 | ❌ None | Same — treat as `super`. | 🔴 Missing role (treat as super) |
| 15 | **IT Fullstack** | 574-580 | ❌ None | Same — treat as `super`. | 🔴 Missing role (treat as super) |

### CompanyType 2: Freight (13 roles)

| # | Legacy role (doc) | Doc line | Pacred enum mapping | Menu shape gap | Severity |
|---|---|---|---|---|---|
| 16 | Freight Sales Manager | 588-600 | ❌ None | No `freight_*` enum. Freight side is built (sidebar carries `forwarderImport.freight` 2-level dropdown · `accounting.freight` leaf) but no Freight-role users can be assigned. | 🔴 Missing role |
| 17 | Freight Sales | 604-614 | ❌ None | Same | 🔴 Missing role |
| 18 | Export Manager | 618-630 | ❌ None | Same | 🔴 Missing role |
| 19 | CS / Doc Export | 634-644 | ❌ None | Same | 🔴 Missing role |
| 20 | Shipping Doc Export | 648-658 | ❌ None | Same | 🔴 Missing role |
| 21 | Shipping Clearance (Export) | 662-672 | ❌ None | Same | 🔴 Missing role |
| 22 | Shipping Clearance (Import & Export) | 676-686 | ❌ None | Same | 🔴 Missing role |
| 23 | Messenger (Export Dept) | 690-700 | ❌ None | Same | 🔴 Missing role |
| 24 | Import Manager | 704-716 | ❌ None | Same | 🔴 Missing role |
| 25 | CS & Doc Import | 720-730 | ❌ None | Same | 🔴 Missing role |
| 26 | Shipping Doc Import | 734-744 | ❌ None | Same | 🔴 Missing role |
| 27 | Shipping Clearance (Import) | 748-758 | ❌ None | Same | 🔴 Missing role |
| 28 | Messenger (Import Dept) | 762-772 | ❌ None | Same | 🔴 Missing role |

**Note on Freight roles:** all 13 Freight roles in the doc are documented as `[Full Export Operations Access]` / `[Import CS Operations]` etc. — **the doc never enumerates the actual menu items** for any Freight role. This is unclear — `❓ Doc gives only role labels, never the per-role menu trees for Freight`. Until the doc is updated with Freight menu trees, **the 13 missing Pacred roles cannot be ported faithfully** — the spec is incomplete.

### CompanyType 3: Cargo (6 roles)

| # | Legacy role (doc) | Doc line | Pacred enum mapping | Menu shape gap | Severity |
|---|---|---|---|---|---|
| 29 | **Cargo Sales Manager** | 780-788 | `sales_admin` | Doc says "ไฟล์ว่าง — ใช้เมนูเหมือน Sales แต่มีสิทธิ์อนุมัติเพิ่ม" (empty file — same menu as Sales, plus approval rights). Pacred fuses Sales Manager + Sales + Sales All under one bucket. ❓ Unclear if Pacred surfaces the **approval rights** distinct from a regular sales seat. | 🟡 Partial — no Mgr/Staff approval-gate distinction |
| 30 | **Cargo Sales** | 792-870 | `sales_admin` → `menuSalesAdmin` | Doc has full wallet + customers (full 7-leaf nested) + purchasing (6 leaves) + forwarder (Sales View · 5+ items incl. CargoCenter API) + payment + report (Full) + commission. Pacred: wallet is single-leaf · customers is full block (good — `manageCustomers.titleSales`) · purchasing single-leaf (operations moved to page top-menubar) · forwarder is 2-level (Cargo/Freight × FCL/LCL) — **doc's `CargoCenter (New)` / `รายงานตู้สินค้า` / `ประวัติเข้าโกดังไทย` / `มอบงานคนขับรถ` / `รวมบิลสินค้า` operational items are not in the sidebar — relies on page top-menubar.** Per ภูม brief this is sanctioned. The `หมายเหตุฝากสั่ง` + `หมายเหตุนำเข้า` standalone leaves at doc lines 1020-1021 are also collapsed. | 🟢 Match (with sanctioned consolidation) |
| 31 | **CS Purchasing** | 874-920 | `ops` → `menuOps` | Doc has search-member + 4 cargo modules (purchasing + forwarder CS-View + payment) + commission-for-interpreter (CS Purchasing manages interpreter commissions). Pacred `ops` has: `itemQAAll` + customer-search + wallet + purchasing + forwarder + payment + driver-runs(Phase 2). **Doc's `รายการเบิกเงิน (ค่าคอมมิชชั่นล่ามจีน)` parent at line 906-910 is missing from `ops` menu — only `interpreter` role sees commissions today.** That breaks the legacy flow where CS Purchasing **approves** interpreter commissions. | 🟡 Partial — interpreter commission approval path missing for `ops` |
| 32 | **Warehouse Manager** | 924-932 | `warehouse` (same as Staff) | Doc says "ไฟล์ว่าง — ใช้เมนูเหมือน Warehouse Staff + สิทธิ์จัดการเพิ่ม" — same comment pattern as Sales Manager. No Mgr distinction in Pacred. | 🟡 Partial — no Mgr/Staff approval-gate |
| 33 | **Warehouse Staff** | 936-1001 | `warehouse` → `menuWarehouse` | Doc has search-member + wallet + purchasing + forwarder (Warehouse View, 8 items incl. ประวัติเข้าโกดังไทย + เตรียมส่ง + assignDriver + รวมบิลสินค้า + ประวัติใบเสร็จ + add) + standalone `งานที่ต้องส่ง` + `ประวัติงาน` + 2-leaf `ค้นหารายการฝากนำเข้า (Barcode)` + 4-leaf `สแกนบาร์โค้ด` parent + 2 หมายเหตุ standalones + report-driver. Pacred: customer-search + forwarder (full block — Search/Multi/All/whHistory/Prepare/AssignDriver/CombineBill) + `warehouse.containers` (= `/admin/report-cnt` — Option C ภูม 2026-05-20) + `warehouse.bulletin` (Phase 2 extra) + `warehouse.qaInspect` (Phase 2 extra) + `blockBarcode` (full 4-section tree). **Doc's standalone `งานที่ต้องส่ง` (driver-w) and `ประวัติงาน` items are not standalone in `warehouse` menu — folded under `forwarder.assignDriver`.** **`ประวัติใบเสร็จ/ส่งของ` (hs-receipt-forwarder.php, line 964) not visible in sidebar.** **`เพิ่มรายการนำเข้า` (forwarder/add) at doc line 965 has no leaf — relies on page action.** | 🟢 Match (good fidelity — barcode tree complete · forwarder block complete) |
| 34 | **Driver** | 1005-1034 | `driver` → `menuDriver` | Doc has `งานที่ต้องส่ง` + `ประวัติงาน` + `ค้นหารายการฝากนำเข้า` 2-leaf + 2 หมายเหตุ standalones + report-driver-2023. Pacred has 3 leaves: `driver.toDeliver` + `driver.history` + `driver.barcode` (Phase 4). **Doc's `หมายเหตุฝากสั่ง` + `หมายเหตุนำเข้า` standalones (line 1020-1021) and `ออกรายงาน → รายงานคนขับรถ` (line 1023-1024) are missing from Pacred `driver` menu.** Also driver items are Phase-2/4 gated, making them **invisible to a non-super driver login** — see §3 critical finding. | 🟡 Partial + 🔴 critical phase-gating issue |

### Pacred-original (no legacy equivalent)

| # | Pacred enum | Status |
|---|---|---|
| 35 | **`interpreter`** (V-H1 ล่ามจีน commission portal) | ➕ Extra — the doc has no standalone Interpreter role. In legacy PCS, interpreter commissions are **approved by `CS Purchasing`** (doc line 906-910). Pacred carved a dedicated `interpreter` role for the V-H1 portal which is reasonable — but **the approval/payment flow is now split: Pacred `interpreter` sees commissions; legacy `CS Purchasing` (= Pacred `ops`) approved them.** Pacred `ops` menu doesn't surface the interpreter approval queue. |

---

## 3. Critical Findings

### 🔴 CF-1: `driver` role's menu is Phase-2/4-gated and INVISIBLE to a non-super driver login

**File:** `lib/admin/sidebar-menu.ts:658-674`
**Issue:** `menuDriver` defines 3 leaves under "Cargo & Freight" — `driver.toDeliver` (Phase 2), `driver.history` (Phase 2), `driver.barcode` (Phase 4). The phase-gating logic ("Phase 2+ = super only", per the file's own §62-70 comment) means a real driver login sees only Dashboard + Learning (Phase 2) + Extension (incidents, Phase 2) — i.e. **nothing operational**.

**Compare to doc (line 1005-1034):** Driver menu must show `งานที่ต้องส่ง` (active deliveries) + `ประวัติงาน` + barcode tree + 2 หมายเหตุ standalones + report-driver. These are the driver's daily essentials.

**Impact:** A real driver assigned `driver` role would log in and see an empty menu — they can't function. Either un-phase-gate these items for the `driver` role specifically, or move them to Phase 1.

**Recommendation:** Remove `phase: 2/4` from items inside `menuDriver` — they're already filtered by role precedence.

### 🔴 CF-2: No `qa` admin role for QA & QC staffers (doc role #5)

**Files:** `lib/auth/require-admin.ts:35` (enum), `lib/admin/sidebar-menu.ts:325-330` (`itemQAAll`)
**Issue:** Doc role #5 "QA & QC" has 12 SLA-breach queues + a `transferSalesCustomers.php` tool. In Pacred this exists as a single Phase-2 leaf `itemQAAll` visible to `super` only. **There is no `qa` enum value** in `AdminRole`. A dedicated QA staffer must be granted `super` (massive over-privilege — gives them HR, accounting, settings access).

**Doc reference:** line 358-382 (QA section); line 193-231 (CEO sees the same 12 queues).

**Recommendation:** Add `qa` to `AdminRole` enum + define `menuQa` exposing only the QA queues (and possibly `transferSalesCustomers`).

### 🔴 CF-3: No `hr_*` admin role for HR staffers (doc roles #2-3)

**Files:** `lib/auth/require-admin.ts:35`, `lib/admin/sidebar-menu.ts:348-355` (`blockHr`)
**Issue:** Doc roles HR Manager (#2) and HR Staff (#3) have dedicated menu files in legacy PCS. Pacred lumps HR under `super` — `blockHr` exists in `menuSuper` only. An HR-only staffer cannot login without being made `super`.

**Doc references:** lines 304-318 (HR Mgr) + 322-341 (HR Staff).

**Recommendation:** Add `hr_manager` + `hr_staff` to enum + carve `menuHrManager` / `menuHrStaff`. Doc explicitly contrasts the two ("เมนูเหมือน HR Staff + สิทธิ์จัดการเพิ่มเติม", line 308).

### 🔴 CF-4: `interpreter` commission approval flow split between two roles

**Files:** `lib/admin/sidebar-menu.ts:680-693` (`menuInterpreter`), `:516-536` (`menuOps`)
**Issue:** Doc line 906-910 shows **CS Purchasing** (= Pacred `ops`) **approves** interpreter commissions (`/withdraw-commission-interpreter.php?q=1` "อนุมัติรายการ"). Pacred's `ops` menu doesn't surface this leaf — only the `interpreter` role sees `interpreter.commissions`. So the approver (ops) **can't find the queue from the sidebar**.

**Recommendation:** Add interpreter commission approval leaf to `menuOps` (mirror of `withdrawal.interpreterBonus` from `blockWithdrawalList`).

### 🟡 CF-5: All 13 Freight roles missing, but doc spec is incomplete too

**Doc references:** lines 588-772 (CompanyType 2: Freight, roles #16-28).
**Issue:** Doc enumerates Freight role *names + section headers* but never lists the actual sidebar items (every Freight role shows `[Full Export Operations Access]` placeholder). So even if you added `freight_sales_manager` to the enum, **you have no source-of-truth menu to put under it.** This is a documentation gap, not just an implementation gap.

**Recommendation:** Ask พี่เดฟ to extend the doc with the per-role menu trees for Freight roles before porting (the legacy `Freight/SalesManager.php` etc. files are the ground truth — currently un-transcribed in the doc).

---

## 4. Top 5 Priority Sidebar Fixes for ภูม

1. **🔴 P0 — Unblock the `driver` role.** Strip `phase: 2/4` tags from `menuDriver` items (`sidebar-menu.ts:666-669`). A real driver currently sees no operational items. Doc line 1005-1034 is the target shape.

2. **🔴 P0 — Add interpreter-commission approval leaf to `menuOps`.** Mirror `withdrawal.interpreterBonus` from `blockWithdrawalList` (`sidebar-menu.ts:376`) into `menuOps`'s "Cargo & Freight" section. Doc line 906-910 mandates that CS Purchasing (= ops) is the approver. Without this, the approval queue is invisible to its owner.

3. **🟡 P1 — Add `qa` to `AdminRole` enum + carve `menuQa`.** Doc role #5 (line 358-382) is a real PCS workspace with 12 SLA queues + the sales-rep transfer tool. Today it's `super`-only. Define `menuQa = [dashboard, itemQAAll, customers/transfer-rep, learning, extension(incidents)]`. Update `requireAdmin` enum + `ROLE_PRECEDENCE` (insert `qa` between `accounting` and `ops`).

4. **🟡 P1 — Add `hr_manager` + `hr_staff` enum values + per-role menus.** Doc roles #2-3 (line 304-341) — `menuHrManager` = full `blockHr` + Learning + Extension; `menuHrStaff` = `blockHr` (subset — show humanResource only, not assets) + Extension (limited). Doc explicitly differentiates the two.

5. **🟡 P2 — Restore driver-specific items in `menuWarehouse`/`menuDriver`.** Doc warehouse line 988 (หมายเหตุฝากสั่ง standalone) + 989 (หมายเหตุนำเข้า standalone) + 990-991 (ออกรายงาน → รายงานคนขับรถ) are missing. These were live in legacy PCS. Add either as page top-menubar items or sidebar leaves.

**Bonus / lower-priority:**
- 🟢 P3 — Add an admin-level bank-accounts page (`admin-acc.php`, doc line 152) somewhere under HR or `super` settings. Currently no Pacred route.
- 🟢 P3 — Surface `refund-to-wallet` under `accounting` sidebar (doc line 406-408) — Manager-level access only. Currently relies on `/admin/accounting/cargo` page top-menubar which this audit didn't verify exists.
- ❓ — Decide whether the legacy `admin_mew/admin_fogus`-only settings allowlist (doc line 535, 852) is worth porting. It's per-admin-account allowlist on top of role — Pacred has no equivalent today.

---

## 5. Quotes from the Doc (ภูม-targeted / load-bearing)

> "**Purpose:** ระบุ sidebar menu ของแต่ละ role ใน Admin System สำหรับใช้ build Next.js"
> — line 5 — **the doc's entire purpose is to be ภูม's reference for menu building**

> "left-menu.php → switch(companyType) → switch(department) → switch(section)"
> — line 57 — **the canonical legacy routing key (3-tuple, not a single role enum)**

> "ไฟล์ว่าง — ใช้เมนูเหมือน Sales แต่มีสิทธิ์อนุมัติเพิ่ม"
> — line 784 (Cargo Sales Manager #29), repeated line 928 (Warehouse Manager #32) — **legacy Manager roles inherit Staff menu + an approval flag. Pacred's current design has no in-menu signalling of this — Mgr/Staff distinction is invisible.**

> "[Same as Cargo Sales + additional approval rights]"
> — line 787 — **same pattern as above — read once, apply to all "Manager" tiers**

> "เมนูเหมือน HR Staff + สิทธิ์จัดการเพิ่มเติม (approve leave, salary management)"
> — line 308 (HR Manager #2) — **HR Mgr/Staff distinction is real and load-bearing — approve-leave and salary-mgmt are restricted to Manager**

> "Settings (admin_mew / admin_fogus only)"
> — line 535 (Sales All) + line 852 (Cargo Sales) — **legacy has a per-admin-account allowlist for `notify`/`popup` access on top of role gating. Pacred has no equivalent.**

> "Shared Menu Modules (OOP Components) — เมนูที่ใช้ร่วมกันหลาย role ผ่าน `require_once`"
> — line 1038-1040 — **the legacy menu-block reuse pattern. ภูม's implementation faithfully mirrors this (`blockWithdrawalList`, `blockAccounting`, `blockBarcode`, etc.) — good shape.**

> "เอกสารนี้ compile จาก `left-menu.php` + ไฟล์ OOP ทั้งหมดใน `include/pages/left-menu/`"
> — line 1302 — **doc provenance: traceable to legacy source files; treat as ground truth.**

---

## 6. Confirmation: Role List Match

| Pacred `AdminRole` enum value | Doc role mapping | Match? |
|---|---|---|
| `super` | CEO #1 | 🟢 Direct match |
| `ops` | CS Purchasing #31 | 🟢 Direct match (with interpreter-approval gap noted in CF-4) |
| `accounting` | Accounting Manager #6 + Staff #7 (fused) | 🟡 Partial — no Mgr/Staff sub-distinction |
| `sales_admin` | Cargo Sales Mgr #29 + Cargo Sales #30 + Sales All #12 (fused) | 🟡 Partial — three legacy roles compressed |
| `warehouse` | Warehouse Mgr #32 + Warehouse Staff #33 (fused) | 🟡 Partial — no Mgr/Staff sub-distinction |
| `driver` | Driver #34 | 🟢 Direct match (but phase-gated invisibility — CF-1) |
| `interpreter` | ➕ Pacred-original (no legacy role; legacy interpreter commissions approved by CS Purchasing) | ➕ Extra |
| (missing) | HR Mgr #2 + HR Staff #3 | 🔴 No mapping (CF-3) |
| (missing) | QA & QC #5 | 🔴 No mapping (CF-2) |
| (missing) | Marketing #8 + Pricing #9 + Marketing/Creative #10 + Graphic #11 | 🔴 No mapping (4 roles) |
| (missing) | IT Frontend/Backend/Fullstack #13/14/15 | 🔴 No mapping (treated as `super` — acceptable) |
| (missing) | Maid #4 | 🔴 No mapping (low priority) |
| (missing) | All 13 Freight roles #16-28 | 🔴 No mapping (doc spec also incomplete — CF-5) |

**Note about the user's prompt:** the prompt lists the Pacred role enum as `super/ops/accounting/sales_admin/sales/warehouse/driver/interpreter` (8 roles, with `sales`). **The actual enum in `lib/auth/require-admin.ts:35` defines 7 — there is no `sales` value, only `sales_admin`.** Flagging as a potential confusion in the prompt itself.

---

## 7. Verification

- `pnpm tsc --noEmit` → clean before this audit · clean after (no code touched).
- This audit is **read-only**. Files inspected:
  - `lib/admin/sidebar-menu.ts` (750 LOC)
  - `lib/auth/require-admin.ts` (84 LOC)
  - `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\N'POOM - PCS LEARNNING\PCS_ADMIN_ROLES_AND_MENUS.md` (1,303 lines)

---

*Audit produced 2026-05-20 by Agent Y. Owner of follow-up: ภูม.*
*Cross-references: `docs/audit/parity-admin-table.md`, `docs/audit/parity-admin-profile.md`, `docs/runbook/faithful-port-plan.md`, `docs/runbook/faithful-port-transcription.md`.*
