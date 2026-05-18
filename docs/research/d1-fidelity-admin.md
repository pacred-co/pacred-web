# D1 — Admin back-office fidelity audit (legacy PCS Cargo vs Pacred)

> **Purpose:** the precise per-module map of where the **Pacred admin
> back-office** diverges from the legacy **PCS Cargo** admin — the input
> for the **Phase B (workflow fidelity)** rework of
> [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md). Decision **D1**:
> the owner rejected the rebuilt admin; Pacred must become a faithful copy
> of legacy PCS (identical IA, identical button positions, identical
> workflows), rebranded `PCS`→`PR` only — staff need **zero retraining**.
>
> **Companion:** [`d1-phase-b-gap-map.md`](./d1-phase-b-gap-map.md) covers
> the *customer portal* + the cross-cutting workflow gaps (status
> vocabularies, container model, the 9-icon launcher). **This doc is the
> admin-only deep audit** — module by module.
>
> **Sources** (read-only audit, 2026-05-18):
> - Legacy: `/Users/dev/Desktop/pcscargo/member/pcs-admin/` — 187 entry
>   `.php` files + `include/pages/` (~85 subdirs) + `include/left-menu.php`
>   + `include/function.php` (~3500 LOC). WordPress `wp-*` cruft ignored.
> - Pacred: `app/[locale]/(admin)/admin/` (≈120 `page.tsx` routes) +
>   `components/admin/` + `actions/admin/` + `components/sections/admin-sidebar.tsx`.
>
> **Scale note:** legacy ≈ 187 entry files; Pacred ≈ 120 admin routes.
> They are NOT 1:1 — legacy bundles many sub-views behind `?page=` /
> `?q=` query switches on one `.php`, Pacred splits them into separate
> routes. The audit compares **workflows**, not file counts.

---

## 0. Executive summary — the biggest fidelity gaps

Ranked by retraining-pain (highest first):

1. **The admin sidebar IA is a different mental model.** Legacy = a
   per-role hand-built menu (the `company / department / section` triple
   selects 1 of ~22 distinct sidebars assembled from OOP partials), grouped
   under fixed section headers `Cargo & Freight / Freight / Cargo /
   Settings / Learning / Extension`, with a **live-count badge on almost
   every item**. Pacred = one flat `items[]` array (≈55 rows) filtered by a
   7-value role enum, grouped by ad-hoc Thai headings (`ภาพรวม / กระดานงาน /
   รีพอร์ตเฉพาะกิจ / Freight / ปฏิบัติการ / การเงิน / …`). **No badges
   anywhere.** A warehouse worker who knew exactly which 6 menu items they
   had now sees a different, longer, unfamiliar tree. → §1.
2. **No menu-count badges → staff lose their work radar.** Legacy staff
   work *from the badges* — `บริการฝากนำเข้า ⑫`, `รายการถอนเงิน ③`,
   `อนุมัติรายการ ⑤`. Every queue advertises its backlog in the sidebar.
   Pacred surfaces counts only inside the dashboard tab strip — invisible
   from any other page. This is the single most-noticed daily-workflow
   regression. → §1.4.
3. **Forwarder (ฝากนำเข้า) status order is inverted + sub-states dropped.**
   Legacy `fStatus`: `1`รอเข้าโกดังจีน → `2`ถึงโกดังจีน → `3`กำลังส่งมาไทย →
   `4`ถึงไทยแล้ว → `5`รอชำระเงิน → `6`เตรียมส่ง → `6.1`กำลังจัดส่ง →
   `7`ส่งแล้ว, plus `c`เครดิตสินค้า and `99`/`p`สถานะพิเศษ tabs and the
   `fStatusCarOn/Off` truck load flags. The legacy tab bar has **11 tabs**.
   Pacred's `forwarders` table has **7** statuses with `pending_payment`
   FIRST (pay-then-ship) — the legacy is pay-AFTER-arrival (slot 5). Pacred
   has no `6.1 กำลังจัดส่ง`, no `99/p สถานะพิเศษ`, no `CarOn/Off`. → §4.
4. **Container = a payment-slip ledger in legacy, a logistics entity in
   Pacred.** Legacy `tb_cnt` is literally *"ตารางจ่ายเงินค่าตู้"* — a 2-state
   (`1`รอจ่าย/`2`จ่ายแล้ว) container-**payment** record with a slip image,
   `cntAmount`, bank fields, and a fan-out into `tb_cnt_pay_idorco` /
   `tb_cnt_pay_trackingchn`. Driven by `report-cnt.php` + `cnt-hs.php`
   (the disbursement-approval queue). Pacred models a container as a rich
   logistics state-machine (`packing/sealed/in_transit/arrived/unloading/
   closed`) with no payment-slip ledger at all. → §6.
5. **Whole legacy modules have no Pacred home.** `Learning` centre
   (กฏระเบียบ · การอบรม · newsfeed · TOS), the `Extension` toolbox (เช็ค
   นิติบุคคล · เช็คขนส่งไทย · จองห้องประชุม · ประวัติการทำรายการ · time-
   attendance), the QA `หมายเหตุ`/SLA-breach queues (รอชำระเกิน 1 วัน,
   เครดิตเกินกำหนด, …11 queues), the **รวมบิลสินค้า** multi-order bill
   consolidation, the **เช็คต้นทุนตู้ Sheet** cost-check, the
   **api-forwarder-cn / JMF / GOGO / sheets** import-update tools. → §11.
6. **Login screen is a different shape.** Legacy: a centred single-card
   Bootstrap-4 login titled *"เข้าสู่ระบบสำหรับ Admin"* with PCS logo,
   username-OR-phone + password, "จำฉันไว้" checkbox, SweetAlert welcome
   toast. → §2.

**Verdict:** the Pacred admin **dashboard** (`/admin`) has *already* been
reworked toward fidelity (4 revenue carousel-style cards + rate strip + a
13-tab queue strip — see §3) — good, keep going. But the **sidebar**, the
**forwarder status flow**, and the **container model** are still on the
rebuilt paradigm, and ~6 module families are simply missing.

---

## 1. Admin sidebar / navigation IA

### 1.1 Legacy structure — `include/left-menu.php` (156 LOC)

The legacy sidebar is **RBAC-switched**, not role-filtered. On login a
`company / department / section` triple is read from `tb_admin`
(`companyType` 1-3, `department` 0-6, `section` 0-18). `left-menu.php` is
one big nested `switch` that `require_once`s **exactly one** purpose-built
menu file per (company,department,section) combination:

```
companyType 1 = CargoAndFreight   → CEO / HR(×3) / QAAndQC(×3) / Accounting(×2) / Marketing(×5) / ITDT(×3)
companyType 2 = Freight           → SaleFreight(×2) / FreightExport(×6) / FreightImport(×6)
companyType 3 = Cargo             → SaleCargo(×2) / CSPurchasing(×2) / Warehouse(×3)
```

≈ **22 distinct sidebars**. Each is a hand-built `.php` under
`include/pages/left-menu/<company>/<dept>/<section>.php` that
`require_once`s reusable **OOP menu blocks** from
`include/pages/left-menu/OOP/`:

| OOP block | Renders |
|---|---|
| `OOP/Cargo/menu-wallet.php` | กระเป๋าสตางค์ → เป๋าตังทั้งหมด · จ่ายแทนลูกค้า · ประวัติรายการ · รายการถอนเงิน · รายการเติมเงิน · เพิ่มรายการเติมเงิน |
| `OOP/Cargo/menu-purchasing.php` | บริการฝากสั่งสินค้า → ค้นหา · ทั้งหมด · รอดำเนินการ · รถเข็น · เพิ่มสินค้าในรถเข็น · หมายเหตุฝากสั่ง |
| `OOP/Cargo/menu-forwarder.php` | บริการฝากนำเข้า → ค้นหา · ค้นหาหลายรายการ · รายการนำเข้า(ทั้งหมด/เตรียมส่ง/เครดิต/เพิ่ม) · หมายเหตุนำเข้า · อัปเดตฝากนำเข้า(API) · เช็คต้นทุนตู้ Sheet · รายงานตู้สินค้า · ประวัติเข้าโกดังไทย · มอบงานคนขับรถ · รวมบิลสินค้า · สแกนบาร์โค้ด |
| `OOP/Cargo/menu-payment.php` | บริการฝากโอน/ชำระ → รายการฝากชำระ · เพิ่มรายการ |
| `OOP/Cargo/menu-barcode.php` | สแกนบาร์โค้ด → ค้นหาฝากนำเข้า(เครื่อง/กล้อง) · บันทึกเข้าโกดัง · ค้นหาเตรียมส่ง(เครื่อง/กล้อง) · สแกนจากหน้ากล่อง(เครื่อง/กล้อง) |
| `OOP/Cargo/menu-report.php` | ออกรายงาน → ฝากสั่ง/นำเข้า/โอน · ยอดพนักงานขาย · ยอดรวมทุกบริการ · ยอดรวมตามรหัส · รายงานคนขับ · การเข้าถึงเว็บ · รายงานโปรโมชัน · SMS / OTP |
| `OOP/Cargo/menu-acc.php` | รายงานรับรู้รายได้ Cargo → รายรับ-รายจ่าย · เติมเงิน · ฝากสั่ง · ฝากนำเข้า(ใบแจ้งหนี้/ใบเสร็จ/ยอด) · ฝากชำระ · ถอนเงิน · คืนเงินเข้า Wallet ; ระบบบัญชี Cargo |
| `OOP/Cargo/menu-user.php` | ค้นหารหัส · สมาชิกทั้งหมด/ทั่วไป/VIP/SVIP/นิติบุคคล/เครดิต/คิดค่าเทียบ |
| `OOP/Cargo/menu-settings.php` | ตั้งค่าระบบ Cargo → ทั่วไป · ประกาศหน้าแรก · Popup · อัตราค่าขนส่ง(ทั่วไป/VIP) · ประเภทสมาชิก VIP · ปรับคำใต้ช่องค้นหา |
| `OOP/Cargo/menu-QAAndQC.php` | 11 SLA-breach queues — รอชำระเกิน 1 วัน · รอชำระค่านำเข้าเกิน 2 วัน · ยกเลิกออเดอร์ · เครดิตเกินกำหนด · สั่งซื้อรอเกิน 10 นาที · รอร้านจีนส่งเกิน 2 วัน · รอเข้าโกดังจีนเกิน 2 วัน · กำลังมาไทยเกิน · สินค้าไม่มีเจ้าของ · เตรียมส่งเกิน · ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน · ย้ายเซลล์ |
| `OOP/CargoAndFreight/menu-hr-manage-human-resource.php` | ผังองค์กร(ภาพ/ตาราง) · สรรหาบุคคล · ทรัพยากรบุคคล · รายงานการเข้าทำงาน(time-attendance) |
| `OOP/CargoAndFreight/menu-hr-manage-corporate-assets.php` | ซ่อมบำรุง · จัดซื้อ(ลงเบิกค่าใช้จ่าย) · สต๊อกของใช้ · เครื่องมือ(เบอร์/อีเมล/ไลน์/WeChat/โดเมน) |
| `OOP/CargoAndFreight/menu-user.php` | จัดการลูกค้า → ลูกค้า PCS Cargo / ลูกค้า PCS Freight |
| `OOP/CargoAndFreight/menu-withdrawal-list.php` | รายการเบิกเงิน → PCS Freight / PCS Cargo (เบิกค่าสินค้า · ค่าตู้ · ค่าขนส่งไทย · ลูกค้าตัวแทน · โบนัสเซลล์ · โบนัสล่ามจีน) |
| `OOP/Freight/menu-acc.php` | ระบบบัญชี Freight → รายการเดินบัญชี · รายรับ(ใบเสนอราคา/แจ้งหนี้/เสร็จ/หัก/ภาพรวม) |
| `OOP/Freight/menu-user.php` | ลูกค้า PCS Freight list |
| `OOP/Learning/*` | กฏระเบียบและสัญญา · การอบรม(Business Plan/วัฒนธรรม/ผังงาน) · newsfeed · TOS |
| `OOP/Extension/*` | เช็คนิติบุคคล · เช็คขนส่งไทย · จองห้องประชุม · ประวัติการทำรายการ · time-attendance |

The CEO sidebar (`CargoAndFreight/CEO/CEO.php`) is the **fullest** — it
shows the canonical fixed section order:

```
Dashboard (All / Freight / Cargo)
── navigation-header: "Cargo & Freight" ──
  ฝ่ายทรัพยากรบุคคล · QA & QC · จัดการลูกค้า · รายการเบิกเงิน
── navigation-header: "Freight" ──
  ระบบบัญชี Freight
── navigation-header: "Cargo" ──
  กระเป๋าสตางค์ · ฝากสั่งสินค้า · ฝากนำเข้า · ฝากโอน/ชำระ · ออกรายงาน · บัญชี Cargo
── navigation-header: "Settings" ──
  ตั้งค่าระบบ Cargo
── navigation-header: "Learning" ──
  กฏระเบียบ · การอบรม · newsfeed · TOS
── navigation-header: "Extension" ──
  เช็คนิติบุคคล · เช็คขนส่งไทย · จองห้องประชุม · ประวัติการทำรายการ
```

Visual base: ThemeForest "Modern Admin" Bootstrap-4 — dark fixed
accordion sidebar (`menu-fixed menu-dark menu-accordion`), `la la-*` /
`ft-*` icons, the logged-in admin avatar + `adminID` pinned at the top with
a profile/settings/line-notify/logout dropdown, and a role badge
(`nameCompanyType` + `nameAdminType` + dept/section).

### 1.2 Pacred structure — `components/sections/admin-sidebar.tsx`

One flat `const items: NavItem[]` (≈55 entries). Each item: `{href, label,
icon (lucide), roles?: AdminRole[], group}`. `AdminRole` is a 7-value enum
(`super, ops, accounting, sales_admin, warehouse, driver, interpreter`).
`visibleItems = items.filter(it => !it.roles || roles.includes("super") ||
it.roles.some(r => roles.includes(r)))`. Groups (by `group` string, order
preserved): `ภาพรวม · กระดานงาน · รีพอร์ตเฉพาะกิจ · รีพอร์ตวิเคราะห์ ·
Freight · การสื่อสาร · ปฏิบัติการ · การเงิน · ลูกค้า · ขาย · องค์กร · ระบบ`.
Light/dark theme, lucide icons, `PACRED Admin` brand header with role
chips, "← กลับฝั่งลูกค้า" footer link.

### 1.3 Gap table — sidebar IA

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Role model | `company/department/section` triple → 1 of ~22 hand-built sidebars | 7-value `AdminRole` enum, one array filtered | **Incompatible.** D1 = faithful → rebuild per-role menus OR map the legacy triple onto Pacred roles + render the legacy menu shape. Owner expects each role to see *their* familiar tree. |
| Section headers | Fixed: `Cargo & Freight / Freight / Cargo / Settings / Learning / Extension` | Ad-hoc Thai: `ภาพรวม / กระดานงาน / รีพอร์ตเฉพาะกิจ / …` | Re-label + re-order group headers to the legacy 6. The legacy headers are EN words staff recognise. |
| Avatar + adminID at top | Top `li` = avatar circle + `adminID` + dropdown (โปรไฟล์ · ตั้งค่าบัญชี · Line Notify เชื่อม/ยกเลิก · ออกจากระบบ) | Role chips only; no avatar, no per-user dropdown in sidebar | Add the avatar + adminID + dropdown block at the sidebar top. |
| Role badge | `nameCompanyType` + `nameAdminType` + dept/section name under avatar | Role enum chips (`super`, `ops`, …) | Show the legacy department/section names, not enum tokens. |
| Live-count badges | `badgeMenu($count)` on nearly every item + sub-item | **None** | → §1.4 — highest-pain gap. |
| Theme | Dark fixed accordion (`menu-dark`) | Light default (dark optional) | Owner's reference is the dark sidebar. Default to dark to match, or confirm with owner. |
| Dashboard sub-menu | `Dashboard All / Freight / Cargo` under one Dashboard item | Single `/admin` (`ภาพรวม`) | Add the 3-way All/Freight/Cargo dashboard switch (legacy `index.php?c=`). |
| Accordion behaviour | Multi-level nested accordion, `data-scroll-to-active` | 2-level (group → item), no nesting | Legacy menus nest 3-4 deep (e.g. barcode → search → device/camera). Pacred flattened. Restore nesting OR accept — but the icon positions then differ. |
| `Learning` section | Whole section: กฏระเบียบ · การอบรม · newsfeed · TOS | `ศูนย์เรียนรู้` single item (`/admin/learning`) | Expand to the 4-item Learning section. |
| `Extension` section | เช็คนิติบุคคล · เช็คขนส่งไทย · จองห้องประชุม · ประวัติการทำรายการ | Scattered: `/admin/juristic-check` exists; others missing | → §11. |

### 1.4 The badge gap (call-out)

Legacy `badgeMenu($n)` / `pcs-sm-badge` pills appear on: ฝากนำเข้า,
ฝากสั่งสินค้า (รอดำเนินการ), ฝากโอน, กระเป๋าสตางค์ (เติม+ถอน), หมายเหตุ
(นำเข้า/ฝากสั่ง), เตรียมส่ง, มอบงานคนขับ, รายการเบิกเงิน (and every
sub-row: เบิกค่าสินค้า, ค่าตู้, โบนัสเซลล์, โบนัสล่าม…), จัดการลูกค้า
(นิติบุคคล count), and all 11 QA queues. Counts come from `count*` vars
computed once in `header.php` / the menu file head.

Pacred renders counts ONLY in the `/admin` dashboard tab strip
(`tabCounts`). From `/admin/customers` or `/admin/forwarders` the staffer
cannot see "5 things wait in ฝากโอน". **Fidelity fix:** compute the count
set server-side (one batched query, as the dashboard already does) and
render a red pill on each sidebar item — matching `badgeMenu`. This is the
**#1 daily-workflow regression**: legacy staff navigate *by the badges*.

---

## 2. Admin login

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Page | `login.php` (206 LOC) — standalone, no sidebar; centred single card | `app/[locale]/(auth)/login/page.tsx` shared customer+admin login (modified in `caecb45`) | Legacy admin login is a SEPARATE screen at `/pcs-admin/login/`. Decide: keep one shared login (simpler) or restore a dedicated `/admin/login`. If shared, ensure the admin path lands on the admin home. |
| Title | `เข้าสู่ระบบ \| Admin PCS Cargo` + heading "เข้าสู่ระบบสำหรับ Admin" | Generic login | Rebrand → `เข้าสู่ระบบสำหรับ Admin \| PR` heading. |
| Logo | `logo-text-dark.png` (PCS) | Pacred logo | Already a `PR` asset — OK once branding done. |
| Credential field | **Username OR phone** (`adminTelORadminID`) + password 6-30 | Email + password | Legacy admins log in by `adminID` (username) or `adminTel`. Pacred must accept username/phone for admin accounts (matches the ported `tb_admin`). |
| "จำฉันไว้ในระบบ" | Checkbox, checked by default, 10-year cookie | n/a | Add remember-me. |
| Success feedback | SweetAlert toast "ยินดีต้อนรับเข้าสู่ PCS Cargo" 3s → redirect | Silent redirect | Add a welcome toast (rebranded). Low priority but it is what staff expect. |
| Show/hide password | Eye toggle (feather) | Likely present | Verify parity. |

---

## 3. Admin dashboard / home (`/admin`)

**Good news — already largely faithful.** Pacred's `/admin/page.tsx` was
reworked to the PCS shape and is close. Legacy home =
`include/pages/home/<company>/<dept>/<section>.php` chosen by `index.php`'s
`switch`; the CEO/Cargo home (`home/Cargo/CEO/CEO.php`) shows: a row of
**4 revenue stat cards** (each a Bootstrap `carousel` flipping
month-total ↔ today-total — ฝากสั่งซื้อ / ฝากนำเข้า / ฝากโอน / wallet),
a rate strip, user-stat cards, then per-queue tables.

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| 4 revenue cards | Top row, carousel month↔today, icon + progress bar | ✅ `RevenueCard` ×4 (ฝากสั่งซื้อ/ฝากนำเข้า/ฝากโอน/wallet), same order, progress bar | **Match.** Minor: Pacred shows month + a static "วันนี้" line instead of a *carousel* flip. Add the auto-flip carousel for pixel fidelity, or accept (low pain). |
| Rate strip | เรท values row | ✅ `RateChip` ×4 (เรทสั่งซื้อ/เรท Sale/เรทโอน/ยอดรวม) | Match. Verify the รท-Sale/รท-โอน offsets (Pacred hardcodes `-0.02`/`-0.04`) match the legacy `tb_setting` formula. |
| User stat cards | active / inactive customers | ✅ `UserStatCard` ×3 (ใช้งานแล้ว/ยังไม่ใช้/ยกเลิก) | Match. |
| Queue tab strip | Per-queue lists (เติมเงิน, ถอนเงิน, รอดำเนินการ…) with red badges | ✅ 13-tab strip + table, red count badges, `+ รายการตู้` tab | Match — this is the closest-to-legacy surface in the whole app. Verify the tab SET equals the legacy queue set per role. |
| Dashboard scope switch | `index.php?c=all/cargo/freight` — 3 dashboards | ❌ Only one `/admin` | Add `?c=` (or 3 tabs) for All/Cargo/Freight. |
| Per-role home | 22 home variants — a Warehouse worker sees a warehouse home, a Sales sees a sales home | One dashboard for `ops/accounting/sales_admin`; driver/warehouse get a different gate | D1 = faithful → each role should land on *their* legacy home layout. At minimum: warehouse + driver + sales need their own home, not the exec dashboard. |

---

## 4. Forwarders / ฝากนำเข้า (import)

**Legacy:** `forwarder.php` (entry, ~1000+ LOC) + `forwarder/` route +
`forwarder-search.php` · `forwarder-search-muti.php` · `forwarder-action.php`
· `forwarder-import-warehouse.php` · `forwarder-driver.php` ·
`forwarder-bill.php`. The list (`forwarder.php?page` default) renders an
**11-tab status bar** then a DataTable.

**Pacred:** `/admin/forwarders/page.tsx` (list) + `/admin/forwarders/[fNo]`
(detail) + `/admin/forwarders/bulk-search` + an apparently-legacy
`/admin/forwarder/page.tsx` + `/admin/forwarder/pending/page.tsx` (two
spellings coexist — see gap row). Status-chip filter row + `ForwardersTable`.

### 4.1 Status model

Legacy `tb_forwarder.fStatus`: `1`รอเข้าโกดังจีน · `2`ถึงโกดังจีนแล้ว ·
`3`กำลังส่งมาไทย · `4`ถึงไทยแล้ว · `5`รอชำระเงิน · `6`เตรียมส่ง ·
`6.1`กำลังจัดส่ง · `7`ส่งแล้ว ; plus pseudo-tabs `c`เครดิตสินค้า,
`p`/`99`สถานะพิเศษ. Sub-flags `fStatusCarOn`/`fStatusCarOff` (ขึ้นรถ/ลงรถ).
Each status change writes `tb_log_forwarder_status` (old→new + adminID).

Pacred `forwarders.status`: `pending_payment, shipped_china, in_transit,
arrived_thailand, out_for_delivery, delivered, cancelled` (7).

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Status order | pay (`5`) comes AFTER ถึงไทย (`4`) — cargo COD | `pending_payment` is status #1 (pay-then-ship) | **Workflow inversion.** Restore ship→arrive→THEN-pay. Staff process by tab order. (Also flagged in `d1-phase-b-gap-map.md` §2.) |
| Tab count | 11 tabs: ทั้งหมด · รอเข้าโกดังจีน · ถึงโกดังจีน · กำลังส่งมาไทย · ถึงไทย · รอชำระเงิน · เตรียมส่ง · กำลังจัดส่ง · ส่งแล้ว · เครดิตสินค้า · สถานะพิเศษ | 8 chips (ทั้งหมด + 7 statuses) | Add `กำลังจัดส่ง` (6.1), `เครดิตสินค้า`, `สถานะพิเศษ` tabs. Legacy uses *tabs* (`nav nav-tabs nav-underline`), Pacred uses *pills* — switch to underline tabs for fidelity. |
| Tab badge colours | Each tab a distinct colour: warning/info/pink/brown/danger/primary/info2/success/danger/warning | Uniform pills, count in label text | Restore per-status badge colours + count pill on each tab. |
| `กำลังจัดส่ง` (6.1) | Derived: status 6 rows that have a `tb_forwarder_driver_item` assignment | Folded into `out_for_delivery` | Split — legacy distinguishes "เตรียมส่ง" (assignable) vs "กำลังจัดส่ง" (driver picked up). |
| `สถานะพิเศษ` (99) | A held/special bucket; `forwarder.php` has `moveStatusTo99` / `removeStatusTo99` bulk actions that snapshot+restore the prior status via `tb_log_forwarder_status` | No equivalent | Add the special-status park/un-park with history restore. |
| `fStatusCarOn/Off` | Truck-load sub-flags shown as badges ("ขึ้นรถแล้ว") | Dropped | Restore as sub-state badges in the row. |
| Table columns | ID · วันที่สร้าง · รหัสลูกค้า · รายละเอียด · ยอดค้างชำระ · เลขพัสดุจีน · เลขพัสดุไทย · เข้าโกดัง · ออกโกดัง · ถึงไทย · สถานะ · อัปเดต(by) · ตัวเลือก (+ เครดิต cols on `?q=c`) | id · f_no · status · source_warehouse · transport_type · weight · volume · total_price · tracking · created (`ForwardersTable`) | Reconcile columns to the legacy 13. Legacy shows the 3 warehouse timestamps (เข้า/ออก/ถึงไทย) as columns + the updating admin's username — Pacred shows weight/volume/source instead. The owner expects the legacy column set + order. |
| "พิมพ์แล้ว" badges | Per-print-job badges (printStatus1-4) in the date cell | None | Add print-tracking badges. |
| Bulk print | List wraps a `<form action="printAll/">` — checkbox-select rows → bulk print | `ForwardersTable` has checkboxes + a bulk action | Verify the bulk action = bulk PRINT (legacy default), not just status change. |
| Search | `forwarder-search.php` (single) + `forwarder-search-muti.php` (multi-line) as **separate menu items/pages** | One search bar + `/forwarders/bulk-search` | Acceptable — both capabilities exist. Match: legacy exposes them as 2 sidebar items. |
| หมายเหตุนำเข้า | `forwarder-action.php?action=Note` — a note queue with a sidebar badge | No `หมายเหตุ` queue | Add the note queue (`fNote<>'' AND fStatus<>7`). |
| Add forwarder | `forwarder/add/` — admin creates a row; `fShipBy='PCS'` auto-fills the PCS BKK warehouse address | `/admin/forwarders` (no obvious add route in tree) | Verify admin-create-forwarder exists with the warehouse-address auto-fill. |
| Route spelling | n/a | `/admin/forwarders` AND `/admin/forwarder` + `/admin/forwarder/pending` both exist | **Dead/duplicate routes.** Pick one (legacy is `forwarder/`), delete the other to avoid staff confusion. Flag for cleanup. |

### 4.2 Warehouse-arrival history

Legacy `forwarder-import-warehouse.php` — links a `tb_forwarder_import2`
scan record to a forwarder; when linked, flips `fStatus=4`,
`fDateStatus4=NOW()`, captures `fPallet` (shelf). Pacred: covered partly by
`/admin/barcode` intake. Gap: legacy has a dedicated *history* page
("ประวัติสินค้าเข้าโกดัง") with a re-link/correct UI — Pacred has no
equivalent history-correction screen.

---

## 5. Orders / ฝากสั่งสินค้า (shop orders)

**Legacy:** `shops.php` (entry) + `shops/` route + `shop-search.php` +
`cart.php` (the 151-item-cap cart, admin can build a cart for a customer) +
`forwarder-action.php?action=NoteShop`. `tb_header_order.hStatus`:
`1`รอดำเนินการ · `2`รอชำระเงิน · `3`สั่งสินค้า · `4`รอร้านจีนจัดส่ง ·
`5`สำเร็จ · `6`ยกเลิก. Order no = `P<id>`.

**Pacred:** `/admin/service-orders/page.tsx` + `/admin/service-orders/[hNo]`,
plus a parallel `/admin/orders/*` tree (`orders/`, `orders/pending`,
`orders/shop`, `orders/shop/pending`, `orders/import`, `orders/transfer`).

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Status model | 6 states, `hStatus` 1-6 | `service_orders.status` (pending/awaiting_payment/ordered/awaiting_chn_dispatch/…) | Per `d1-phase-b-gap-map.md` §2 the order statuses map "well" — but verify the exact 6:1 mapping incl. order/labels. |
| List shape | `shops/` — tab-per-status (รอดำเนินการ etc.) + DataTable | `/admin/service-orders` chip filter + table | Switch chips → underline tabs for fidelity; ensure tab set = legacy 6. |
| Admin cart-build | `cart/` + `cart/add/` — admin assembles a 101/151-item cart FOR a customer, then `addOrder` | Not in the admin route tree | Legacy lets staff place orders on a customer's behalf. Add the admin cart screens. |
| หมายเหตุฝากสั่ง | `forwarder-action.php?action=NoteShop` — note queue + badge | No queue | Add the shop-note queue. |
| Order no | `P<id>` | `h_no` | Verify ported `h_no` keeps `P<n>` format (D1 = `PCS<n>`→`PR<n>` for members; orders may keep `P<n>`). |
| Route sprawl | One `shops.php` | `/admin/service-orders` AND `/admin/orders/*` (7 routes) — two parallel module homes | **Duplicate module.** Consolidate onto one (legacy = `shops/`). The `/admin/orders/*` tree looks like an earlier rebuild artefact — flag for cleanup. |
| ค้นหาฝากสั่งซื้อ | `shop-search.php` separate page | search bar inline | Acceptable; legacy has it as its own sidebar item. |

---

## 6. Containers / ตู้ + warehouse + scanning

The single largest structural divergence — covered in
`d1-phase-b-gap-map.md` §3 and expanded here for the admin side.

### 6.1 Legacy container model

`tb_cnt` = *"ตารางจ่ายเงินค่าตู้"* — a **container-payment** record, not a
logistics entity. Columns: `cntName` (เลขตู้ — actually a comma-joined list
of `fCabinetNumber` strings), `cntStatus` (`1`รอจ่ายเงิน / `2`จ่ายแล้ว),
`cntAmount`, `nameBlank`/`noBlank`/`nameAccount` (bank payee fields),
`cntFile` (a PDF slip), `adminIDCreate`, `date`. Plus:
- `tb_cnt_item` — maps each `fCabinetNumber` → `cntID`.
- `tb_cnt_pay_idorco` — the PK/CO numbers (`fIDorCO`) covered by the payment.
- `tb_cnt_pay_trackingchn` — the China tracking numbers covered.

**Workflow** (`report-cnt.php` + `cnt-hs.php`): each `tb_forwarder` row
carries a free-text `fCabinetNumber`. Staff group forwarders by that
string; a payment record (`addPay`) INSERTs `tb_cnt` (+ uploads the slip
PDF) and fans every member-forwarder's `fIDorCO` / `fTrackingCHN` into the
two `tb_cnt_pay_*` tables. `cnt-hs.php` is the disbursement-**approval**
queue (`อนุมัติรายการ` ⑤ with a sidebar badge). "Close" = a
`fDateContainerClose` timestamp on the forwarder rows. There is **no
status machine** — a container is a loose payment-grouping label.

### 6.2 Pacred container model

`containers` + `cargo_containers` (0033 spine) + `cargo_shipments` —
first-class logistics entities. `/admin/warehouse/containers` lists them
with a 6-state machine (`packing/sealed/in_transit/arrived/unloading/
closed`), `transport_mode`, `origin/destination`, `eta`, `close_at`,
shipment counts. Also `/admin/containers` (a separate 0016-era page) +
`/admin/containers/[id]/hs` + `/admin/warehouse/bulletin`.

### 6.3 Gap table — containers/warehouse

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Container concept | Payment-grouping label (`tb_cnt`) — slip + amount + paid/unpaid | Logistics state-machine entity | **Different mental model.** Phase B must add the `tb_cnt` **payment-slip ledger** view: a list keyed by `cntName`, columns เลขตู้/ยอด/สถานะ(รอจ่าย·จ่ายแล้ว)/สลิป(PDF)/วันที่/by, with an "เพิ่มรายการจ่าย" form that uploads the slip + fans into `tb_cnt_pay_*`. |
| `report-cnt.php` | "รายงานตู้สินค้า" — group forwarders by `fCabinetNumber`, record a bulk China-side payment | No equivalent | Build it. This is on the legacy ฝากนำเข้า sidemenu. |
| `cnt-hs/` | "ค่าตู้สินค้า → อนุมัติรายการ ⑤ / ประวัติรายการ" — the container-cost disbursement APPROVAL queue, badge-counted | `/admin/accounting/container-costs` exists but is a **rate-card** editor (U2-2), not the approval queue | Add the approve/history sub-pages with the badge count (`tb_cnt WHERE cntStatus=1`). |
| `เช็คต้นทุนตู้ Sheet` | `check-sang-cost.php` — reconcile container cost vs a Google Sheet | None | Build or defer (Phase C) — but it IS a legacy sidebar item. |
| Warehouse scan auto-flip | `barcode-d-import.php`: set shelf `location` → scan each box → when scanned count ≥ `fAmount`, auto-flip `fStatus`→4; green=matched, orange+sound=unmatched | `/admin/barcode` `ScanForm` (intake/prepare modes) | Verify the scan-to-auto-flip + shelf (`fPallet`) capture + the green/orange + audio cue all reproduce. The legacy page has a distinctive single centred search box + spinner + result panel + `<div class="music">`. |
| Scan variants | 8-variant family: `barcode-d-all/-import/-prepare/-from` (device) × `barcode-c-*` (camera) — submenu: ค้นหา(เครื่อง/กล้อง) · บันทึกเข้าโกดัง · เตรียมส่ง(เครื่อง/กล้อง) · จากหน้ากล่อง(เครื่อง/กล้อง) | One `/admin/barcode` (modes `intake`,`prepare`) + `/admin/barcode/driver` | Re-expand to the 8 scan modes, or at least the menu structure (ค้นหา/บันทึก/เตรียมส่ง/จากหน้ากล่อง each with device+camera). Scanner staff have muscle memory for the specific page per task. |
| Warehouse-in history | `forwarder-import-warehouse.php` — re-link/correct screen | Not present | Add. |
| Pacred-only pages | — | `/admin/warehouse/bulletin` (บุลเลตินตู้รายวัน), `/admin/containers/[id]/hs`, `/admin/warehouse/qa-inspections` | These are *enhancements* — keep, but they are NOT in the legacy IA. Per D1 they belong to Phase C; don't let them crowd the legacy menu shape. |
| Two container pages | `/admin/warehouse/containers` (0033 spine) AND `/admin/containers` (0016) coexist by design (union CHECK) | Confusing for staff — two "ตู้" pages | Pick the one that will host the `tb_cnt` ledger; retire/merge the other. |

---

## 7. Accounting / billing / receipts

**Legacy:** the `รายงานรับรู้รายได้ Cargo` menu (`OOP/Cargo/menu-acc.php`)
+ `ระบบบัญชี Freight` (`OOP/Freight/menu-acc.php`). Entry files: `acc-system`,
`acc-topup.php`, `acc-shop.php`, `acc-forwarder.php`, `acc-payment.php`,
`acc-withdraw.php`, `acc-shop-refund.php`, `acc-forwarder-refund`,
`acc-system-cargo.php` + the invoice/receipt printers `hs-forwarder-invoice.php`,
`hs-receipt-forwarder.php`, `hs-forwarder-receipt.php`, `create-f-receipt.php`,
`forwarder-bill.php` (รวมบิล), `printBill.php`, `printReceipt.php`,
`printPCSF.php`.

**Pacred:** `/admin/accounting/page.tsx` + `accounting/{reconcile, periods,
disbursements, container-costs, closing}` + `/admin/tax-invoices`.

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Acc menu shape | `รายงานรับรู้รายได้ Cargo` → รายรับ-รายจ่าย(ประวัติ/รายรับ/รายจ่าย) · เติมเงิน · ฝากสั่ง · ฝากนำเข้า(ใบแจ้งหนี้/ประวัติใบเสร็จ/ยอด) · ฝากชำระ · ถอนเงิน · คืนเงินเข้า Wallet(ฝากสั่ง/ฝากนำเข้า) ; + `ระบบบัญชี Cargo` ; + `ระบบบัญชี Freight` | One `/admin/accounting` page + 5 sub-routes | Rebuild the accounting menu tree to the legacy shape (the named sub-items above). Pacred's `reconcile/periods/closing` are new concepts; map or nest them. |
| ใบแจ้งหนี้ (invoice) | `hs-forwarder-invoice.php` — print an invoice for a forwarder/HS job | `/admin/tax-invoices` is the RD-86 *tax* invoice; freight invoices under `/admin/freight/*` | Legacy "ใบแจ้งหนี้" (billing invoice) ≠ tax invoice. Ensure the plain billing-invoice print exists for cargo forwarders, reachable from the acc menu. |
| ประวัติใบเสร็จ (receipt history) | `hs-receipt-forwarder.php` | partial | Add a receipt-history list under accounting. |
| รวมบิลสินค้า | `forwarder-bill.php` — consolidate MULTIPLE forwarder rows into one printed bill | **None** | Add multi-order bill consolidation (also in `d1-phase-b-gap-map.md` §4). On the ฝากนำเข้า menu in legacy. |
| คืนเงินเข้า Wallet | `acc-shop-refund.php` + `acc-forwarder-refund` — refund-to-wallet, split shop vs forwarder | `/admin/refunds` (U1-6) unified | Verify the shop/forwarder split + that refund lands in wallet. Legacy menu shows 2 sub-items. |
| รายรับ-รายจ่าย | `acc-system` — ประวัติ / รายรับ / รายจ่าย ledger | `/admin/accounting/reconcile`?? | Add the income/expense ledger view with the 3 sub-tabs. |
| Print family | `printBill / printReceipt / printPCSF / printAll / printShop / printDriver / printZone` — mPDF, THSarabunNew | PDF via `components/pdf/*` | Verify each print artefact has a Pacred equivalent + that layouts match (THSarabunNew, same fields/positions) — staff hand these to customers. |
| `ระบบบัญชี Freight` | Separate Freight accounting menu (เดินบัญชี + รายรับ: เสนอราคา/แจ้งหนี้/เสร็จ/หัก/ภาพรวม) | `/admin/freight/*` | Map the Freight-acc menu items onto the freight routes; ensure the menu shape matches. |
| Pacred-only | — | `accounting/periods` (ปิดงวด V-E9), `accounting/closing`, `accounting/reconcile` | Enhancements (Phase C). Keep but don't displace the legacy acc menu items. |

---

## 8. Wallet / กระเป๋าสตางค์

**Legacy:** `OOP/Cargo/menu-wallet.php` → `wallet/` · `pay-users.php`
(จ่ายแทนลูกค้า) · `wallet/history/` · `wallet/withdraw/` · `wallet/deposit/`
· `wallet/add/`. `tb_wallet` + topup/withdraw tables.

**Pacred:** `/admin/wallet/page.tsx` + `/admin/wallet/deposit` +
`/admin/withdrawals` (note: separate top-level route, not under `wallet/`).

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Menu items | เป๋าตังทั้งหมด · จ่ายแทนลูกค้า · ประวัติรายการ · รายการถอนเงิน ③ · รายการเติมเงิน ③ · เพิ่มรายการเติมเงิน | `/admin/wallet`, `/admin/wallet/deposit`, `/admin/withdrawals` | Reshape: all 6 items, all under one `กระเป๋าสตางค์` group. Pacred split `withdrawals` to a top-level route — re-nest under wallet. Add `จ่ายแทนลูกค้า` (pay-on-behalf) + `ประวัติรายการ` + `เพิ่มรายการเติมเงิน` if missing. |
| จ่ายแทนลูกค้า | `pay-users.php` — staff pay a service from a customer's wallet | `/admin/payment/page.tsx`? verify | Confirm the pay-on-behalf page exists and is reachable from the wallet menu. |
| Deposit approval | `wallet/deposit/` — approve topups (slip review), badge-counted | `/admin/wallet/deposit` | Verify slip-review + approve flow + the sidebar badge. |
| Withdraw approval | `wallet/withdraw/` — approve withdrawals, badge ③ | `/admin/withdrawals` | Verify + badge. |
| Badges | เติม+ถอน counts on the menu | None | Add (→ §1.4). |

---

## 9. Yuan payments / ฝากโอน-ฝากชำระ

**Legacy:** `OOP/Cargo/menu-payment.php` → `payment/` (รายการฝากชำระ,
badge-counted) + `payment/add/`. Entry `payment.php`. Status enum is the
MOMO/transfer flow (see `docs/audit/chat-analysis-2026-05-16.md`).

**Pacred:** `/admin/yuan-payments/page.tsx` + `/admin/payment/page.tsx`.

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Menu | บริการฝากโอน/ชำระ → รายการฝากชำระ ① · เพิ่มรายการ | `/admin/yuan-payments` (sidebar label "ฝากโอนหยวน") | Match label to legacy "บริการฝากโอน/ชำระ"; add `เพิ่มรายการ` (admin-create). |
| List | `payment/` tab list + DataTable | `/admin/yuan-payments` table | Verify status tabs match the legacy payment-status set. |
| Two routes | one `payment.php` | `/admin/yuan-payments` AND `/admin/payment` | Clarify: `payment` may be the customer-pay-on-behalf bridge. If duplicate, consolidate. |

---

## 10. Customers / สมาชิก-ลูกค้า

**Legacy:** `OOP/Cargo/menu-user.php` (segment list) + `users.php` (entry,
profile edit + password reset) + `users/{all,general,vip,svip,corporation,
credit,comparison}/` + `users-search.php`. Plus the
`OOP/CargoAndFreight/menu-user.php` wrapper splitting **PCS Cargo** vs
**PCS Freight** customers. `transferSalesCustomers.php` (re-assign sales
rep, on the QA menu). `tb_users`, `tb_corporate`.

**Pacred:** `/admin/customers/page.tsx` + `customers/{pending,
recently-active,transfer-rep}` + `customers/[id]` (+ `/convert-to-juristic`,
`/transfer-rep`).

| Legacy element | Legacy position / behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Segment menu | 7 segment views: ทั้งหมด · ทั่วไป · VIP · SVIP · นิติบุคคล ⑫ · เครดิต · คิดค่าเทียบ — each its own sidebar item | One `/admin/customers` with a `type` select (ทุกประเภท / บุคคล / นิติบุคคล) | **Gap.** Legacy segments by VIP tier (`general/vip/svip`), `credit`, `comparison` — Pacred only by `account_type` (personal/juristic). Add segment routes/filters: VIP, SVIP, เครดิต, คิดค่าเทียบ. The sidebar should list them as separate items (with the นิติบุคคล count badge). |
| Cargo vs Freight split | `menu-user.php` wraps the segment list under `ลูกค้า PCS Cargo` / `ลูกค้า PCS Freight` | No split | Add the Cargo/Freight customer split (rebranded PR Cargo / PR Freight). |
| Profile edit | `users.php?update` — staff edit name/email/tel/sex/FB/Line + (CEO/Manager/QA/Acc/IT only) reassign sales rep + coID | `/admin/customers/[id]` detail | Verify the edit form fields + the role-gated sales-rep/coID reassignment match. |
| Password reset | `users.php?recover` — staff set a customer password | verify | Confirm staff-side password reset exists. |
| ค้นหารหัสสมาชิก | `users-search.php` separate page | inline search bar | Acceptable; legacy has it as a sidebar item. |
| รอ Approve | n/a as a segment — approval is elsewhere | `/admin/customers/pending` | Pacred-added; fine, but verify it maps to a legacy concept (juristic doc approval). |
| Transfer rep | `transferSalesCustomers.php` — single + group, with edit history; lives on the **QA** menu | `/admin/customers/transfer-rep` + `customers/[id]/transfer-rep` | Match. Add the "ประวัติการแก้ไข" history view (`?page=history`). |
| Convert to juristic | n/a (juristic is a registration path) | `/admin/customers/[id]/convert-to-juristic` | Pacred-added; keep. |

---

## 11. Other legacy modules — Pacred counterpart status

| Legacy module | Legacy entry / menu | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| **HR — human resources** | `menu-hr-manage-human-resource.php` → ผังองค์กร(ภาพ/ตาราง) · สรรหาบุคคล · ทรัพยากรบุคคล(พนักงานทั้งหมด/ประจำ/ฝึกงาน/Partner/ลาออก/บัญชีธนาคาร/Line-notify) · รายงานการเข้าทำงาน(time-attendance: วันหยุด/การลา/บันทึกเวลา/KPI/โบนัส/เงินเดือน). Entry: `admin-table.php`, `organization-chart.php`, `organization-table.php`, `time-attendance-system.php`, `add-admin.php` | `/admin/hr/*` — `employees`, `org-chart`, `org-table`, `recruitment`, `attendance` (+`leaves`), `training`, `policies`, `audit` | **Close** — Pacred HR is well-built. Gaps: legacy `ทรัพยากรบุคคล` sub-segments (ประจำ/ฝึกงาน/Partner with truck-type sub-tree/ลาออก/บัญชีธนาคาร/Line-notify) — verify the employee-list filters cover them. Legacy time-attendance has KPI/โบนัส/เงินเดือน items — Pacred attendance may not. Map menu shape. |
| **HR — corporate assets** | `menu-hr-manage-corporate-assets.php` → ซ่อมบำรุง(รายชื่อติดต่อภายนอก) · จัดซื้อ(ลงเบิกค่าใช้จ่าย) · สต๊อกของใช้ · เครื่องมือ(เบอร์/อีเมล/ไลน์/WeChat/โดเมน) | `/admin/inventory` (สต๊อก) + `/admin/settings/contacts` (org-contacts) partly | Gaps: `contact-list-outsider`, `disbursement-of-expenses` (เบิกค่าใช้จ่าย — Pacred has `/admin/accounting/disbursements` U2-2, verify it's the same), `organization-{tell,email,line,wechat,domainname}` directories. Add the org tools sub-menu. |
| **QA & QC** | `menu-QAAndQC.php` — 11 SLA-breach queues, each `<page>.php?s=1` (to-do) + `<page>.php` (follow-up history) | `/admin/warehouse/qa-inspections` is a goods-INSPECTION queue, not SLA queues | **Big gap.** The legacy QA module = 11 time-based exception queues (รอชำระเกิน 1 วัน · รอชำระค่านำเข้าเกิน 2 วัน · ยกเลิกออเดอร์ · เครดิตเกินกำหนด · สั่งซื้อรอเกิน 10 นาที · รอร้านจีนส่งเกิน 2 วัน · รอเข้าโกดังจีนเกิน 2 วัน · กำลังมาไทยเกิน · สินค้าไม่มีเจ้าของ · เตรียมส่งเกิน · ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน). Pacred's `/admin/reports/*` covers a FEW (pending-payments, credit-pending, containers-awaiting-th) but not as a QA module with a to-do/history split. Build the QA queue module. (`d1-phase-b-gap-map.md` §4 calls this out too.) |
| **Reports** | `OOP/Cargo/menu-report.php` — ฝากสั่ง/นำเข้า/โอน · ยอดพนักงานขาย · ยอดรวมทุกบริการ · ยอดรวมตามรหัส · รายงานคนขับ · การเข้าถึงเว็บ(+API จีน+ค้นหา) · รายงานโปรโมชัน · SMS · OTP(ไม่ผ่าน/ผ่าน). Entries: `report-*.php` (~40 files) | `/admin/reports/*` (~13 routes) + `/admin/kpi` | Pacred reports are a different SET. Map: legacy ยอดพนักงานขาย→`sales-by-rep`, ยอดรวมตามรหัส→`user-sales-history`, ฝากนำเข้า→`forwarder-volume`. **Missing:** report-system (web traffic), report-api-china, report-user-search, the 3 promotion reports, report-api-sms, the 2 OTP reports, report-driver. The legacy report menu groups these distinctly — rebuild the menu shape + add the missing reports (or defer promo/traffic to Phase C and note it). |
| **Rates / settings** | `menu-settings.php` → ทั่วไป(`settings/`) · ประกาศหน้าแรก(`notify/`) · Popup(`popup/`) · อัตราค่าขนส่ง(general/VIP) · ประเภทสมาชิก VIP(`settings-vip/`) · ปรับคำใต้ช่องค้นหา | `/admin/settings/*` + `/admin/rates/*` (general/vip/custom-user/custom-hs) | Pacred rates are richer (custom-user, custom-hs = LP-1). Gaps: `notify/` (หน้าแรกประกาศ — the yuan-rate banner), `popup/` (customer popup announcement), `settings-vip` (VIP tier config), `adjust-words-below-search`. Add these settings pages + reshape the menu to the legacy `ตั้งค่าระบบ Cargo` group. |
| **Learning centre** | `OOP/Learning/*` — กฏระเบียบและสัญญา(`corporatePolicyManager/`, `contract`) · การอบรม(`businessPlan.php`, `corporateCulture.php`, `jobFlowchart.php`) · newsfeed · TOS(`termsOfServiceCargo.php`) | `/admin/learning` (single page) + `/admin/hr/policies` + `/admin/settings/tos-versions` | Expand `/admin/learning` into the 4-item Learning section, OR keep one page but ensure it covers business-plan / corporate-culture / job-flowchart / contracts / newsfeed / TOS content. The legacy IA has these as a dedicated sidebar section. |
| **Extension toolbox** | `OOP/Extension/*` — เช็คนิติบุคคล(`check-juristic.php`) · เช็คขนส่งไทย(`check-customer-maomao-free/-vip`, `check-customer-shipby-freedom`, `check-price-flash`, `check-shipby`, `check-payMethod`) · จองห้องประชุม(`booking-meeting-room.php`) · ประวัติการทำรายการ(`history.php`, `hs-customrate.php`) | `/admin/juristic-check` exists; `/admin/audit` is a system audit log | **Gap.** Missing: เช็คขนส่งไทย (5 Thai-logistics check tools), จองห้องประชุม (meeting-room booking calendar), ประวัติการทำรายการ (the `tb_log` transaction-history viewer + rate-change history). Add the Extension section. (Some — meeting-room — are clearly Phase C "enhancements" but they ARE in the legacy menu the owner knows.) |
| **Drivers** | `forwarder-driver.php` (มอบงานคนขับ, badge) + `Driver.php` home + `report-driver*.php` + `printDriver.php` | `/admin/drivers` + `/admin/drivers/[id]` + `/admin/driver-runs` + `/admin/barcode/driver` | Pacred driver module looks reasonably complete. Verify: the "มอบงานคนขับรถ" assignment screen with its badge, the driver report, the driver print sheet. |
| **Commissions / payouts** | `menu-withdrawal-list.php` — รายการเบิกเงิน → PCS Cargo: เบิกค่าสินค้า ③ · ค่าตู้ ② · ค่าขนส่งไทย · ลูกค้าตัวแทน ② · โบนัสเซลล์ ① · โบนัสล่ามจีน ① ; each with อนุมัติ/ประวัติ sub-pages + badges. Entries: `report-shops-profit-pay*.php`, `cnt-hs.php`, `withdraw-commission-sale.php`, `withdraw-commission-interpreter.php`, `report-user-sales*.php` | `/admin/commissions`, `/admin/sales-payouts`, `/admin/forwarder-sales` | Pacred has commission pieces but not the legacy `รายการเบิกเงิน` tree shape. Rebuild as one menu group with the 6 sub-queues, each อนุมัติ(badge)/ประวัติ. Note `โบนัสล่ามจีน` (interpreter) — `interpreter` IS a Pacred role; wire it. |
| **Update tools (API)** | `menu-up-sheet.php` — อัปเดตฝากนำเข้า → CargoCenter(`api-forwarder-cn.php`: Dashboard/API-SM/manual-update/history) · CTT/Sang/MK/MX sheets · JMF(`api-forwarder-jmf.php`) · GOGO | `/admin/csv-imports/*` (CSV import) | **Gap.** The legacy import-update tools (CargoCenter API, the 4 Google-Sheet adjusters, JMF API, GOGO) are how staff sync China-side tracking. Pacred only has generic CSV import. Per ADR-0017 work-split, ก๊อต builds the JMF API. The sheet-adjuster tools + CargoCenter dashboard need a Pacred home. Likely Phase C, but it's a daily-used legacy menu — note it. |
| **System / IT** | `ITDT` department menus + `report-system.php`, `report-api-sms.php` | `/admin/system/*` (crons, notifications), `/admin/audit`, `/admin/incidents`, `/admin/admins` | Pacred system tools are mostly *new* (cron health, incidents IO-1). Keep — but they're enhancements; the legacy ITDT menu is thinner. No fidelity action beyond not crowding the menu. |
| **Pacred-only modules (no legacy equivalent)** | — | `/admin/board` + `/admin/board/inbox` (work-board, Tier 2), `/admin/kpi` (exec KPI), `/admin/bookings` (BK-1), `/admin/broadcasts` (V-G3), `/admin/carriers`, `/admin/incidents` (IO-1), `/admin/contact-messages`, `/admin/migration/pcs-customers` | These are **Phase C enhancements** that shipped pre-D1. Per ADR-0017 they are *deferred, not cancelled* — but they must **not** sit in the main legacy menu shape. Move them to an "ส่วนเสริม / Pacred" section BELOW the legacy `Extension`, or hide until Phase C. The owner's reaction was partly *"there's stuff here that isn't in our system"* — surfacing these prominently is itself a fidelity miss. |

---

## 12. Cross-cutting fidelity gaps (apply to every module)

| Aspect | Legacy | Pacred | Fix |
|---|---|---|---|
| List UI | Bootstrap-4 DataTables — dense rows, `nav-tabs nav-underline` status tabs, server-paged, the table wrapped in a print `<form>` | Tailwind cards/tables, pill-style filter chips | For fidelity: switch status filters from pills → underline tabs; tighten row density; keep checkbox+bulk-print on list tables. |
| Status tabs | Underline tabs, per-status colour, count pill on each | Pill chips, count in label text | Underline tabs + coloured count pills. |
| Sidebar badges | `badgeMenu()` everywhere | none | Add (→ §1.4). |
| Action buttons | `btn btn-main` (brand red), SweetAlert confirms, `ft-*`/`la-*` icons | Tailwind buttons, lucide icons, mixed confirm UX | Standardise: brand-red primary button, a confirm dialog on destructive/financial actions (legacy uses SweetAlert universally). |
| Breadcrumbs | Every page: `หน้าแรก / <section>` breadcrumb top-left | Pages show a `ADMIN` eyebrow + h1, no breadcrumb trail | Add the breadcrumb trail — staff use it to navigate back. |
| Print artefacts | mPDF, THSarabunNew, fixed layouts customers receive | `components/pdf/*` | Audit each print layout field-by-field — these go to customers, must look identical. |
| History logging | `saveHistory($sql, $code)` + `tb_log_*` on most mutations; viewable in the Extension history page | `/admin/audit` (system audit) | The legacy "ประวัติการทำรายการ" is a *business* transaction log staff consult. Ensure it's reproduced (not just the security audit log). |
| Language | Thai UI, `data-i18n` present but TH default | TH/EN via next-intl | Keep TH as the working language; EN parity is fine but staff see TH. |
| Theme | Dark fixed sidebar | Light default | Default admin to dark to match the owner's reference (confirm). |

---

## 13. Recommended Phase-B sequencing (admin)

Highest retraining-pain → lowest. Pair with `d1-phase-b-gap-map.md` §6
(which sequences the customer-portal + cross-cutting reworks).

1. **Sidebar IA rebuild** — per-role menus from the legacy `company/dept/
   section` shape, fixed `Cargo&Freight/Freight/Cargo/Settings/Learning/
   Extension` headers, avatar+adminID block, **live-count badges**. Move
   Pacred-only modules into a separate "ส่วนเสริม" section. (§1)
2. **Forwarder status flow** — restore the 11-tab order (ship→arrive→pay),
   `6.1 กำลังจัดส่ง`, `99 สถานะพิเศษ` + park/restore, `CarOn/Off`, the
   13-column table, underline coloured tabs. (§4)
3. **Container payment-slip ledger** — build the `tb_cnt` view +
   `report-cnt` grouping + `cnt-hs` approval queue. (§6)
4. **QA SLA-breach queue module** — the 11 time-based exception queues
   with to-do/history split + badges. (§11)
5. **Missing menu families** — รวมบิลสินค้า · admin cart-build · note
   queues (นำเข้า/ฝากสั่ง) · customer VIP/SVIP/เครดิต/คิดค่าเทียบ segments ·
   wallet จ่ายแทนลูกค้า · the commission `รายการเบิกเงิน` tree · the
   Learning + Extension sections · notify/popup settings.
6. **Route-sprawl cleanup** — collapse the duplicate `forwarder` vs
   `forwarders`, `orders/*` vs `service-orders`, `payment` vs
   `yuan-payments`, `containers` vs `warehouse/containers` pairs onto the
   legacy-named single route each.
7. **Visual pass** — underline tabs, dense tables, breadcrumbs, dark
   sidebar, SweetAlert-style confirms, print-layout field audit.
8. **Login** — username/phone credential, remember-me, welcome toast,
   rebranded `PR`.

---

## 14. Open questions for เดฟ / ก๊อต / the owner

1. **Role mapping.** The legacy `company/dept/section` triple has ~22
   leaf roles; Pacred's `AdminRole` enum has 7. Phase B can either (a) add
   a richer role model that mirrors the triple, or (b) keep 7 roles but
   render the legacy *menu shape* per role. Which? (b) is less work and
   still gives staff their familiar tree.
2. **Theme.** Owner's reference is a dark sidebar. Default admin to dark,
   or keep light + a toggle?
3. **Pacred-only modules.** Hide `/admin/board`, `/admin/kpi`,
   `/admin/bookings`, `/admin/broadcasts`, `/admin/incidents` until
   Phase C, or keep them visible in a clearly-separated "ส่วนเสริม"
   section? (ADR-0017 says deferred-not-cancelled.)
4. **Print layouts.** Are the legacy mPDF artefacts (printBill, receipts,
   ใบขน) the binding visual spec, or can Pacred's PDFs differ?
5. **Phase C boundary.** Several legacy modules (meeting-room booking,
   the Google-Sheet adjuster tools, web-traffic/promotion reports) are
   arguably "enhancements" — confirm they're Phase-C deferrable and not
   part of the zero-retraining baseline.

---

## References

- [ADR-0017 — Pacred becomes a faithful PCS Cargo port](../decisions/0017-pacred-faithful-pcs-port.md)
- [`d1-phase-b-gap-map.md`](./d1-phase-b-gap-map.md) — customer portal + cross-cutting workflow gaps (companion)
- [`pcs-data-migration.md`](../runbook/pcs-data-migration.md) — Phase-A data migration runbook
- [`cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) — decoded cargo ops model (GZE/GZS, A-M-X-O-Z, container loop)
- [`chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) — MOMO/payment status enum + real workflows
- [`php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) — 20k-file legacy sweep (DB tables + freight subdirs)
- Legacy source: `/Users/dev/Desktop/pcscargo/member/pcs-admin/`
- Pacred admin: `app/[locale]/(admin)/admin/` · `components/sections/admin-sidebar.tsx`
