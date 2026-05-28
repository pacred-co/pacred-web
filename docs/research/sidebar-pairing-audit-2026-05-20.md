# Sidebar ↔ Page pairing audit (2026-05-20)

> สำหรับภูมิ · ทำตามคำขอ "วิเคราะห์ว่า sidebar กับ page จับคู่กันยังไง"
> · 3 ปัญหาหลัก · พร้อม action list
>
> **Sources:** ตัว KB ของพี่ป๊อปเอง — `PCS_ADMIN_ROLES_AND_MENUS.md` (1304L
> · canonical IA) + `BUSINESS_FLOW.md` + cross-check vs in-repo
> `docs/research/sidebar-fidelity-audit/06-legacy-menu-structure.md`.
> Pacred state จาก `lib/admin/sidebar-menu.ts` (716L) + 110+
> `app/[locale]/(admin)/admin/**/page.tsx`.
>
> **HEAD ตอนทำ audit:** `714cb7a` (Poom-pacred · เพิ่งดูดงานพี่เดฟ overnight)

---

## 1. ภาพรวม

| Bucket | Legacy spec | Pacred ตอนนี้ | Gap |
|---|---|---|---|
| Sidebar items ทั้งหมด (รวมทุก role · ทุก section) | ~165 leaf items (จาก §1 KB · 34 roles · 7 OOP module · 8 barcode variants · ฯลฯ) | ~140 sidebar items (ใน `lib/admin/sidebar-menu.ts`) | -25 |
| Admin page.tsx ที่มีจริง | — | 110 file (38 top-level + nested + `[id]`) | — |
| **MATCH** (sidebar ชี้ → page ตรง intent) | — | **~78 row** | — |
| 🔴 **MISMATCH** (sidebar ชี้ → ผิดหน้า / wrong h1) | — | **~12 row** | Bug Type 1 |
| 🟠 **FILTER แทน page** (sidebar item ใช้ `?param=` ของหน้าอื่น แต่ legacy เป็น dedicated URL) | — | **~24 row** | Bug Type 2 |
| 🟡 **MISSING** (sidebar ชี้ → 404 / redirect-to-elsewhere) | — | **~18 row** | Bug Type 3 |
| 👻 **ORPHAN** (page มีจริง · sidebar ไม่ชี้) | — | **~8 row** | Bug Type 4 |

**สรุป:** sidebar ตอนนี้ผ่าน ~56% ของหัวข้อแบบ "เปิดแล้วเจอหน้าที่ถูก
intent" — แปลว่ามี ~44% ที่ staff หาผิดที่ / เห็นหน้า shared / หรือ click
ไปเจอ redirect เงียบ ๆ. **Bug Type 2 (filter แทน page)** คือ scope ใหญ่ที่สุด
(~24 row) — ตรงกับ rule "ทุกหัวข้อ sidebar ต้องมีหน้า page ของมันเอง" ที่
ภูมิตั้งไว้

---

## 2. 🔴 Sidebar ชี้ผิดหน้า (Bug Type 1 — wrong content shows up)

> Bug example ของภูมิ:
> "คลิก `ออกรายงาน → ฝากนำเข้า` แล้วเจอหน้า 'ปริมาณฝากนำเข้า แยกตามต้นทาง × ขนส่ง'"
> — ยืนยันแล้ว · นี่คือ row #2 ในตารางข้างล่าง

| Sidebar label (TH) | คลิกแล้วไป (Pacred URL) | หน้าจริงที่โชว์ (h1) | Legacy spec ที่ควรเป็น | Severity |
|---|---|---|---|---|
| **ออกรายงาน → ฝากสั่งซื้อ** | `/admin/reports/monthly-orders` | "ออเดอร์ในเดือน · {label}" | `report-shops/` "รายงานฝากสั่ง — ข้อมูลทั่วไป" (per period) | 🔴 |
| **ออกรายงาน → ฝากนำเข้า** ⭐ ภูมิเห็น | `/admin/reports/forwarder-volume` | "ปริมาณฝากนำเข้า แยกตามต้นทาง × ขนส่ง" | `report-forwarder/` "รายงานฝากนำเข้า — ข้อมูลทั่วไป" | 🔴 |
| **ออกรายงาน → ฝากโอน** | `/admin/reports` | "รายงาน" (เป็น index ทั่วไป · ไม่ใช่ payment report) | `report-payments/` "รายงานฝากโอน" | 🔴 |
| **ออกรายงาน → การเข้าถึงเว็บไซต์** | `/admin/kpi` | "KPI ภาพรวมธุรกิจ" | `report-system.php` + sub (API จีน · ค้นหา · SMS · OTP) | 🔴 |
| **บัญชี Cargo → รายงานฝากสั่ง** | `/admin/reports/monthly-orders` | "ออเดอร์ในเดือน · {label}" | `acc-shop.php` (รายงานฝากสั่ง ฝั่งบัญชี ≠ ออเดอร์ในเดือน) | 🔴 |
| **บัญชี Cargo → ฝากนำเข้า → ยอดทั้งหมด** | `/admin/reports/forwarder-volume` | "ปริมาณฝากนำเข้า แยกตามต้นทาง × ขนส่ง" | `acc-forwarder.php` "ฝากนำเข้ายอดทั้งหมด" | 🔴 |
| **บัญชี Cargo → ฝากนำเข้า → ใบแจ้งหนี้** | `/admin/freight/declarations` | "ใบขนสินค้า (V-E11)" | `hs-forwarder-invoice.php` "ใบแจ้งหนี้ฝากนำเข้า" (Freight declarations ≠ Cargo invoice) | 🔴 |
| **บัญชี Cargo → ฝากชำระ/โอนหยวน** | `/admin/yuan-payments` | "ฝากโอนหยวน" | `acc-payment.php` (account-side อย่างเดียว · ไม่ใช่ ops yuan-payments) — ต่างคน | 🔴 |
| **บัญชี Cargo → ค่าตู้สินค้า (tb_cnt)** | `/admin/accounting/container-payments` | (ดู page) | OK — ใกล้แล้ว · แต่ legacy แยกเป็น `cnt-hs/` (ภูมิเพิ่งทำ `cnt-hs/page.tsx` แล้ว · ดู ORPHAN section §5) | 🟡 |
| **กระเป๋าสตางค์ → กระเป๋าทั้งหมด** | `/admin/wallet` | "กระเป๋าเงิน — รายการ" | OK (label ตรง intent) | ✅ |
| **บัญชี Cargo → ถอนเงิน โอนโดยตรง** | `/admin/wallet?kind=withdraw&status=pending` | "กระเป๋าเงิน — รายการ" + filter chip | `acc-withdraw.php` (ถอน-โอน-direct ฝั่งบัญชี ≠ wallet table) | 🔴 |
| **รายการเบิกเงิน → ค่าตู้สินค้า** | `/admin/accounting/disbursements?kind=container_lease` | "AP Ledger / สมุดจ่าย" + filter | `cnt-hs.php?q=1` (อนุมัติค่าตู้ — มีหน้าเฉพาะ · ไม่ใช่ AP-ledger filter) | 🔴 |
| **รายการเบิกเงิน → ค่าขนส่งไทย** | `/admin/accounting/disbursements?kind=trucking` | "AP Ledger / สมุดจ่าย" + filter | `freight-th/` (ค่าขนส่งไทย — มีหน้าเฉพาะ) | 🔴 |

**+ ~3 row ทำนองเดียวกัน** ใน `accCargo.*` sub-tree (refund · receipt · เป็น mixed mapping)

---

## 3. 🟠 Sidebar item เป็น filter ไม่ใช่ dedicated page (Bug Type 2)

> Bug example ของภูมิ:
> "คลิก `กระเป๋าสตางค์ → รายการถอนเงิน` → ไปเจอ `/admin/wallet?kind=withdraw&status=pending`
>  ซึ่งเป็น 'กระเป๋าเงิน-รายการทั้งหมด' มี filter chip — Legacy คือ
>  หน้า 'รายการถอนเงินเป๋า' แยก dedicated page"
> — ยืนยันแล้ว · นี่คือ row #1 ในตารางข้างล่าง

ตรงกับ rule ของภูมิ: **"ทุกหัวข้อ sidebar ต้องมีหน้า page ของมันเอง"**.
Pattern: 1 หน้าเดียวเป็น Pacred page · แต่ใส่ filter param หลายแบบ → legacy
เป็น 5-8 .php แยกขาดจากกัน (ทุกอันมี table + search + pagination เอง)

| Sidebar label (TH) | Pacred URL ปัจจุบัน | Shared page | Legacy .php (1:1 target) | Action |
|---|---|---|---|---|
| **กระเป๋าสตางค์ → รายการถอนเงิน** ⭐ ภูมิเห็น | `/admin/wallet?kind=withdraw&status=pending` | `app/.../wallet/page.tsx` | `wallet/withdraw/index.php` "รายการถอนเงินเป๋า" | BUILD `/admin/wallet/withdraw/page.tsx` (ลบ stub `app/.../withdrawals/page.tsx` ที่เป็น redirect) |
| **กระเป๋าสตางค์ → รายการเติมเงิน** | `/admin/wallet?kind=deposit&status=pending` | shared | `wallet/deposit/index.php` "รายการเติมเงิน" | BUILD `/admin/wallet/deposit/page.tsx` (ปัจจุบันเป็น redirect-stub) |
| **บัญชี Cargo → รายการเติมเงิน (topup)** | `/admin/wallet?kind=deposit&status=pending` | same | `acc-topup.php` (มุมบัญชี · คนละ table) | BUILD `/admin/accounting/topup/page.tsx` |
| **บัญชี Cargo → ถอนเงิน โอนโดยตรง** | `/admin/wallet?kind=withdraw&status=pending` | same | `acc-withdraw.php` | BUILD `/admin/accounting/withdraw/page.tsx` |
| **จัดการลูกค้า → สมาชิกทั่วไป** | `/admin/customers?group=general` | `app/.../customers/page.tsx` | `users/general/index.php` | BUILD `/admin/customers/general/page.tsx` |
| **จัดการลูกค้า → สมาชิก VIP** | `/admin/customers?group=vip` | shared | `users/vip/index.php` | BUILD `/admin/customers/vip/page.tsx` |
| **จัดการลูกค้า → สมาชิก SVIP** | `/admin/customers?group=svip` | shared | `users/svip/index.php` | BUILD `/admin/customers/svip/page.tsx` |
| **จัดการลูกค้า → สมาชิกนิติบุคคล** | `/admin/customers?group=corporate` | shared | `users/corporation/index.php` | BUILD `/admin/customers/corporation/page.tsx` |
| **จัดการลูกค้า → สมาชิกเครดิต** | `/admin/customers?group=credit` | shared | `users/credit/index.php` | BUILD `/admin/customers/credit/page.tsx` |
| **จัดการลูกค้า → สมาชิกคิดค่าเทียบ** | `/admin/customers?group=comparison` | shared | `users/comparison/index.php` | BUILD `/admin/customers/comparison/page.tsx` |
| **จัดการลูกค้า → ค้นหารหัสสมาชิก** | `/admin/customers?focus=search` | shared (auto-focus search) | `users-search.php` (dedicated search page) | BUILD `/admin/users-search/page.tsx` |
| **manageCustomers.freightAll → ลูกค้า Freight ทั้งหมด** | `/admin/customers?segment=freight` | shared | `OOP/Freight/menu-user.php` | BUILD `/admin/customers/freight/page.tsx` |
| **ฝากสั่ง → ค้นหาฝากสั่งซื้อ** | `/admin/service-orders` (default — ไม่มี ?q=search) | shared list | `shop-search.php` | BUILD `/admin/shop-search/page.tsx` |
| **ฝากสั่ง → ทั้งหมด** | `/admin/service-orders` | shared list | `shops/index.php` | OK (ใช้หน้านี้ตรง) — แต่ขัดกับ row above |
| **ฝากสั่ง → รอดำเนินการ** | `/admin/service-orders?q=1` | same list | `shops/?q=1` | ✅ legacy ก็ใช้ `?q=` แบบนี้ |
| **ฝากนำเข้า → ค้นหารายการนำเข้า** | `/admin/forwarders` (default · ไม่มี search-only mode) | shared list | `forwarder-search.php` (dedicated) | BUILD `/admin/forwarder-search/page.tsx` |
| **ฝากนำเข้า → รายการเตรียมส่ง** | `/admin/forwarders?q=6` | shared list | `forwarder.php?q=6` | ✅ legacy ใช้ pattern เดียวกัน |
| **ฝากนำเข้า → รายการนำเข้าเครดิต** | `/admin/forwarders?q=c` | shared list | `forwarder.php?q=c` | ✅ |
| **QA → สินค้าไม่มีเจ้าของ** | `/admin/forwarders?q=ownerless` | shared list (likely Pacred ไม่รองรับ `?q=ownerless` ในตัว filter) | `ownerlessProducts.php` (dedicated) | BUILD `/admin/qa/ownerless/page.tsx` |
| **QA → เตรียมส่งเกินกำหนด** | `/admin/forwarders?q=prepare-overdue` | shared list | `shippingPrepOverdue.php` | BUILD `/admin/qa/shipping-prep-overdue/page.tsx` |
| **QA → รอชำระสินค้าเกิน 1 วัน** | `/admin/reports/pending-payments?sla=shop-1d` | shared SLA page | `delayedPaymentShop.php` | BUILD `/admin/qa/delayed-payment-shop/page.tsx` |
| **QA → รอชำระค่านำเข้าเกิน 2 วัน** | `/admin/reports/pending-payments?sla=forwarder-2d` | shared | `delayedPaymentForwarder.php` | BUILD `/admin/qa/delayed-payment-forwarder/page.tsx` |
| **QA → เครดิตเกินกำหนด** | `/admin/reports/credit-pending?sla=overdue` | shared | `creditOverdueForwarder.php` | BUILD `/admin/qa/credit-overdue/page.tsx` |
| **QA → สั่งซื้อรอเกิน 10 นาที** | `/admin/reports/monthly-orders?sla=pending-10min` | shared | `shopS1Over10Min.php` | BUILD `/admin/qa/shop-s1-over-10min/page.tsx` |

**+ ~6 row อื่น ๆ ใน QA และ barcode** (`barcode?mode=*` 8 ตัว · ตรง KB §1.3.5 แยกเป็น `barcode-d-all` / `barcode-c-all` / ... — แต่ภูมิอาจไม่ต้องการแยก 8 file ทันที · ดู §6 priority)

**Total Bug Type 2 = ~24 row** · Action: BUILD dedicated page · ตัด `?param=` filter หรือเก็บไว้เป็น secondary URL ของหน้าเดิม

---

## 4. 🟡 Sidebar item ที่ยังไม่มีหน้า (Missing — sidebar ชี้ 404 / redirect-เงียบ)

ตอนนี้ "ไม่มีหน้า" แบ่ง 2 แบบ:
- **404 จริง ๆ** (Pacred URL ไม่ได้อยู่ใน app/ structure)
- **Silent redirect** (มี stub `page.tsx` ที่ redirect ไป URL อื่น — staff งง เพราะ URL bar เปลี่ยน + h1 ก็ไม่ใช่)

| Sidebar label | URL ชี้ไป | สถานะ | Legacy .php | Action |
|---|---|---|---|---|
| **ฝากสั่ง → รถเข็นสินค้า** | `/admin/service-orders/cart` | silent redirect → `/admin/service-orders?q=1` | `cart/index.php` "รถเข็นสินค้า (admin view)" | BUILD `cart/page.tsx` (admin ดู cart ของลูกค้า · 870 LOC legacy) |
| **ฝากสั่ง → เพิ่มสินค้าในรถเข็น** | `/admin/service-orders/cart/add` | silent redirect → `/admin/service-orders?q=1` | `cart/add/index.php` (CS push item เข้า cart ลูกค้า) | BUILD `cart/add/page.tsx` (legacy support ~151 item) |
| **ฝากนำเข้า → รวมบิลสินค้า** | `/admin/forwarders/combine-bill` | silent redirect → `/admin/forwarders` | `forwarder-bill.php` (multi-row → 1 บิล · mPDF) | BUILD `combine-bill/page.tsx` |
| **ฝากนำเข้า → ประวัติเข้าโกดังไทย** | `/admin/forwarders/warehouse-history` | silent redirect → `/admin/warehouse/containers` | `forwarder-import-warehouse/index.php` (scan-event log) | BUILD `warehouse-history/page.tsx` |
| **ฝากนำเข้า → CargoCenter Dashboard** | (ไม่มีใน Pacred sidebar เลย) | absent | `api-forwarder-cn.php?page=dashboard` | BUILD `/admin/cargo-center/page.tsx` |
| **ฝากนำเข้า → API SM/แทรค Real Time** | (ไม่มีใน Pacred sidebar) | absent | `api-forwarder-cn.php?page=APICheckSM` | BUILD `/admin/cargo-center/sm/page.tsx` |
| **ฝากนำเข้า → CTT / Sang / MK / MX (4 sheet adjusters)** | (ไม่มี) | absent | `api-sheets-{ctt,sang,mk,mx}.php` | BUILD 4 page (เป็น up-sheet sub-tree) |
| **ฝากนำเข้า → JMF / GOGO** | (ไม่มี) | absent | `api-forwarder-jmf.php` / `api-forwarder-gogo.php` | BUILD 2 page |
| **ฝากนำเข้า → หมายเหตุนำเข้า** | `/admin/forwarders/notes` | ใช้ได้ · h1="หมายเหตุนำเข้า" | `forwarder-action.php?action=Note` | ✅ (อาจแค่ change slug ให้ตรง legacy) |
| **บัญชี Cargo → รายรับ-รายจ่าย** | `/admin/accounting` | h1="ระบบบัญชี" (เป็น index ใหญ่ ไม่ใช่ "ประวัติรายการ") | `acc-system.php` (รายรับ + รายจ่าย + ประวัติ) | BUILD `/admin/accounting/system/page.tsx` (หรือเรียก index แต่เปลี่ยน h1) |
| **บัญชี Cargo → คืนเงินเข้า Wallet → ฝากสั่ง** | `/admin/refunds` | h1="คำขอคืนเงิน (Refunds — U1-6)" (ไม่ใช่ shop-refund) | `acc-shop-refund.php` | BUILD `/admin/accounting/refunds/shop/page.tsx` |
| **บัญชี Cargo → คืนเงินเข้า Wallet → ฝากนำเข้า** | `/admin/refunds` | shared | `acc-forwarder-refund.php` | BUILD `/admin/accounting/refunds/forwarder/page.tsx` |
| **บัญชี Cargo → ระบบบัญชี Cargo** (header link) | (ภูมิเห็นใน screenshot · Pacred ยังไม่ map) | absent | `acc-system-cargo.php` (หน้า top-bar เฉพาะ) | BUILD `/admin/accounting/cargo/page.tsx` |
| **บัญชี Freight → ใบหัก ณ ที่จ่าย (WHT)** | `/admin/accounting/closing` | h1="ปิดงบฝากนำเข้ารายเดือน" (period close ≠ WHT) | (Freight WHT) | BUILD `/admin/freight/wht/page.tsx` |
| **บัญชี Freight → ภาพรวม** | `/admin/reports` | h1="รายงาน" (เป็น index Pacred · ไม่ใช่ Freight overview) | (Freight overview) | BUILD `/admin/freight/overview/page.tsx` |
| **HR → KPI / โบนัส / ตั้งเงินเดือน / สรุปเงินเดือน / ประวัติเงินเดือน** (5 ตัว) | (Pacred sidebar ไม่ list เลย) | absent | (HR menu deep) | BUILD ~5 page (deferred per role priority) |
| **HR → จัดการทรัพย์สิน → เครื่องมือในการทำงาน → ไลน์ / WeChat / Domainname** | (ไม่มี) | absent | `organization-line/`, `organization-wechat/`, `organization-domainname/` | BUILD 3 page (ภูมิเพิ่งทำ `organization-email/` แล้ว ·เป็น pattern เดียวกัน) |
| **Extension → จองห้องประชุม** | `/admin/hr/attendance?tab=meeting-room` | filter on HR attendance | `meeting-room-booking/` (dedicated calendar) | BUILD `/admin/meeting-room/page.tsx` |

**+ ~5 row อื่น ๆ** (มีใน KB ไม่อยู่ใน Pacred sidebar เลย — ดู QA queue ที่เหลือ + WHT + sales-history)

---

## 5. 👻 Page มี แต่ sidebar ไม่ชี้ (Orphan — staff หาไม่เจอ ทั้งที่หน้าทำเสร็จแล้ว)

| Page path | h1 | ควรอยู่ใต้ section ไหน | Note |
|---|---|---|---|
| `/admin/cnt-hs` | (faithful 1:1 transcription ของ `cnt-hs.php` · h1 หา manually แต่เป็น "รายการเบิกเงินค่าตู้") | **รายการเบิกเงิน → ค่าตู้สินค้า** | ภูมิเพิ่งทำ faithful-port · sidebar ยังชี้ `/admin/accounting/disbursements?kind=container_lease` (filter) → ต้องเปลี่ยน href เป็น `/admin/cnt-hs` |
| `/admin/admins` | "รายชื่อพนักงานทั้งหมดแบบตารางข้อมูล" (admin-table.php faithful) | **HR → ทรัพยากรบุคคล → พนักงานทั้งหมด** | ภูมิเพิ่งทำ faithful-port · sidebar ชี้ `/admin/hr/employees` (Pacred แบบเก่า · h1="รายชื่อพนักงานทั้งหมดแบบตารางข้อมูล") → choose one + ลบอีกอัน |
| `/admin/organization-email` | "อีเมลในองค์กร" (faithful) | **HR → จัดการทรัพย์สิน → เครื่องมือ → อีเมลในองค์กร** | ภูมิเพิ่งทำ · sidebar ยังไม่ link |
| `/admin/contact-messages` | "ข้อความติดต่อจากเว็บไซต์" | **Cargo & Freight → ติดต่อ** หรือ Extension | sidebar ไม่ link ที่ไหนเลย — staff เข้าไม่ได้ |
| `/admin/board` | "กระดานงานข้ามแผนก (Work Board)" | **Cargo & Freight → กระดานงาน** (Pacred U4-ใหม่ · post-launch · ไม่อยู่ใน legacy) | OK ที่ไม่มี legacy ref — แต่ sidebar ก็ไม่ shows → staff ไม่เจอ |
| `/admin/board/inbox` | "กล่องงานของฉัน (My Inbox)" | เดียวกัน | ตามด้านบน |
| `/admin/learning` | "📚 เรียนรู้และข้อมูลภายใน" | **Learning** section (Pacred รวมเป็นหน้าเดียว · legacy แยก 4 ตัว: regulations · training · newsfeed · TOS) | sidebar items ชี้ `/admin/learning?topic=...` (filter) — orphan เพราะ legacy spec บอกให้แยก |
| `/admin/migration/pcs-customers` | "PCS → Pacred customer migration" | **Settings** (system tool) | sidebar ไม่ link · เป็น operational tool · OK ถ้าจงใจซ่อน |

---

## 6. ลำดับงานที่แนะนำ (priority — ทำตามลำดับ)

| ลำดับ | กลุ่ม | จำนวน row | Action verb | Why ทำก่อน |
|---|---|---|---|---|
| **P0** | 🔴 Bug Type 1 — sidebar ชี้ผิด page (รายงาน + บัญชี Cargo) | ~12 row | **RELINK** href ใน `sidebar-menu.ts` หรือ BUILD page ใหม่ | Staff หาผิดที่ทุกครั้งที่ใช้ → confusing เร็วที่สุด · แก้ใน sidebar-menu.ts ไฟล์เดียว = ปลดล็อก 12 problem ใน 30 นาที |
| **P1** | 🟡 Missing — silent redirect (cart · combine-bill · warehouse-history) | ~3 row | DELETE stub + BUILD page faithful | staff click → ไป URL อื่น → URL bar เปลี่ยน → งงว่า "ทำไมเข้าไม่ได้" |
| **P2** | 👻 Orphan — faithful-port page ที่ทำแล้วแต่ sidebar ไม่ชี้ (cnt-hs · admins · organization-email) | ~3 row | RELINK sidebar.ts → faithful-port URL · ลบ duplicate href ของ Pacred-old | งานที่ภูมิเพิ่งเทียบ 1:1 แล้ว แต่ staff หาไม่เจอ — quick win |
| **P3** | 🟠 Bug Type 2 — filter แทน page (wallet/withdraw · users/vip · users/svip · ฯลฯ) | ~24 row | BUILD dedicated page (faithful-port pattern) | ตรง rule ของภูมิเอง · scope ใหญ่ที่สุด · แต่แต่ละ page ใหม่ใช้เวลาทำ (~1-2 ชม.) |
| **P4** | 🟡 Missing — CargoCenter / up-sheet adjusters (~7 page) + HR salary deep (~5 page) | ~12 row | BUILD ตาม legacy spec | scope ใหญ่ + admin หลายระดับ — ผัดได้สักหน่อย (admin-only · เริ่มจาก CargoCenter เพราะ ops ใช้ทุกวัน) |
| **P5** | 🟠 Bug Type 2 — Barcode 8 variant แยก URL | ~6 row | DECISION — Q ใส่ใน §7 (split 8 path หรือ keep 1 path + ?mode= ตาม legacy URL) | ต้อง design call ก่อน · ไม่ block ops วันนี้ |

**Total = ~60 row · ~78 ชม. ของงาน** (estimate · faithful-port pattern · 1-1.5 ชม. ต่อ page)

---

## 7. คำถาม design ที่ต้องตัดสินใจก่อน Bug Type 2 ลงมือ

1. **Barcode 8 variant.** Legacy `/barcode-d-all/`, `/barcode-c-all/`, `/barcode-d-import/`, `/barcode-d-prepare/`, `/barcode-c-prepare/`, `/barcode-d-from/`, `/barcode-c-from/` — 8 path แยก
   - ตอนนี้ Pacred = 1 path `/admin/barcode?mode=...` (filter pattern)
   - **Decision Q:** แตกเป็น 8 `page.tsx` faithful เลย? หรือเก็บเป็น 1 path + URL `?mode=` ตาม legacy URL ที่ทำงานจริง?
   - **ภูมิ rule ตรง ๆ:** ทุก sidebar = own page → ต้องแยก 8 file
   - **แต่:** scope ใหญ่ · staff workflow คือกด `?mode=` URL อยู่แล้ว · อาจ keep 1 file + 8 URL ใน sidebar ที่ใช้ตาม legacy slug (`/admin/barcode/scan-all`, `/admin/barcode/camera-all`, ฯลฯ)

2. **`users/vip/` vs `customers?group=vip`.** legacy = แยก path · Pacred = filter
   - row scope = 8 segment (vip, svip, general, corporate, credit, comparison, all, search)
   - แต่ละ page = copy-paste ของ Pacred `customers/page.tsx` + เปลี่ยน default filter หรือ?
   - **ภูมิ rule:** แยก = ใช่ — แต่ logic table identical แค่ filter
   - **Q:** สร้าง 8 page ที่ wrap shared `<CustomerListView group="vip" />` หรือ?

3. **บัญชี Cargo accounting tree.** legacy แยก `acc-shop.php` · `acc-forwarder.php` · `acc-payment.php` · `acc-topup.php` · `acc-withdraw.php` · `acc-shop-refund.php` · `acc-forwarder-refund.php` (7 path)
   - Pacred รวมเป็น `/admin/accounting` + `/admin/accounting/disbursements?kind=...`
   - 7 page ใหม่ใต้ `/admin/accounting/{shop,forwarder,payment,topup,withdraw,shop-refund,forwarder-refund}/page.tsx`
   - **Q:** เริ่ม build เลย หรือ design `/admin/accounting/[sub]` dynamic route?

4. **`/admin/admins` (faithful) vs `/admin/hr/employees` (Pacred-old)** — มี 2 หน้า · ทำงานคล้ายกัน · h1 เหมือนกัน
   - **Q:** ทิ้งอันไหน · เก็บอันไหน?
   - legacy slug = `admin-table.php` → faithful URL ตรงกว่า `/admin/admins`
   - แต่ Pacred-old มี HR section ที่ครอบ employees · org-chart · attendance — มี logic เพิ่มเติม

5. **`/admin/accounting/container-payments` (Pacred-new) vs `/admin/cnt-hs` (faithful)** — เหมือนกัน 2 รอบ
   - ภูมิเพิ่งทำ `cnt-hs` faithful · มี comment ระบุ "separately rebuilt Tailwind variant lives at `/admin/accounting/container-payments` and stays"
   - **Q:** ทำไมเก็บไว้ 2 อัน? sidebar ชี้ไหน? → ภูมิตัดสินใจ

---

## 8. Cross-references

- **Canonical legacy IA:** `C:\Users\Admin\OneDrive\Desktop\ERP\pacred-obsidian\Knowledge Base\PCS_ADMIN_ROLES_AND_MENUS.md` (1304L · 34 roles · 22 sidebar variants · ทุก href + sub-href)
- **Business flow context:** `C:\Users\Admin\OneDrive\Desktop\ERP\pacred-obsidian\Knowledge Base\BUSINESS_FLOW.md` (187L)
- **In-repo cross-check:** `docs/research/sidebar-fidelity-audit/06-legacy-menu-structure.md` (corroborates §1 KB · agrees on 6 fixed section + 22 sidebar)
- **Pacred sidebar source:** `lib/admin/sidebar-menu.ts` (716 LOC · 7 OOP block + 7 role menu)
- **Pacred i18n labels:** `messages/th.json` §`pcsAdminNav` (line 2383-2617)
- **Pacred page reality:** 110 file ใน `app/[locale]/(admin)/admin/**/page.tsx`
- **Earlier audits (worth re-reading):**
  - `docs/research/sidebar-fidelity-audit/01-broken-links.md` (per-href broken inventory)
  - `docs/research/sidebar-fidelity-audit/02-wallet-withdrawal-pattern.md` (wallet pattern deep-dive — covers Bug Type 2 ของ wallet)
  - `docs/research/sidebar-fidelity-audit/03-mislinks.md` (full inventory of mismatches)
  - `docs/research/sidebar-fidelity-audit/_MASTER-FIX-PLAN.md` (the umbrella plan + decision matrix)
- **Faithful-port runbook:** `docs/runbook/faithful-port-transcription.md` §8 (admin pattern — ภูมิตามนี้กับ `admins/`, `cnt-hs/`, `organization-email/`)
- **D1 / owner mandate:** `docs/decisions/0017-pacred-faithful-pcs-port.md` + AGENTS.md §2 "ต้องเอาของเดิมมา copy ให้ได้ ให้เหมือนทั้งหมด 100% ก่อน"

---

*Audit run: 2026-05-20 · against HEAD `714cb7a` (Poom-pacred · post-merge ของ dave-pacred overnight)*
