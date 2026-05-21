# Admin page inventory — ทุกหน้าและสถานะ (ภูม brief 2026-05-21 night)

> ภูม "เช็คหน่อยที่บอกอะว่าหน้าไหนยังไม่มีทางเข้า ยังเข้ามั่วอยู่ ยังไม่มี
> ปุ่มให้กดเข้าอะ จะได้รู้ จะได้บอกได้ว่าจะเอายังไงกับหน้านั้นๆ"

ตารางนี้เป็น checklist สำหรับภูมเช็คทีละหน้า · เลือกว่า **delete / wire / keep / build**.

**Legend:**
- 🔴 **DEAD** — หน้าเข้าไม่ได้เลย (ไม่มีปุ่มในระบบ พิมพ์ URL เท่านั้น)
- 🟡 **WRONG DATA** — เข้าถึงได้ แต่อ่าน schema ผิด → โชว์ข้อมูลว่างหรือผิด
- 🟢 **OK** — เข้าได้ + ข้อมูลถูก
- ⚪ **REDIRECT** — เป็น stub redirect (intentional · ไม่ต้องแก้)
- 🔵 **PACRED-ONLY** — ไม่มีใน legacy PCS · เป็นฟีเจอร์ใหม่ของ Pacred (Phase C)
- ✅ **FIXED** — แก้แล้วในเซสชันนี้

---

## ✅ Wave 7.2 — แก้แล้วในเซสชันนี้ (Wave 7 + 7.1 + 7.2 รวม)

| Surface | สถานะก่อน | สถานะตอนนี้ |
|---|---|---|
| /admin/customers/`[id]` row 404 | rebuilt schema notFound() | tb_users legacy fallback + recent 10 forwarders/orders/payments |
| /admin/service-orders/`[hNo]` row 404 | rebuilt schema notFound() | tb_header_order legacy fallback |
| /admin/yuan-payments/`[id]` (didn't exist) | 404 | tb_payment detail view (slip + customer + admin slip) |
| /admin/sales-payouts/`[id]` (didn't exist) | 404 | sales_payouts stub (Pacred-only · empty on prod) |
| /admin/forwarders "มอบงานคนขับ" → /drivers | /admin/forwarders/drivers (404) | /admin/drivers |
| /admin/yuan-payments list | empty rebuilt | tb_payment list (1,460 rows · status tabs · search) |
| /admin/yuan-payments/new "+ เพิ่มรายการ" | silent redirect to list | Wave 8 banner + alternative path |
| /admin/drivers sidebar | only via /admin/forwarders menubar | + menuSuper sidebar leaf (driverItems badge) |
| /admin/wallet list | empty rebuilt wallet_transactions | tb_wallet_hs (104,591 rows · type chips · status chips · search · pending count chips) |
| /admin/wallet/history | empty rebuilt | redirect to /admin/wallet?status=2 |
| /admin/wallet/add | rebuilt form (broken) | Wave 8 banner + alternative path |
| /admin/customers/pending | rebuilt profiles | tb_users.useractive='0' |
| /admin/customers/recently-active | empty 3-table aggregate | tb_users.userlastlogin desc + 30/90-day dormancy |
| /admin/customers/transfer-rep | rebuilt bulk form | Wave 8 banner + per-customer fallback |
| /admin/service-orders chip ?q=1 → ?status= | silent no-op | ?status=pending |
| /admin/report-cnt container code link | silent no-op (?id=…) | drills into /admin/forwarders search by container |
| /admin dashboard payShop tab label | misleading | suffixed " (Phase C)" |
| /admin/reports/forwarder-volume | empty rebuilt | tb_forwarder aggregate by warehouse × transport |
| /admin/reports/sales-by-rep | empty rebuilt | Wave 8 banner (cross-table SUM/GROUP BY needs Postgres view) |
| /admin/reports/user-sales-history | empty rebuilt | redirect to /admin/customers (search) |
| /admin/reports/user-sales-history/`[customer_id]` | empty rebuilt | redirect to /admin/customers/`[id]` |
| /admin/rates/custom-user | empty rebuilt | Phase A backlog banner (legacy tb_priceuser_* not migrated yet) |
| /admin/rates/custom-hs | empty rebuilt | Phase A backlog banner (same migration gap) |
| sidebar "ระบบบัญชี" | 2-child dropdown (Cargo/Freight) | **single leaf** → `/admin/accounting/cargo` + Cargo/Freight pills ในหน้า head (mirrors `/admin/forwarders` pattern) |

**Total Wave 7.2 fixes shipped tonight: 23 surfaces** · across 9 commits.

---

## 🔴 DEAD — ไม่มีปุ่มเข้าหน้านี้ในระบบ (ภูมเลือก action)

| Route | คำอธิบาย | Suggested action | Action ภูม |
|---|---|---|---|
| `/admin/system/crons` | จัดการ cron jobs (เช่น OTP cleanup, backup) | wire ใน Settings → "ระบบ" submenu | _____ |
| `/admin/system/notifications` | ดูประวัติ system notification | wire ใน Settings → "ระบบ" submenu | _____ |
| `/admin/csv-imports` (+ upload + `[id]`) | bulk CSV import tool | wire ใน Settings → "นำเข้าข้อมูล" | _____ |
| `/admin/migration/pcs-customers` | one-shot tool ย้ายข้อมูล PCS → Pacred | **keep orphan** (super only · ใช้ครั้งเดียว) | _____ |
| `/admin/organization-email` | (purpose ไม่แน่ใจ) | **delete หรือ wire** (ภูมเช็คก่อน) | _____ |
| `/admin/accounting/periods` | จัดการ accounting period (งวด) | wire ใน CARGO_MENUBAR (Cargo accounting hub) — "การบัญชี → งวด" group | _____ |
| `/admin/accounting/reconcile` | กระทบยอด accounting | wire ใน CARGO_MENUBAR — "การบัญชี → กระทบยอด" group | _____ |
| `/admin/accounting/container-costs` | ต้นทุนต่อตู้ tracking | wire ใน `/admin/forwarders` "งาน" group หรือ CARGO_MENUBAR "รายจ่าย → ต้นทุนตู้" | _____ |
| `/admin/forwarders/container-cost-check` | เช็ค container cost (เครื่องมือ) | wire ใน `/admin/forwarders` "งาน" group | _____ |
| `/admin/refunds` (+ `new` + `[id]`) | คืนเงินลูกค้า · 🔵 Pacred-only | wire ใน Wallet "จัดการ → คืนเงิน" | _____ |
| `/admin/reports/containers-hs` | รายงาน HS code ของตู้ | wire ใน Reports menubar | _____ |
| `/admin/admins` (+ `[id]`) | จัดการ admin users | wire ใน HR หรือ Settings (super only) | _____ |

---

## 🟡 WRONG DATA — เข้าได้ แต่อ่าน schema ผิด (เหลือ 1 หลังคืนนี้)

| Route | ปัญหา | Priority |
|---|---|---|
| `/admin/settings/notifications` · `/admin/system/notifications` | log ว่าง (รบสร้างใหม่ · ไม่มี data) | 🟡 P2 (low-impact log views) |
| `/admin/audit` | บางส่วนยังอ่าน rebuilt (ส่วน admin actions) | 🟡 P2 |
| `/admin/reports/credit-pending` · `monthly-orders` · `pending-payments` | orphan + stale | 🟡 P2 — wait for ภูม wire/delete |

---

## 🆕 Sidebar patterns ที่ใช้แล้ว (2 หน้า · ภูมยืนยัน 2026-05-21 night)

หน้าที่ใช้ pattern "single leaf + Segmented Control ในหน้า head":

| Sidebar leaf | URL | Segmented Control ในหน้า | Component |
|---|---|---|---|
| บริการนำเข้า | `/admin/forwarders` | บริการ (Cargo/Freight) · ตู้ (FCL/LCL) | inline `SegmentedPills` ในหน้า |
| ระบบบัญชี | `/admin/accounting/cargo` | Cargo / Freight | `components/admin/accounting-segment-pills.tsx` |

**Candidate ต่อไปที่อาจใช้ pattern นี้** (ภูมเลือก):
- HR (`hr/humanresource` ↔ `hr/assets` — 2 hubs)
- Settings (`settings/general` ↔ `settings/business-config` ↔ `settings/tos-versions`)

---

## ⚪ REDIRECT — intentional (12 routes · ไม่ต้องแก้)

| Route | → ไปไหน | เหตุผล |
|---|---|---|
| `/admin/dashboard` | `/admin` | rename intentional |
| `/admin/inventory` | `/admin/barcode` | rename intentional |
| `/admin/warehouse/containers` | `/admin/report-cnt` | Option C tombstone |
| `/admin/containers` | `/admin/warehouse/containers` → `/admin/report-cnt` | double-hop (innocuous) |
| `/admin/containers/[id]` | `/admin/report-cnt` | spine retired |
| `/admin/withdrawals` | `/admin/wallet?kind=withdraw` | Pacred unified view |
| `/admin/wallet/deposit` | `/admin/wallet?kind=deposit&status=pending` | filter shortcut |
| `/admin/wallet/pay-user` | `/admin/wallet?kind=order_payment` | filter shortcut |
| `/admin/wallet/history` | `/admin/wallet?status=2` | Wave 7.2 new |
| `/admin/reports/user-sales-history` | `/admin/customers/recently-active` | Wave 7.2 new |
| `/admin/reports/user-sales-history/[customer_id]` | `/admin/customers/[customer_id]` | Wave 7.2 new |
| `/admin/customers/[id]/convert-to-juristic` | `/admin/customers/[id]` (after action) | post-submit nav |

---

## 🔵 PACRED-ONLY — ใช้ rebuilt schema ถูกต้อง (Phase C features · 15 routes)

ไม่ใช่ bug — เป็นฟีเจอร์ใหม่ของ Pacred ที่ไม่มีใน legacy PCS:

- `/admin/refunds` · `new` · `[id]` — คืนเงินลูกค้า (Pacred ใหม่)
- `/admin/freight/declarations` · `quotes` · `shipments` — ระบบ freight ของ Pacred
- `/admin/sales-payouts` · `commissions` · `team-leaders` — commission engine
- `/admin/kpi` — KPI dashboard
- `/admin/board` · `inbox` — kanban
- `/admin/tax-invoices` · `[id]` — tax-invoice flow
- `/admin/bookings` · `[bookingNo]` — booking flow
- `/admin/contact-messages` — lead funnel
- `/admin/broadcasts` · `new` · `[id]` — messaging
- `/admin/incidents` — incident triage
- `/admin/hr/*` (ยกเว้น audit) — HR rebuilt
- `/admin/learning` — learning hub

---

## P0 / P1 / P2 status

**ส่งคืนนี้ Wave 7 + 7.1 + 7.2 รวม 22 surfaces (8 commits):**
- ✅ P0 ทั้งหมด → ส่งหมด
- ✅ P1 ทั้งหมด → ส่งหมด
- ⏳ P2 (orphan wire) → รอภูมตัดสินใจตามตาราง 🔴 DEAD ข้างบน

**Phase A migration backlog** (block หลายๆฟีเจอร์):
- ต้อง migrate `tb_priceuser_member` + `tb_priceuser_hs` → unblock rates pages
- (3 oversized log tables ยังค้าง · 779 MB · backfill ผ่าน `scripts/backfill/03-log-tables/_extract.mjs all` หลัง Pro upgrade เสร็จ)

**Wave 8 backlog** (สำหรับเซสชันถัดไป):
- Wallet bulk-approve bar + slip-transferred-at editor (mutate tb_wallet_hs)
- Yuan-payments bulk-approve bar
- Customer pending Approve action button
- Customer bulk transfer-rep form (tb_users.adminidsale + admins table join)
- Admin-initiated wallet topup (form → INSERT tb_wallet_hs)
- Admin-initiated yuan payment (form → INSERT tb_payment)
- /admin/reports/sales-by-rep — Postgres view + RPC for cross-table SUM/GROUP BY
- /admin/reports/user-sales-history — full V-G6 cohort tool on tb_*

---

## วิธีใช้เอกสารนี้

ภูมเปิดมา · ดูตาราง 🔴 DEAD ก่อน · ใส่ "Action ภูม" เป็นอย่างใดอย่างหนึ่ง:
- **wire** = ให้ไปเพิ่ม entry ใน sidebar / menubar
- **delete** = หน้านี้ไม่ใช้ · ลบทิ้ง
- **keep** = orphan ตั้งใจ (เช่น super-only utility)
- **build** = หน้านี้ยังไม่เสร็จ · ต้อง implement ต่อ

หลังภูมตัดสิน · ผมจะรวมเป็น Wave 7.3 task list + ไปไล่ทำ.
