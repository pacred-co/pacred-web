# Audit F — Legacy PCS admin menu structure (the canonical IA)

> Read-only audit of the legacy PCS Cargo PHP app's admin menus.
> The D1 target — Pacred's sidebar should mirror this IA so PCS staff
> + customers need zero retraining (per ADR-0017).
>
> **Source: FALLBACK TO DOCS.** The legacy PHP root
> (`C:\xampp\htdocs\pcscargo\member\pcs-admin\`) is not present on this
> Windows worktree (`Test-Path` = `False`). The IA below is reconstructed
> from the prior 4-agent deep-sweep on เดฟ's machine, captured in:
>
> - `docs/research/d1-fidelity-admin.md` §1–11 (the per-module fidelity
>   audit, authoritative on every menu item, sub-item, badge, and legacy
>   PHP file reference)
> - `docs/research/sidebar-fidelity-audit/01-broken-links.md` (per-href
>   legacy-equivalent rows)
> - `docs/research/sidebar-fidelity-audit/02-wallet-withdrawal-pattern.md`
>   (wallet + withdrawal-list canonical inventory)
> - `docs/research/sidebar-fidelity-audit/03-mislinks.md` (full inventory
>   of which sidebar items legacy implements vs Pacred today)
> - `docs/audit/legacy-cleanup-2026-05-16.md` (PHP file inventory + scrub
>   candidates — disambiguates which legacy files are "live menu" vs dead)
> - `lib/admin/sidebar-menu.ts` (Pacred's current reconstruction of the
>   legacy OOP blocks — comment-traced back to each legacy `OOP/*.php`)
>
> Because the source is documentation derived from a deep-sweep (not a
> first-hand parse of `<li>`/`<a>` tags in this session), treat individual
> sub-items as **high-confidence but second-hand** — the structural
> claims (six fixed section headers, the OOP-block decomposition, the
> 22-distinct-sidebar role model) are corroborated across multiple docs,
> but spot-checking any one menu file's exact item order should happen
> against the live PHP before the synthesis ships.
>
> **No code changes.** Synthesis is `07-IA-restructure-proposal.md`
> (TBD). Companion audits: `04-workspace-inventory.md` (TBD) ·
> `05-sidebar-map.md` (TBD).

---

## 1. Top-level menu structure

Legacy PCS admin is **RBAC-switched, not role-filtered.** On login,
`include/left-menu.php` (≈156 LOC) reads a `company / department /
section` triple from `tb_admin` (`companyType` 1-3, `department` 0-6,
`section` 0-18) and `require_once`s **exactly one** purpose-built menu
PHP per (company, dept, section) combination. The result is **≈22
distinct sidebars**, each hand-built under
`include/pages/left-menu/<company>/<dept>/<section>.php`, which in turn
`require_once`s reusable **OOP menu blocks** from
`include/pages/left-menu/OOP/`.

The `companyType` axis carves the universe into three:

```
companyType 1 = CargoAndFreight   → CEO / HR(×3) / QAAndQC(×3) / Accounting(×2) / Marketing(×5) / ITDT(×3)
companyType 2 = Freight           → SaleFreight(×2) / FreightExport(×6) / FreightImport(×6)
companyType 3 = Cargo             → SaleCargo(×2) / CSPurchasing(×2) / Warehouse(×3)
```

Within every assembled sidebar, items are grouped under **six fixed
navigation-headers** (English short-form, displayed as section dividers
in the dark accordion sidebar):

1. **Cargo & Freight** — cross-company shared management (HR, QA, cross-customer admin, the `รายการเบิกเงิน` payouts hub)
2. **Freight** — international FCL / LCL / customs / export
3. **Cargo** — China shopping cart · ฝากสั่ง · ฝากนำเข้า · ฝากโอน · wallet · cargo reports + accounting
4. **Settings** — system config (rates, popups, VIP tiers, ประกาศหน้าแรก)
5. **Learning** — internal training (กฏระเบียบ, การอบรม, newsfeed, TOS)
6. **Extension** — staff toolbox (เช็คนิติบุคคล, เช็คขนส่งไทย, จองห้องประชุม, ประวัติการทำรายการ)

The CEO menu (`CargoAndFreight/CEO/CEO.php`) is the **fullest** view —
it includes every section. Most role menus include 1–3 sections (e.g. a
Warehouse worker's sidebar omits Freight + Accounting + Marketing
entirely and shows a tight Cargo-only tree).

The full canonical CEO shape, reproduced from `d1-fidelity-admin.md`
§1.1:

```
Dashboard (All / Freight / Cargo) ─ a 3-way switcher (index.php?c=…)
── header: "Cargo & Freight" ──
  ฝ่ายทรัพยากรบุคคล · QA & QC · จัดการลูกค้า · รายการเบิกเงิน
── header: "Freight" ──
  ระบบบัญชี Freight
── header: "Cargo" ──
  กระเป๋าสตางค์ · ฝากสั่งสินค้า · ฝากนำเข้า · ฝากโอน/ชำระ · ออกรายงาน · บัญชี Cargo
── header: "Settings" ──
  ตั้งค่าระบบ Cargo
── header: "Learning" ──
  กฏระเบียบ · การอบรม · newsfeed · TOS
── header: "Extension" ──
  เช็คนิติบุคคล · เช็คขนส่งไทย · จองห้องประชุม · ประวัติการทำรายการ
```

**Top-of-sidebar block (every sidebar):** a circular avatar with the
admin's `adminID`, a role badge (the human-readable `nameCompanyType` +
`nameAdminType` + dept/section name), and a dropdown holding `โปรไฟล์ ·
ตั้งค่าบัญชี · Line Notify เชื่อม/ยกเลิก · ออกจากระบบ`. **Visual:**
ThemeForest "Modern Admin" Bootstrap-4 — dark fixed accordion sidebar
(`menu-fixed menu-dark menu-accordion`), `la la-*` / `ft-*` icons.

**Universal pattern — live-count badges.** Almost every queue item
carries a `badgeMenu($count)` red pill (`บริการฝากนำเข้า ⑫`, `รายการ
ถอนเงิน ③`, `อนุมัติรายการ ⑤`, `สมาชิกนิติบุคคล ⑫`, …). Counts are
computed once per page in `header.php` / the menu file head, so the
sidebar is the staff's primary work-radar across the whole admin.

---

## 2. Per-group menu trees

The trees below are reconstructed from the OOP menu blocks (each block
= one `include/pages/left-menu/OOP/*.php` file). For each block I list
the canonical Thai labels exactly as they appear in legacy, the legacy
PHP entry the link opens, and (where present in legacy) the badge.

### 2.1 Cargo & Freight (cross-company shared)

#### 2.1.1 `OOP/CargoAndFreight/menu-hr-manage-human-resource.php` — ฝ่ายทรัพยากรบุคคล

- ผังองค์กร → `organization-chart.php` (visual chart)
  - ตาราง → `organization-table.php` (alt view)
- สรรหาบุคคล → `recruitment/`
- ทรัพยากรบุคคล → `admin-table.php` (list)
  - พนักงานทั้งหมด · พนักงานประจำ · พนักงานฝึกงาน · Partner (with truck-type sub-tree) · พนักงานที่ลาออก · บัญชีธนาคารพนักงาน · Line-notify token list
- รายงานการเข้าทำงาน → `time-attendance-system.php`
  - วันหยุด · การลา · บันทึกเวลา · KPI · โบนัส · เงินเดือน

#### 2.1.2 `OOP/CargoAndFreight/menu-hr-manage-corporate-assets.php` — ทรัพย์สินบริษัท

- ซ่อมบำรุง → `contact-list-outsider/` (รายชื่อติดต่อภายนอก)
- จัดซื้อ → `disbursement-of-expenses/` (ลงเบิกค่าใช้จ่าย)
- สต๊อกของใช้ → stock pages
- เครื่องมือ → org-tools sub-tree:
  - `organization-tell/` (เบอร์)
  - `organization-email/`
  - `organization-line/`
  - `organization-wechat/`
  - `organization-domainname/`

#### 2.1.3 `OOP/Cargo/menu-QAAndQC.php` — QA & QC (the 11 SLA-breach queues)

Each item points at `<page>.php?s=1` (the to-do queue, badge-counted) +
`<page>.php` (the follow-up history view):

- รอชำระเกิน 1 วัน ③ (badge)
- รอชำระค่านำเข้าเกิน 2 วัน ③
- ยกเลิกออเดอร์
- เครดิตเกินกำหนด ③
- สั่งซื้อรอเกิน 10 นาที
- รอร้านจีนส่งเกิน 2 วัน
- รอเข้าโกดังจีนเกิน 2 วัน
- กำลังมาไทยเกินกำหนด
- สินค้าไม่มีเจ้าของ
- เตรียมส่งเกินกำหนด
- ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน
- ย้ายเซลล์ → `transferSalesCustomers.php` (single + group with edit history)

#### 2.1.4 `OOP/CargoAndFreight/menu-user.php` — จัดการลูกค้า

- ลูกค้า PCS Cargo → wraps the cargo customer segment list (see §2.3.7)
- ลูกค้า PCS Freight → freight customer list (per `OOP/Freight/menu-user.php`)

#### 2.1.5 `OOP/CargoAndFreight/menu-withdrawal-list.php` — รายการเบิกเงิน

Two top-level rows (Freight vs Cargo), each with sub-items. From
`02-wallet-withdrawal-pattern.md` §1.2:

- **PCS Freight** → `forwarder-sales` / `acc-freight-*`
- **PCS Cargo** ⤵
  - เบิกเงินค่าสินค้า ③ → `acc-shop-refund.php` (payouts) — tbl `tb_sale_*`
  - ค่าตู้สินค้า ③ → `acc-system-cargo` / `cnt-hs.php` — tbl `tb_cnt` disbursements
  - ค่าขนส่งไทย → `acc-forwarder.php` (TH leg) — tbl `tb_forwarder_truck`
  - รายงานลูกค้าตัวแทน → `user-history.php` (agent CST view) — tbl `tb_user`
  - โบนัสเซลล์ ③ → `withdraw-commission-sales` — tbl `tb_sales_commission`
  - โบนัสล่ามจีน ③ → `withdraw-commission-interpreter` — tbl `tb_inter_commission`
  - พนักงานขับรถ → `report-driver*.php` — tbl `tb_driver_run`

Each sub-row has its own อนุมัติ(badge) / ประวัติ pair on its destination page.

### 2.2 Freight

#### 2.2.1 `OOP/Freight/menu-acc.php` — ระบบบัญชี Freight

- รายการเดินบัญชี
- รายรับ ⤵
  - ใบเสนอราคา
  - ใบแจ้งหนี้
  - ใบเสร็จ
  - ใบหัก ณ ที่จ่าย (WHT)
  - ภาพรวม

(Plus the freight customer list under `OOP/Freight/menu-user.php`,
already counted in §2.1.4 above.)

### 2.3 Cargo

#### 2.3.1 `OOP/Cargo/menu-wallet.php` — กระเป๋าสตางค์

From `02-wallet-withdrawal-pattern.md` §1.1:

- เป๋าตังทั้งหมด → `wallet/` — tbl `tb_wallet` (all kinds, all statuses)
- จ่ายแทนลูกค้า → `pay-users.php` — tbl `tb_wallet` (kind=payment, staff-initiated)
- ประวัติรายการ → `wallet/history/` — tbl `tb_wallet` (completed only)
- รายการถอนเงิน ③ → `wallet/withdraw/` — tbl `tb_wallet_withdraw` (badge = pending count)
- รายการเติมเงิน ③ → `wallet/deposit/` — tbl `tb_wallet_topup` (badge = pending count)
- เพิ่มรายการเติมเงิน → `wallet/add/` — manual staff topup, INSERTs `tb_wallet_topup`

#### 2.3.2 `OOP/Cargo/menu-purchasing.php` — บริการฝากสั่งสินค้า

- ค้นหา → `shop-search.php` (dedicated single-input search page)
- ทั้งหมด → `shops/` (the cargo order list)
- รอดำเนินการ ③ → `shops/?q=1` (the legacy 6-status tab strip; badge = `hStatus=1` count)
- รถเข็น → `cart/` (admin views a customer's cart, can act ON it)
- เพิ่มสินค้าในรถเข็น → `cart/add/` (admin pushes an item into a customer's cart, supports up to ~151 items)
- หมายเหตุฝากสั่ง ③ → `forwarder-action.php?action=NoteShop` (badge = `hNote<>'' AND hStatus NOT IN (5,6)`)

Underlying table: `tb_header_order.hStatus` 1-6 = (รอดำเนินการ ·
รอชำระเงิน · สั่งสินค้า · รอร้านจีนจัดส่ง · สำเร็จ · ยกเลิก). Order
PK = `P<id>`.

#### 2.3.3 `OOP/Cargo/menu-forwarder.php` — บริการฝากนำเข้า

The most complex Cargo menu — 12+ rows, multiple badges:

- ค้นหา → `forwarder-search.php` (single-search page)
- ค้นหาหลายรายการ → `forwarder-search-muti.php` (paste a list of tracking nos)
- รายการนำเข้า (accordion) ⤵
  - ทั้งหมด → `forwarder.php` (the 11-tab status DataTable)
  - เตรียมส่ง ③ → `forwarder.php?q=6` (badge = `fStatus=6` count)
  - เครดิตสินค้า → `forwarder.php?q=c` (pseudo-tab)
  - เพิ่ม → `forwarder/add/` (admin onboard a parcel; `fShipBy='PCS'` auto-fills PCS BKK warehouse address)
- หมายเหตุนำเข้า ③ → `forwarder-action.php?action=Note` (badge = `fNote<>'' AND fStatus<>7`)
- อัปเดตฝากนำเข้า (API) → `OOP/Cargo/menu-up-sheet.php`:
  - CargoCenter → `api-forwarder-cn.php` (Dashboard / API-SM / manual update / history)
  - CTT / Sang / MK / MX sheets → 4 separate `api-sheets-{ctt,sang,mk,mx}.php` adjusters
  - JMF → `api-forwarder-jmf.php`
  - GOGO → `api-forwarder-gogo.php`
- เช็คต้นทุนตู้ Sheet → `check-sang-cost.php` (Sheet-based cost audit)
- รายงานตู้สินค้า → `report-cnt.php` (group forwarders by `fCabinetNumber` → record container payment)
- ประวัติเข้าโกดังไทย ③ → `forwarder-import-warehouse.php` (badge = scan-error reconciliation queue)
- มอบงานคนขับรถ ③ → `forwarder-driver.php` (badge = unassigned `tb_forwarder_driver_item`)
- รวมบิลสินค้า → `forwarder-bill.php` (multi-row → ONE printed bill, mPDF/THSarabunNew)
- สแกนบาร์โค้ด → expands to the 8-variant `OOP/Cargo/menu-barcode.php` (see §2.3.5)

Status enum `tb_forwarder.fStatus`: `1` รอเข้าโกดังจีน · `2`
ถึงโกดังจีนแล้ว · `3` กำลังส่งมาไทย · `4` ถึงไทยแล้ว · `5` รอชำระเงิน
(pay-AFTER-arrival, cargo COD) · `6` เตรียมส่ง · `6.1` กำลังจัดส่ง ·
`7` ส่งแล้ว ; plus `c` เครดิตสินค้า, `p`/`99` สถานะพิเศษ. Sub-flags:
`fStatusCarOn`/`fStatusCarOff` (ขึ้นรถ/ลงรถ truck-load badges). Every
status change writes `tb_log_forwarder_status` (old→new + adminID).

#### 2.3.4 `OOP/Cargo/menu-payment.php` — บริการฝากโอน/ชำระ

- รายการฝากชำระ ① → `payment/` — tab list + DataTable (badge = pending)
- เพิ่มรายการ → `payment/add/` (admin-create yuan transfer / MOMO payment on behalf of a customer; CNY + recipient channel + slip)

Status enum: the MOMO/transfer state-machine (see
`docs/audit/chat-analysis-2026-05-16.md` §MOMO canonical).

#### 2.3.5 `OOP/Cargo/menu-barcode.php` — สแกนบาร์โค้ด

An 8-variant scan family (4 task modes × 2 input modes), nested as
accordion sub-sub-items:

- ค้นหาฝากนำเข้า ⤵
  - ด้วยเครื่องสแกน → `barcode-d-all.php`
  - ด้วยกล้อง → `barcode-c-all.php`
- บันทึกเข้าโกดัง → `barcode-d-import.php` (the auto-flip-to-`fStatus=4` page; green=matched, orange+sound=unmatched, captures `fPallet`/shelf)
- ค้นหาเตรียมส่ง ⤵
  - ด้วยเครื่อง → `barcode-d-prepare.php`
  - ด้วยกล้อง → `barcode-c-prepare.php`
- สแกนจากหน้ากล่อง ⤵
  - ด้วยเครื่อง → `barcode-d-from.php`
  - ด้วยกล้อง → `barcode-c-from.php`

#### 2.3.6 `OOP/Cargo/menu-report.php` — ออกรายงาน

- ฝากสั่ง / ฝากนำเข้า / ฝากโอน — 3 separate report entries
- ยอดพนักงานขาย → `report-sales-by-rep.php`
- ยอดรวมทุกบริการ → `report-revenue-total.php`
- ยอดรวมตามรหัส → `report-user-sales-history.php`
- รายงานคนขับ → `report-driver*.php`
- การเข้าถึงเว็บ → `report-system.php` (+ API-จีน access + ค้นหา sub-pages)
- รายงานโปรโมชัน → 3 separate promo reports (1212 / anniversary / Halloween / survey — per `legacy-cleanup-2026-05-16.md`)
- SMS → `report-api-sms.php`
- OTP → `report-otp-*.php` (ไม่ผ่าน + ผ่าน, 2 reports)

#### 2.3.7 `OOP/Cargo/menu-acc.php` — รายงานรับรู้รายได้ Cargo / ระบบบัญชี Cargo

- รายรับ-รายจ่าย → `acc-system.php` ⤵
  - ประวัติ · รายรับ · รายจ่าย
- เติมเงิน → `acc-topup.php`
- ฝากสั่ง → `acc-shop.php`
- ฝากนำเข้า → `acc-forwarder.php` ⤵
  - ใบแจ้งหนี้ → `hs-forwarder-invoice.php`
  - ประวัติใบเสร็จ → `hs-receipt-forwarder.php` + `hs-forwarder-receipt.php`
  - ยอด → `acc-forwarder-total.php`
- ฝากชำระ → `acc-payment.php`
- ถอนเงิน → `acc-withdraw.php`
- คืนเงินเข้า Wallet ⤵
  - ฝากสั่ง → `acc-shop-refund.php`
  - ฝากนำเข้า → `acc-forwarder-refund.php`
- ระบบบัญชี Cargo (the parent header) → `acc-system-cargo.php` (the page from the screenshot ภูม showed — has its own internal top-bar)

#### 2.3.8 `OOP/Cargo/menu-user.php` — สมาชิก (Cargo customer segments)

- ค้นหารหัส → `users-search.php` (dedicated single-search page)
- สมาชิกทั้งหมด → `users/all/`
- สมาชิกทั่วไป → `users/general/`
- สมาชิก VIP → `users/vip/`
- สมาชิก SVIP → `users/svip/`
- สมาชิกนิติบุคคล ⑫ → `users/corporation/` (badge = `countComp`, juristic-approval queue)
- สมาชิกเครดิต → `users/credit/`
- สมาชิกคิดค่าเทียบ → `users/comparison/`

### 2.4 Settings

#### 2.4.1 `OOP/Cargo/menu-settings.php` — ตั้งค่าระบบ Cargo

- ทั่วไป → `settings/`
- ประกาศหน้าแรก → `notify/` (the yuan-rate banner on the home)
- Popup → `popup/` (customer-facing popup announcement)
- อัตราค่าขนส่ง ⤵
  - ทั่วไป → general rate sheet
  - VIP → VIP rate sheet
- ประเภทสมาชิก VIP → `settings-vip/` (tier config)
- ปรับคำใต้ช่องค้นหา → `adjust-words-below-search.php`

### 2.5 Learning

#### 2.5.1 `OOP/Learning/*`

- กฏระเบียบและสัญญา → `corporatePolicyManager/`, `contract`
- การอบรม ⤵
  - Business Plan → `businessPlan.php`
  - วัฒนธรรมองค์กร → `corporateCulture.php`
  - ผังงาน Job งาน → `jobFlowchart.php`
- newsfeed → news content
- TOS → `termsOfServiceCargo.php`

### 2.6 Extension

#### 2.6.1 `OOP/Extension/*`

- เช็คนิติบุคคล → `check-juristic.php` (DBD juristic-id lookup)
- เช็คขนส่งไทย (5 sub-tools):
  - `check-customer-maomao-free.php` / `check-customer-maomao-vip.php` (MaoMao tier audit)
  - `check-customer-shipby-freedom.php` (Freedom carrier audit)
  - `check-price-flash.php` (Flash price audit)
  - `check-shipby.php` (general ShipBy audit)
  - `check-payMethod.php` (pay-method audit)
- จองห้องประชุม → `booking-meeting-room.php` (calendar booking)
- ประวัติการทำรายการ → `history.php` + `hs-customrate.php` (the `tb_log` business-transaction viewer + rate-change history)

---

## 3. Cross-section observations

- **Nesting depth: up to 3 levels** below the section header. Worked
  examples — `Cargo → ฝากนำเข้า → รายการนำเข้า → ทั้งหมด/เตรียมส่ง/
  เครดิต/เพิ่ม` (3-deep), `Cargo → สแกนบาร์โค้ด → ค้นหาฝากนำเข้า →
  ด้วยเครื่อง/ด้วยกล้อง` (3-deep). Most items live 1–2 levels deep;
  the deepest pockets are the barcode scan family, the
  forwarder list+actions, and the accounting tree.
- **Sidebar shape: vertical accordion, NOT top-bar.** The legacy app
  uses ThemeForest "Modern Admin" Bootstrap-4 — `menu-fixed menu-dark
  menu-accordion` — left-rail expanding sections. The exception is
  `acc-system-cargo.php` (the page in the screenshot ภูม showed),
  which is a single accounting *page* that adds its own internal
  top-bar of acc-subpages above the main content. The screenshot shows
  the latter; the global IA is the dark left rail.
- **Per-role hard partition, not soft filter.** A Warehouse worker
  literally does NOT have a `require_once` for `menu-acc.php`, so
  there is no Settings/Learning/Extension/Accounting visible to them.
  Pacred's current `roles?.some(...)` filter approach produces a
  similar shape but the *array* itself is one piece — legacy
  effectively ships ~22 disjoint trees compiled by `left-menu.php`.
- **Items DO appear in multiple menus.** Cross-pollination examples:
  - `ย้ายเซลล์` (transferSalesCustomers) lives on the QA menu,
    not under จัดการลูกค้า — surprising placement that Pacred mirrors
    by exposing it as `customers/transfer-rep` (legacy menu shape
    would put it inside QA).
  - The barcode scan family (8 entries) ALSO appears as a single
    `สแกนบาร์โค้ด` row inside `menu-forwarder.php` — staff can reach
    it from either ฝากนำเข้า or its own group.
  - `รายงานคนขับ` appears in both `menu-report.php` (ออกรายงาน) and
    `menu-withdrawal-list.php` (พนักงานขับรถ row).
  - `ลูกค้า PCS Cargo` segments live under both `menu-user.php`
    (segment-by-tier) AND `menu-withdrawal-list.php` (รายงานลูกค้า
    ตัวแทน) — different filter, same underlying table.
- **Live-count badges on nearly every queue item.** Pulled once per
  page load in `header.php` / each menu file's head. Without these,
  staff lose their work radar — `d1-fidelity-admin.md` §1.4 calls this
  *the #1 daily-workflow regression* in Pacred today.
- **Search items are dedicated sidebar entries.** `users-search.php`,
  `shop-search.php`, `forwarder-search.php`, `forwarder-search-muti.php`
  are each their own menu row (not inline search bars). Pacred has
  collapsed these to inline search boxes on the list pages — saves a
  page but changes muscle memory.
- **The accounting menu is the densest tree.** `menu-acc.php` has 8
  top items + 2-3 sub-items each = ~20 leaf endpoints (invoice,
  receipt, refund-shop, refund-forwarder, withdraw, topup, ฝากสั่ง
  income, ฝากนำเข้า income, ฝากโอน income, etc.). The screenshot ภูม
  showed (`acc-system-cargo.php`) is the parent landing of this tree.
- **The "Extension" section IS the staff's daily toolbox.** Counter to
  the EN word "extension" implying "optional", this section holds
  daily-used utilities — `check-juristic`, the 5 Thai-carrier audit
  tools, business-transaction history. Pacred has only a few of these
  scattered; the synthesis should preserve the section's existence.
- **`ระบบบัญชี Cargo` and `ระบบบัญชี Freight` are TWO separate
  parent links.** Legacy treats them as different top-of-section
  destinations (cargo accounting + freight accounting are different
  back-offices). Pacred merges into one `/admin/accounting`.

---

## 4. Per-section item count

Counts are leaf items only (not headers); accordion parents that *open*
to sub-rows are not counted on their own (only their children are).

| Section / OOP block                                    | Section header | # leaf items | Deepest nesting |
|---|---|---|---|
| `menu-hr-manage-human-resource.php`                    | Cargo & Freight | 11           | 3 (รายงานเข้างาน → KPI/โบนัส/เงินเดือน) |
| `menu-hr-manage-corporate-assets.php`                  | Cargo & Freight |  9           | 2 (เครื่องมือ → org-* sub-items) |
| `menu-QAAndQC.php`                                     | Cargo & Freight | 12           | 2 (each queue with to-do/history)        |
| `menu-user.php` (cross-company wrapper)                | Cargo & Freight |  2 (Cargo / Freight customer entries) | 2 (segment children) |
| `menu-withdrawal-list.php`                             | Cargo & Freight |  8 (1 Freight + 7 Cargo sub-rows) | 2 |
| `menu-acc.php` (Freight)                               | Freight         |  6 (1 + 5 รายรับ sub-items)          | 2 |
| `menu-user.php` (Freight)                              | Freight         |  1                                   | 1 |
| `menu-wallet.php`                                      | Cargo           |  6                                   | 1 |
| `menu-purchasing.php`                                  | Cargo           |  6                                   | 1 |
| `menu-forwarder.php` (incl. up-sheet sub-tree)         | Cargo           | 12 (+ ~7 in `menu-up-sheet.php`)     | 3 |
| `menu-payment.php`                                     | Cargo           |  2                                   | 1 |
| `menu-barcode.php`                                     | Cargo           |  8 (4 task modes × 2 input modes)    | 3 |
| `menu-report.php`                                      | Cargo           | 11                                   | 1 |
| `menu-acc.php` (Cargo)                                 | Cargo           | ~14 (8 parents + nested refund / invoice / receipt sub-items) | 2 |
| `menu-user.php` (Cargo segment list)                   | Cargo           |  8                                   | 1 |
| `menu-settings.php`                                    | Settings        |  7                                   | 2 (อัตราค่าขนส่ง → ทั่วไป/VIP) |
| `OOP/Learning/*`                                       | Learning        |  6 (regs/contract + 3 training + newsfeed + TOS) | 2 |
| `OOP/Extension/*`                                      | Extension       |  8 (juristic + 5 carrier-checks + booking + history) | 1 |
| **Total (CEO sidebar — the union)**                    | —               | **~135 leaf items across 6 sections** | 3 |

Per-role sidebars are MUCH smaller (a Warehouse worker sees ~20
items; a Sales rep ~25), because they include only 1–3 sections of
the six.

For comparison, Pacred today (`lib/admin/sidebar-menu.ts`) ships
**~118 unique hrefs** in one filtered array — close in count, but
flattened into a single (≈12-heading) ad-hoc-Thai grouping rather
than the legacy 6-fixed-English-header tree.

---

## 5. Synthesis input — what to keep, what to flatten

**Keep — these are non-negotiable for zero-retraining:**

1. **The six fixed section headers** (`Cargo & Freight / Freight /
   Cargo / Settings / Learning / Extension`). They are English
   short-form, staff have years of muscle memory for them. Pacred's
   current ad-hoc Thai groups (`ภาพรวม / กระดานงาน / รีพอร์ตเฉพาะกิจ
   / …`) must go back to this exact six.
2. **Live-count badges on every queue item.** The single biggest UX
   regression in Pacred. The `BadgeKey` type in `sidebar-menu.ts` is
   already correctly modelled (lines 31-56) — the synthesis just
   needs to wire every legacy badge into a Pacred queue.
3. **The dedicated search items** as separate sidebar rows for at
   least the 3 high-traffic ones (`users-search`, `shop-search`,
   `forwarder-search`). Inline search boxes survive on the list pages
   but the sidebar items have to exist (per
   `01-broken-links.md` rows `/admin/customers/search`,
   `/admin/forwarders/search`, `/admin/service-orders/search`).
4. **The cross-pollinated items** — `ย้ายเซลล์` in QA, `รายงานคนขับ`
   in two menus, barcode visible from both forwarder and its own group.
   Don't deduplicate; the duplication is the legacy convenience staff
   rely on.
5. **The full forwarder 11-tab strip** including `6.1 กำลังจัดส่ง`,
   `c` เครดิตสินค้า, `p`/`99` สถานะพิเศษ. These are sidebar entries
   AND tab views.
6. **Two separate accounting parents** — `ระบบบัญชี Cargo` and
   `ระบบบัญชี Freight`. Pacred's single `/admin/accounting` should
   either split or expose two parent entry points.
7. **The Learning + Extension sections.** Pacred has them collapsed to
   `/admin/learning` and `/admin/juristic-check`; the sections need
   re-expanding (per `01-broken-links.md` and `d1-fidelity-admin.md`
   §11 "Other legacy modules").

**Flatten / safely simplify:**

1. **The 22-distinct-sidebar role model.** Pacred's `AdminRole` enum
   (7 values + `super`) + `roles?.some(...)` filter is the right
   pragmatic shape. The synthesis doesn't need to re-introduce the
   `company/department/section` triple — it just needs to make sure
   each role sees roughly the same items the legacy role would.
2. **The dark-Bootstrap-4 vs light-Tailwind theme.** Owner reference
   is dark; the synthesis recommends defaulting to dark BUT this is
   a visual layer, not IA.
3. **The auto-update API tools** (`api-forwarder-cn.php`, the 4
   sheet adjusters, JMF, GOGO). These are deep-leaf utilities used
   by IT-DT only; they can live in a single "อัปเดตข้อมูล (API)"
   accordion within the forwarder section rather than a fully
   expanded sub-tree. Faithful in concept; flattened in nesting.
4. **The 8-variant barcode tree.** Pacred has one `/admin/barcode`
   with a mode switch — the synthesis can either expand back to 8
   sidebar rows (faithful) or keep one page and surface the modes as
   a strong on-page tab strip with named URLs (`?mode=intake`,
   `?mode=camera-prepare`, …). Per `03-mislinks.md`, today the
   `?mode=` is silently dropped; either approach fixes that.

**Pattern observations the synthesis will use:**

- **Same table, multiple sidebar items → share the page, filter via
  `?param=`.** Legacy `wallet/` lets the wallet menu's 4 sub-items
  share one DataTable with different WHERE clauses. Pacred's
  `/admin/wallet?kind=…&status=…` already does this correctly.
- **Different tables → separate pages.** Legacy `รายการเบิกเงิน`
  hub: 7 menu rows = 7 different PHP files = 7 different tables.
  Pacred must keep these as separate routes (the current shape, with
  broken `?kind=` wires fixed per `02-wallet-withdrawal-pattern.md`).
- **Workflow-distinct, even on shared tables → dedicated route.**
  Legacy `cnt-hs.php` (container payment approval) is a separate page
  even though it queries the same `tb_cnt` rows as the wallet view —
  because the approval workflow warrants its own URL.

These three rules together = the canonical "split vs filter" decision
matrix already codified in `_MASTER-FIX-PLAN.md` §5.

---

## 6. Cross-link

- Synthesis (consumes this audit): `07-IA-restructure-proposal.md` —
  proposes Pacred's restructured sidebar IA. **TBD.**
- Companion audits (run in parallel with this one):
  `04-workspace-inventory.md` (Pacred's current workspace surfaces) ·
  `05-sidebar-map.md` (live map of Pacred's current sidebar by role).
  Both **TBD**.
- Authoritative source for any disagreement: `d1-fidelity-admin.md`
  §1–11 (the per-module audit run from the live PHP on เดฟ's machine).
- Master fix plan that frames these audits: `_MASTER-FIX-PLAN.md`.
- D1 ADR: `docs/decisions/0017-pacred-faithful-pcs-port.md`.
- Owner rule that gates Phase-B ship: "copy original to 100% sameness
  FIRST, then improve" — captured in `AGENTS.md` §2.
