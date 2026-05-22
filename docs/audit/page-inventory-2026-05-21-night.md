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
| /admin/rates/custom-user | empty rebuilt | Phase A backlog banner (legacy tb_priceuser_* not migrated yet) → **Wave 9 fixed** (เห็นด้านล่าง) |
| /admin/rates/custom-hs | empty rebuilt | Phase A backlog banner (same migration gap) → **Wave 9 fixed** |
| sidebar "ระบบบัญชี" | 2-child dropdown (Cargo/Freight) | **single leaf** → `/admin/accounting/cargo` + Cargo/Freight pills ในหน้า head (mirrors `/admin/forwarders` pattern) |

**Total Wave 7.2 fixes shipped tonight: 23 surfaces** · across 9 commits.

---

## ✅ Wave 9 (2026-05-23 morning) — rate pages rewritten

**Discovery: Phase A wasn't actually a migration gap.** I named legacy tables
WRONG in the Wave 7.2 banners — `tb_priceuser_member` / `tb_priceuser_hs`
don't exist anywhere. The real legacy names are different + ALL already on prod:

| Real legacy table | Rows on prod | Purpose |
|---|---|---|
| `tb_rate_vip_kg` | 192 | KG rate per VIP tier (coid) |
| `tb_rate_vip_cbm` | 192 | CBM rate per VIP tier |
| `tb_customrate_hs` | 463 | History log per-customer rate overrides |
| `tb_hs_rate_custom_kg` | 1,481 | KG override per customer-cell |
| `tb_hs_rate_custom_cbm` | 1,537 | CBM override per customer-cell |

Pages rewritten:
- **`/admin/rates/custom-user`** — VIP tier rate matrix (12 groups: VIP1-5 + OOAEOM.VIP + THADA.VIP + SWAN + PRO3.15 + ...) · cards w/ customer count per group · click → 24-cell matrix (2 warehouses × 3 transport × 4 product) with KG + CBM
- **`/admin/rates/custom-hs`** — per-customer override history (200 latest) · search by PR id · drill into one customer → full matrix with "ก่อน → ใหม่" diff
- Read-only for now; Wave 10 = edit forms (UPSERT + insert history row)

✅ Browser-verified both pages render real prod data.

---

## ✅ Wave 10 (2026-05-23 late-morning) — P0 cnt-hs + 10 QA queues + driver mobile

4-stream batch (main thread + 3 background agents · ~90 min wall clock).

### Main: cnt-hs/[id] detail + approve/reject (P0 revenue path)
- Was 98-LOC STUB · now full 535-LOC faithful port of legacy
  cnt-hs.php?page=detail
- Reads tb_cnt + tb_cnt_item + tb_forwarder (per cabinet) + tb_users
- 5 cards: header chip · main detail (sanity-check linked total) · bank
  info · slip + PDF viewer · cabinets table · forwarders detail (50 max)
- Approve/Reject buttons → adminApproveCntHs / adminRejectCntHs
  (mutates tb_cnt.cntstatus 1→2 or 1→3 + adminidupdate + dateupdate)
- Browser-verified on cnt #958 (manapat changpoo + เอก ศรีรัตนไพฑูรย์)

### Agent A + B: 10 QA SLA-breach queues
- 10 new pages under `/admin/qa/<slug>` — every breach has its own
  focused read-only list (was just URL contracts into generic reports
  that didn't actually filter)
- All read tb_forwarder · tb_header_order · or tb_users with the precise
  SLA condition · 2-query tb_users merge for customer name/phone
- `/admin/qa` hub URL contract updated to point at the 10 new pages
- Browser-verified `/admin/qa/credit-overdue` renders 12+ overdue
  credit rows with drill-in to /admin/forwarders/<fno>
- Wave 11: cntDateETA join on transit-overdue · add "resolved" mark
  action so handled rows fall off the queue

### Agent C: /admin/drivers/work mobile work-list
- Mobile-first card layout (no table) · ≥48px tap targets · text-base
  body · tel: links · no horizontal scroll
- Reads tb_forwarder_driver_item → tb_forwarder_driver (fdadminid +
  fddate) → tb_forwarder (address + price + cabinet)
- 3 server actions: markDriverItemLoaded · markDriverItemDelivered ·
  markDriverItemFailed (mutates fdistatus '' → '1' → '2' or '3')
- Self-row enforcement: driver role auto-filters to own batches via
  fdadminid match · super/ops bypass for oversight
- Sidebar leaves added: menuDriver "งานวันนี้ (มือถือ)" + menuSuper
  "ดูงานคนขับ (มือถือ)" w/ i18n keys in both th.json + en.json
- Wave 11: photo upload (fdipictureon / fdipictureoff) + fdinote text
  column for fail reason

### Commits in this wave
| SHA | Stream |
|---|---|
| `4bf74c6` | Main: cnt-hs detail + approve/reject |
| `a285c90` | Agent B: 5 QA queues (warehouse/transit) |
| `3595d41` | Agent C: driver mobile work-list |
| `0ea443d` | Agent A rescued: 5 QA queues (payments) |
| (next) | Integrate: QA hub URLs + sidebar leaves + i18n |

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
