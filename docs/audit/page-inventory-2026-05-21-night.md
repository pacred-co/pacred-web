# Admin page inventory — ทุกหน้าและสถานะ (ภูม brief 2026-05-21 night)

> ภูม "เช็คหน่อยที่บอกอะว่าหน้าไหนยังไม่มีทางเข้า ยังเข้ามั่วอยู่ ยังไม่มี
> ปุ่มให้กดเข้าอะ จะได้รู้ จะได้บอกได้ว่าจะเอายังไงกับหน้านั้นๆ"

ตารางนี้เป็น checklist สำหรับภูมเช็คทีละหน้า · เลือกว่า **delete / wire / keep / build**.
ฟีลด์ "Action" เว้นว่างไว้ให้ภูมเขียนตัดสินใจลงไปได้.

**Legend:**
- 🔴 **DEAD** — หน้าเข้าไม่ได้เลย (ไม่มีปุ่มในระบบ พิมพ์ URL เท่านั้น)
- 🟡 **WRONG DATA** — เข้าถึงได้ แต่อ่าน schema ผิด → โชว์ข้อมูลว่างหรือผิด
- 🟢 **OK** — เข้าได้ + ข้อมูลถูก
- ⚪ **REDIRECT** — เป็น stub redirect (intentional · ไม่ต้องแก้)
- 🔵 **PACRED-ONLY** — ไม่มีใน legacy PCS · เป็นฟีเจอร์ใหม่ของ Pacred (Phase C)

---

## 🔴 DEAD — ไม่มีปุ่มเข้าหน้านี้ในระบบ (10 routes · ภูมเลือก action)

| Route | คำอธิบาย | ทางที่ควรเข้า | Suggested action | Action ภูม |
|---|---|---|---|---|
| `/admin/system/crons` | จัดการ cron jobs (เช่น OTP cleanup, backup) | ไม่มี | wire ใน Settings → "ระบบ" submenu | _____ |
| `/admin/system/notifications` | ดูประวัติ system notification | ไม่มี | wire ใน Settings → "ระบบ" submenu | _____ |
| `/admin/csv-imports` | bulk CSV import tool (รายการ) | ไม่มี | wire ใน Settings → "นำเข้าข้อมูล" | _____ |
| `/admin/csv-imports/upload` | บัปโหลด CSV ใหม่ | reachable from `/admin/csv-imports` ถ้า wire แล้ว | (auto-wired with above) | _____ |
| `/admin/migration/pcs-customers` | one-shot tool ย้ายข้อมูล PCS → Pacred | ไม่มี · ใช้ครั้งเดียว | **keep orphan** (super only · ใช้ครั้งเดียว) | _____ |
| `/admin/organization-email` | (ไม่แน่ใจ purpose · ต้องเช็ค) | ไม่มี | **delete หรือ wire** (ภูมเช็คก่อน) | _____ |
| `/admin/accounting/periods` | จัดการ accounting period (งวดปิดบัญชี) | ไม่มี | wire ใน `/admin/accounting/cargo` menubar "งวด" | _____ |
| `/admin/accounting/reconcile` | กระทบยอด accounting | ไม่มี | wire ใน `/admin/accounting/cargo` menubar | _____ |
| `/admin/accounting/container-costs` | ต้นทุนต่อตู้ tracking | ไม่มี | wire ใน `/admin/forwarders` "งาน" หรือ Accounting | _____ |
| `/admin/forwarders/container-cost-check` | เช็ค container cost (เครื่องมือ) | ไม่มี | wire ใน `/admin/forwarders` "งาน" group | _____ |
| `/admin/refunds` (+ `new` + `[id]`) | คืนเงินลูกค้า · 🔵 Pacred-only | ไม่มี | wire ใน Wallet "จัดการ → คืนเงิน" (Pacred-only feature) | _____ |
| `/admin/reports/containers-hs` | รายงาน HS code ของตู้ | ไม่มี | wire ใน Reports menubar (verify ใช้งานจริงไหม) | _____ |
| `/admin/admins` (+ `[id]`) | จัดการ admin users | ไม่มี (มีลิงก์จาก `/admin/hr` กรอบเดียว) | wire ใน HR หรือ Settings (super only) | _____ |

---

## 🟡 WRONG DATA — เข้าได้ แต่อ่าน schema ผิด (10 surfaces · ต้อง rewrite)

| Route | ปัญหา | ตอนนี้อ่าน | ต้องอ่าน (tb_*) | Priority |
|---|---|---|---|---|
| `/admin/wallet` (list) | สวอปกับ dashboard ดู ID คนละชุด | `wallet_transactions` (รบสร้างใหม่ · ว่าง) | `tb_wallet_hs` (เหมือน `/admin/wallet/[id]`) | 🔴 **P0** |
| `/admin/customers/recently-active` | โชว์ "—" ทุกคน | `profiles.last_seen` | `tb_users.userlastlogin` | 🟡 P1 |
| `/admin/customers/pending` | คิวลูกค้ารออนุมัติว่าง | `profiles.status='pending'` | `tb_users.useractive='0'` | 🟡 P1 |
| `/admin/customers/transfer-rep` | โอนเซลล์ไม่ทำงาน | `profiles.sales_admin_id` | `tb_users.userid_sales` | 🟡 P1 |
| `/admin/reports/sales-by-rep` | ใน menubar · ตัวเลขรายได้เป็น ฿0 | rebuilt schema | tb_* aggregates | 🟡 P1 |
| `/admin/reports/forwarder-volume` | ใน menubar · กราฟว่าง | `forwarders` | `tb_forwarder` group by | 🟡 P1 |
| `/admin/reports/user-sales-history` | ใน menubar · ค้นหาลูกค้าไม่เจอ | `profiles` | `tb_users` | 🟡 P1 (operator ใช้ทุกวัน) |
| `/admin/reports/credit-pending` · `monthly-orders` · `pending-payments` | orphan + stale | rebuilt | tb_* | 🟡 P2 |
| `/admin/rates/custom-user` · `/admin/rates/custom-hs` | rate ไม่โชว์ | `rate_custom_*` | `tb_priceuser_*` | 🟡 P1 |
| `/admin/settings/notifications` · `/admin/system/notifications` | log ว่าง | rebuilt | `tb_admin_action_log` / `tb_settings` | 🟡 P2 |

---

## 🔴 BUTTONS WITH WRONG TARGET / SILENT NO-OP (3 found)

| ที่ไหน | ปุ่มกด | ปัญหา | แก้แล้วไหม |
|---|---|---|---|
| `/admin/service-orders` page top-menubar | "สถานะ → รอดำเนินการ" | URL `?q=1` แต่ page อ่าน `?status=...` → กดแล้วไม่เกิดอะไร | ⏳ ยังไม่ได้แก้ |
| `/admin/report-cnt` หน้ารายการตู้ | คลิกที่ container code → URL มี `?id=...` | page ไม่อ่าน `sp.id` → no-op | ⏳ ยังไม่ได้แก้ |
| `/admin` dashboard payShop tab | "payShop" tab | อ่าน empty rebuilt `sales_payouts` · badge=0 เสมอ | ⏳ Phase C decision |

---

## 🟢 OK — ทำงานดี (62 sidebar leaves + 60+ menubar leaves)

ทั้งหมดผ่าน Chrome MCP browser sweep (Agent A · 2026-05-21 night) — 0 broken render.
ดูรายชื่อเต็มใน `docs/audit/re-audit-2026-05-21-night.md` §E.

---

## ⚪ REDIRECT — intentional (10 routes · ไม่ต้องแก้)

| Route | → ไปไหน | เหตุผล |
|---|---|---|
| `/admin/dashboard` | `/admin` | rename intentional |
| `/admin/inventory` | `/admin/barcode` | rename intentional |
| `/admin/warehouse/containers` | `/admin/report-cnt` | Option C tombstone (spine retirement) |
| `/admin/containers` | `/admin/warehouse/containers` → `/admin/report-cnt` | double-hop (innocuous) |
| `/admin/containers/[id]` | `/admin/report-cnt` | spine retired |
| `/admin/withdrawals` | `/admin/wallet?kind=withdraw` | Pacred unified view |
| `/admin/wallet/deposit` | `/admin/wallet?kind=deposit&status=pending` | filter shortcut |
| `/admin/wallet/pay-user` | `/admin/wallet?kind=order_payment` | filter shortcut |
| `/admin/forwarders/new` | `/admin/forwarders` | admin-initiated form not built (Wave 8) |
| `/admin/customers/[id]/convert-to-juristic` | `/admin/customers/[id]` (after action) | post-submit nav |

---

## 🔵 PACRED-ONLY — ใช้ rebuilt schema ถูกต้อง (Phase C features)

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

## P0 sprint (P1 ตอนเย็น 2026-05-21 ส่งบางส่วนแล้ว) — Wave 7.1 ส่งแล้ว

ส่งแล้ว (commit `4959c14` + `85c8eed` + ตอนนี้):
- ✅ Customer row 404 fix (tb_users fallback)
- ✅ Service-order row 404 fix (tb_header_order fallback)
- ✅ Yuan-payment row 404 fix (`/[id]` ใหม่)
- ✅ Sales-payout row 404 fix (`/[id]` ใหม่)
- ✅ Forwarder menubar "มอบงานคนขับ" URL
- ✅ **Yuan-payments list** rewrite to tb_payment
- ✅ **"เพิ่มรายการ" button** → Wave 8 landing (ไม่ silent redirect)
- ✅ **`/admin/drivers` sidebar entry** for menuSuper

P0 ตัวสุดท้าย (รอ next session):
- 🔴 `/admin/wallet` list rewrite → `tb_wallet_hs` (single biggest "wrong data" gap)

---

## วิธีใช้เอกสารนี้

ภูมเปิดมา · ดูตาราง 🔴 DEAD ก่อน · ใส่ "Action ภูม" เป็นอย่างใดอย่างหนึ่ง:
- **wire** = ให้ไปเพิ่ม entry ใน sidebar / menubar
- **delete** = หน้านี้ไม่ใช้ · ลบทิ้ง
- **keep** = orphan ตั้งใจ (เช่น super-only utility)
- **build** = หน้านี้ยังไม่เสร็จ · ต้อง implement ต่อ

หลังภูมตัดสิน · ผมจะรวมเป็น Wave 7.2 task list + ไปไล่ทำ.
