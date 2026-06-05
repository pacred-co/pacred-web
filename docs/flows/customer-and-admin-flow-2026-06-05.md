# Pacred — Customer + Admin End-to-End Flow

> **เวอร์ชัน:** 2026-06-05 (post Wave 30 · post 4-agent E2E audit)
> **ผู้อ่าน:** ภูม + ทีม + Claude session ถัดไป
> **เป้าหมาย:** แต่ละขั้นต้องรู้ว่า **ใครกด · เกิดอะไรใน DB · status เปลี่ยนจาก→ไหน · notify ใคร**

---

## 📚 อ่านยังไง

- 🟢 ลูกค้ากด · 🟠 admin กด · 🤖 cron/MOMO sync · 🔔 SMS+LINE auto-notify
- ฝั่ง DB ระบุตาราง `tb_*` (live) + column ที่เปลี่ยน
- "ขั้น" = step number ในโซ่ · ลูกค้าเห็นใน "5-step bar" ของ Pacred admin

---

# ส่วน A · ลูกค้า — Customer Side

## A1. Onboarding (สมัครครั้งแรก)

| ขั้น | ใคร | กดอะไร | เกิดอะไร | Status / Notify |
|:-:|:-:|---|---|---|
| 1 | 🟢 | `/register` กรอกเบอร์ + รหัสผ่าน | `actions/otp.ts` ส่ง OTP (ThaiBulkSMS · 3/hour cap) | SMS OTP ส่ง |
| 2 | 🟢 | กรอก OTP 6 หลัก + ยืนยัน | `actions/auth.ts` createUser → INSERT `profiles` + `tb_users` (auto PR-code: PR001, PR002...) + auto-seed `tb_wallet.wallettotal=0` + `tb_cash_back` + auto-assign sales rep (round-robin: admin_pee + admin_may) | Land `/dashboard` · 🔔 popup "เซลที่ดูแล: [name] · [phone]" |
| 3a | 🟢 | (บุคคล) end | — | — |
| 3b | 🟢 | (นิติบุคคล) step 2: กรอก tax ID + ที่อยู่ใบกำกับ | INSERT `tb_corporate` (linked userid) + DBD lookup (อาจ degrade เป็น manual entry · ระบบเก่า endpoint อาจไม่ตอบ) | — |

**⚠️ env-dependent:**
- `OTP_BYPASS=true` (dev) → ข้าม SMS · กรอกอะไรก็ผ่าน · prod ต้อง `false`
- `EMERGENCY_OTP_BYPASS=true` (emergency only) → ถ้า ThaiBulkSMS ล่ม
- `THAIBULKSMS_FORCE=corporate` (Pacred sender ID อยู่ใน Corporate pool · ถ้า `premium` = sent แต่ไม่ delivered)

## A2. ดู Dashboard + Profile

| ขั้น | ใคร | กดอะไร | เกิดอะไร |
|:-:|:-:|---|---|
| 1 | 🟢 | `/dashboard` | reads `tb_header_order` count by hStatus + `tb_forwarder` count by fStatus + `tb_wallet.wallettotal` |
| 2 | 🟢 | sidebar 11 รายการ | บริการฝากสั่งสินค้า · บริการนำเข้า · บริการส่งออก (greyed · เร็วๆนี้) · บริการฝากชำระสินค้า · กระเป๋าสตางค์ · ที่อยู่ฯ · ฯลฯ |
| 3 | 🟢 | `/profile` | แก้ชื่อ-นามสกุล · เบอร์ · upload รูปโปรไฟล์ (Wave: avatars bucket) · กระทันหันหันเป็นนิติบุคคล |
| 4 | 🟢 | `/addresses` | CRUD ที่อยู่จัดส่ง · กำหนด default |

---

## A3. 🟦 ฝากสั่งซื้อ (Shop Order) — ลูกค้าให้ Pacred ช่วยสั่งของจาก 1688/Taobao/Tmall

### โซ่ Status `tb_header_order.hstatus` (1→5):

```
1 รอดำเนินการ → 2 รอชำระเงิน → 3 สั่งสินค้าแล้ว → 4 รอร้านจีนจัดส่ง → 5 สำเร็จ
                                                                       ↓
                                                            (spawn tb_forwarder · ของเดินทางมาไทย)
```

| ขั้น | ใคร | กดอะไร | เกิดอะไรใน DB | Notify |
|:-:|:-:|---|---|---|
| 1 | 🟢 | `/search` paste 1688/Taobao URL หรือพิมพ์ keyword | TAMIT/Laonet/AkuCargo vendor APIs · render ราคา ¥ + รูป + SKU picker | — |
| 2 | 🟢 | กด "หยิบใส่รถเข็น" (เลือก SKU + qty) | `addCartItem` → INSERT `tb_cart` (userid + product + qty + ¥/ชิ้น) | — |
| 3 | 🟢 | `/cart` ตรวจรายการ · ลบ/แก้ qty | `removeCartItem` / `updateCartQty` (มี confirm dialog) | — |
| 4 | 🟢 | กด "ส่งคำสั่งซื้อ" (มี confirm) | `submitCartOrder` → INSERT `tb_header_order` (hStatus=**1**) + INSERT `tb_order` (รายการแต่ละชิ้น) · ลบ `tb_cart` | 🔔 admin (LINE staff group) |
| 5 | 🟠 admin | `/admin/service-orders/[hNo]/edit` แก้ราคา/จำนวน/ค่าส่งจีน + กด "บันทึก + เปลี่ยนเป็นรอชำระเงิน" | `adminSaveShopOrderItemsAndQuote` → UPDATE `tb_order` per item + recompute `hTotalPriceCHN`/`hShippingCHN`/`hTotalPriceUser` · hStatus 1→**2** · stamp hDate2 · hDatePayment=NOW+5d | 🔔 4-CH (SMS+LINE+email) "รอชำระเงิน ภายใน [date]" |
| 6 | 🟢 | `/service-order/[hNo]` กด "ชำระจาก wallet" (มี confirm) | `payServiceOrderFromWallet` → check `tb_wallet.wallettotal >= total` → DEBIT wallettotal + INSERT `tb_wallet_hs` (type=2, status=2) · hStatus 2→**3** · stamp hDate3 · paydeposit='1' · idempotency guard 60s | 🔔 admin "ชำระแล้ว" |
| 6b | 🟠 admin (alt) | (option B แทน step 6) `/edit` Tier A2 panel "บันทึกชำระจาก wallet" หรือ "รับเงินสด/นอกระบบ" | เหมือน 6 แต่ admin trigger แทนลูกค้า (Pacred enhancement) | 🔔 ลูกค้า |
| 7 | 🟠 admin | `/edit` ShopFieldsBoard (status 3) กรอกเลขออเดอร์ร้านจีนต่อร้าน (per shop) + กด "บันทึก" | UPDATE `tb_order.shop_order_no` per shop · hStatus 3→**4** + stamp hDate4 | 🔔 ลูกค้า "สั่งสินค้าแล้ว" |
| 8 | 🟠 admin | `/edit` ShopFieldsBoard (status 4) กรอก tracking number ต่อร้าน + กด "บันทึก + สร้าง forwarder" | INSERT `tb_forwarder` แต่ละ tracking (fStatus=**1**) · hStatus 4→**5** · stamp hDate5 | 🔔 ลูกค้า "ของออกจากร้าน" |

**ตอน step 8 จบ → โซ่ฝากสั่งซื้อจบ + โซ่ฝากนำเข้าเริ่ม (A4)**

---

## A4. 🟦 ฝากนำเข้า (Forwarder Import) — ของเดินทางจากจีนถึงไทย

### โซ่ Status `tb_forwarder.fstatus` (1→7):

```
1 รอรับสินค้า/รอเข้าโกดังจีน → 2 ตู้จีน → 3 ลงเรือ/รถ → 4 ถึงไทย/รอเข้าโกดังไทย → 5 รอชำระเงิน → 6 จัดส่งแล้ว → 7 สำเร็จ
       (spawned จาก shop-order)                                                      ↓
                                                                          (ลูกค้าจ่าย · ขนส่งถึงที่อยู่)
```

| ขั้น | ใคร | กดอะไร | เกิดอะไรใน DB | Notify |
|:-:|:-:|---|---|---|
| 1a | 🟢 | (path A) `/service-import/add` กรอก tracking ของเอง (ที่ลูกค้าซื้อตรง 1688) | INSERT `tb_forwarder` (fStatus=**1**, userid, ftrackingchn) | 🔔 admin |
| 1b | 🟠 admin | (path B) จาก shop-order step 8 — auto spawn | INSERT `tb_forwarder` (fStatus=**1**, ftrackingchn, hno=parent shop) | — |
| 1c | 🤖 | (path C) MOMO/CN/JMF vendor cron `*/10min` → sync tracking | INSERT `momo_import_tracks` · admin review · COMMIT → `tb_forwarder` (เชื่อม user_code) | — |
| 2 | 🤖 | MOMO/CN sync update status | UPDATE `tb_forwarder.fstatus` → 2 (รับเข้าโกดังจีน) · stamp `fdatestatus2` | 🔔 ลูกค้า "เข้าโกดังจีน" (Wave 30 setting) |
| 3 | 🤖 | MOMO sync container close | UPDATE fstatus → 3 (ลงตู้/ลงเรือ) · stamp `fdatestatus3` + `fcabinetnumber` (real GZS/GZE code · ไม่ใช่ routing batch) | 🔔 ลูกค้า |
| 4 | 🟠 admin (warehouse) | `/admin/barcode/cargo/import` scan barcode ตอนของถึงโกดังไทย | UPDATE fstatus → 4 · stamp `fdatestatus4` (= fdatecontainerclose) | 🔔 ลูกค้า "ถึงโกดังไทย" |
| 4b | 🟠 admin (accounting) | `/admin/forwarders/[fNo]/edit` กรอก weight/CBM/crate dimensions | UPDATE `fweight`, `fcbm`, `fcrate` · recompute `fprice` (resolveForwarderRate · VIP tier · custom rate · floor) | — |
| 5 | 🟠 admin | `/admin/forwarders` หรือ `/admin/forwarder-check` กด "แจ้งชำระเงิน" (single หรือ bulk) | UPDATE fstatus → 5 · stamp `fdate5` | 🔔 4-CH "รอชำระเงิน ฿X" + LINE deep-link |
| 6 | 🟢 | `/service-import?q=5` กด pay-bar ล่าง "ชำระเงิน" (มี confirm) | `payForwardersFromWallet` → check wallet → DEBIT `tb_wallet.wallettotal` + INSERT `tb_wallet_hs` (type=6) · fstatus 5→**6** · stamp `fdate6` · clear `tb_credit` if any | 🔔 admin "ลูกค้าชำระแล้ว" |
| 6b | 🟢 alt | (alt) แทนการตัดจาก wallet — upload slip + PromptPay QR | `submitForwarderPayment` → INSERT `tb_wallet_hs` (type=4, status=1, pending) · admin ต้อง approve | — |
| 6c | 🟠 admin (alt) | (admin pay on behalf — Pacred enhancement) `/admin/forwarders` กด "บันทึกชำระจาก wallet ลูกค้า" หรือ bulk-approve slip | `adminPayForwardersOnBehalf` / `adminBulkApproveWalletHs` / `adminApproveWalletDeposit` (type=4 slip path) → DEBIT wallet + INSERT wallet_hs + fstatus 5→6 + mint receipt | — |
| 7 | 🟠 admin (driver) | `/admin/barcode/driver/import` scan ของขึ้นรถส่ง | UPDATE fstatus → 7 · stamp delivery date | 🔔 ลูกค้า "จัดส่งแล้ว" |

**Auto-issue receipt:** step 6 ลงปุบ → `auto-issue-receipt.ts` (Wave 29 #2) สร้าง `tb_receipt` doc number `FRC{yyMM}-{NNNNN}` · ลูกค้าดูได้ที่ history · auto-mint ถ้า `tax_doc_pref` opt-in → ใบกำกับ + WHT 1%

---

## A5. 🟦 ฝากชำระสินค้า (Yuan Transfer) — Pacred ช่วยจ่ายเงินซัพไปร้านจีน (Alipay/WeChat Pay)

### โซ่ Status `tb_payment.paystatus` (1→3):

```
1 รอชำระเงิน → 2 ชำระแล้ว → 3 โอนสำเร็จ
```

| ขั้น | ใคร | กดอะไร | DB | Notify |
|:-:|:-:|---|---|---|
| 1 | 🟢 | `/service-payment/add` กรอกยอด ¥ + Alipay/WeChat ID + รูป QR หรือ link | INSERT `tb_payment` (paystatus=1 · rsRate=4.97 อัตราซื้อหยวน + admin มาคำนวณ) | 🔔 admin |
| 2 | 🟢 | `/service-payment` กด "ชำระจาก wallet" | `createYuanPayment` → check pending-aware balance · DEBIT `tb_wallet.wallettotal` + INSERT `tb_wallet_hs` (type=8) · paystatus 1→**2** | 🔔 admin |
| 2b | 🟢 alt | upload slip ชำระเพิ่ม | `submitYuanPaySlip` → INSERT pending | admin review |
| 3 | 🟠 admin | `/admin/yuan-payments/[id]` (status 2) กด "อนุมัติ + ทำรายการโอน" | จริงๆ admin ใช้ Alipay/WeChat App ของจริงโอน · กลับมาคลิกอัปเดต paystatus 2→**3** | 🔔 ลูกค้า "โอนแล้ว" |

---

## A6. 🟦 กระเป๋าสตางค์ (Wallet)

| Sub-flow | ใคร | กดอะไร | DB | Notify |
|---|:-:|---|---|---|
| **ดูประวัติ** | 🟢 | `/wallet` 4 tabs (เติม/หัก/ถอน/ทั้งหมด) | reads `tb_wallet_hs` ทุก type + balance ปัจจุบัน `tb_wallet.wallettotal` | — |
| **เติมเงิน** | 🟢 | `/wallet/deposit` กรอกยอด + กด "สร้าง QR" → PromptPay QR (Pacred TaxID `0105564077716`) + upload slip + กด "เติมเงิน" (มี confirm) | `submitLegacyWalletDeposit` → INSERT `tb_wallet_hs` (type=1, status=1, pending) + upload slip ไป `slips` bucket (≤5MB) | 🔔 admin |
| **เติมเงิน ✅** | 🟠 admin | `/admin/wallet?kind=deposit` กด approve | `adminApproveWalletDeposit` → status 1→2 · CREDIT `tb_wallet.wallettotal` += amount · idempotent | 🔔 ลูกค้า "เติมเงินสำเร็จ ฿X" |
| **ถอนเงิน** | 🟢 | `/wallet/withdraw` กรอกยอด + bank + ชื่อบัญชี + กด "ยืนยันสั่งถอน" (มี confirm + ⚠️ warning) | `submitWithdrawRequest` → INSERT `tb_wallet_hs` (type=3, status=1, pending) + DEBIT `tb_wallet.wallettotal` ทันที (legacy behavior) · ค่าบริการ 25฿ ถ้าน้อยกว่า 500 | 🔔 admin |
| **ถอนเงิน ✅** | 🟠 admin | `/admin/withdrawals/[id]` กด "จ่ายแล้ว" + upload slip โอน | UPDATE `tb_wallet_hs.status` 1→2 + admin ใช้ bank app โอนจริง · 7-10 วันทำการ | 🔔 ลูกค้า "ถอนสำเร็จ" |
| **ถอนเงิน ❌** | 🟠 admin | (option) reject | UPDATE status 1→3 (reject) + REFUND wallet += amount + INSERT wallet_hs type=3-refund | 🔔 ลูกค้า + ระบุเหตุผล |

---

## A7. 🟦 อื่นๆ ลูกค้า (เสริม)

| Feature | path | สิ่งที่ทำได้ |
|---|---|---|
| Cashback | `/sales` | ดูยอด cashback (จาก order ที่จ่ายผ่าน wallet · Wave A ADR-0025) · auto-spend ตอน checkout |
| Credit-line | `/wallet-credit` (creditUser only) | นิติบุคคลที่ admin อนุมัติ creditLimit → ใช้ก่อนจ่ายทีหลัง |
| Refund request | `/refunds` | ลูกค้า request คืนเงิน (ขอเป็น admin review) |
| Notifications | `/notifications` | LINE/SMS history ที่ระบบส่ง |
| Tax invoice | per-order toggle | นิติบุคคล opt-in → auto-mint ใบกำกับ + WHT |

---

# ส่วน B · แอดมิน — Admin Side (หลังบ้าน)

## B0. Login + Role

| Role | คน | สิทธิ์ |
|---|---|---|
| **super** | พี่ป๊อป · admin_pop · admin_dev · admin_pee | ทุก path |
| **accounting** | ภูม · admin_aom · admin_nat | `/admin/accounting/**` · `/admin/wallet/**` · `/admin/withdrawals` · `/admin/forwarders/combine-bill` · เห็น tax/VAT/receipts |
| **sales** | admin_pee · admin_may + sales-rep ที่ถูก round-robin assign | `/admin/customers` (เฉพาะลูกค้าตน) · CRM · commission |
| **qa** | admin_pond · admin_got | `/admin/qa-*` queues + 9-queue review |
| **warehouse** | admin_warehouse (cargo center) | `/admin/barcode/cargo/**` + `/admin/cnt-hs` + `/admin/report-cnt` |
| **driver** | admin_driver pool | `/admin/barcode/driver/**` only (mobile-first scanner) |
| **freight_sales / freight_export** | (deferred Phase C · AXELRA freight side) | `/admin/freight/**` |

Login = phone OR email (`admin_xxx@pacred.co.th`) OR PR-code · password (พี่ป๊อปกำหนด `123456` default · เปลี่ยนได้)

---

## B1. หลังลูกค้าสมัคร (A1) → admin มอง

| ขั้น | ใคร | path | สิ่งที่เห็น/ทำ |
|:-:|:-:|---|---|
| 1 | 🟠 sales | `/admin/customers?q=PR<new>` | ดูลูกค้าใหม่ที่ round-robin มาให้ตัวเอง · เห็น profile + เบอร์ + sales rep = ตัวเอง |
| 2 | 🟠 sales | (อาจ) call/LINE ลูกค้าใหม่ก่อน 24 ชม. | record into CRM (`/admin/crm`) |

---

## B2. หลังลูกค้าสั่งซื้อ (A3) → admin process

```
ลูกค้ากด submit (A3-4) → admin LINE staff group ขึ้น notify
↓
admin เปิด /admin/service-orders → ออเดอร์ใหม่ขึ้นใน status 1 (รอดำเนินการ)
↓
admin เปิด /admin/service-orders/[hNo]/edit (PCS-style 1 หน้า · per-shop board)
↓
[Step 5 ใน A3] admin แก้ราคา/จำนวน/ค่าส่งจีน → กด "บันทึก + เปลี่ยนเป็นรอชำระเงิน"
   ↓ hstatus 1→2 · 4-CH notify ลูกค้า
↓
[Step 6/6b] รอลูกค้าจ่าย หรือ admin ตัด wallet แทน
   ↓ hstatus 2→3
↓
[Step 7] admin ใช้ Alipay/WeChat จริงสั่งร้านจีน → กลับมากรอกเลขออเดอร์ร้านจีน per shop
   ↓ hstatus 3→4
↓
[Step 8] ร้านจีนส่ง tracking → admin กรอก tracking per shop → กด "บันทึก + สร้าง forwarder"
   ↓ hstatus 4→5 (จบ shop-order) · spawn tb_forwarder fstatus=1 (เริ่ม forwarder)
```

---

## B3. หลังลูกค้า/admin สั่ง → MOMO/CN/JMF process (A4)

| ขั้น | ใคร | path | สิ่งที่เห็น/ทำ |
|:-:|:-:|---|---|
| 1 | 🤖 cron | `/api/cron/momo-sync` ทุก 10 นาที | pull MOMO API → INSERT `momo_import_tracks` (raw JSON) |
| 2 | 🟠 super | `/admin/api-forwarder-momo` | dashboard CBM รวม + per-customer ประวัติ (Filter date + per-PR breakdown) |
| 3 | 🟠 super | `/admin/api-forwarder-momo/review` | review grid → กด "สร้างใหม่ทั้งหมด" → COMMIT MOMO row → `tb_forwarder` (fstatus=1) |
| 4 | 🤖 propagation | (ทุก commit) MOMO status drift → tb_forwarder | UPDATE fstatus + cabinet + warehouse (Wave 30 propagate) |
| 5 | 🟠 cargo center | `/admin/cnt-hs` | container manifest · กด "ปิดตู้" → fdatecontainerclose stamped |
| 6 | 🟠 warehouse | `/admin/barcode/cargo/import` mobile-scan barcode | mark received · fstatus auto-flip |

---

## B4. หลังของถึงไทย (A4 step 4) → admin ออกบิล

```
ของถึงโกดังไทย (fstatus=4) → cost ยังว่าง
↓
[Step 4b ใน A4] admin (accounting) เปิด /admin/forwarders/[fNo]/edit
   - กรอก weight/CBM/crate/transport-mode
   - resolveForwarderRate auto-คำนวณ fprice (VIP tier · custom rate · floor 4.84/kg)
   - กด "บันทึก"
↓
admin (accounting) → /admin/forwarders หรือ /admin/forwarder-check
   - กรองตู้ที่พร้อมเก็บเงิน (เช็คทุกแถว fcost > 0)
   - กด "แจ้งชำระเงิน" (single หรือ bulk-select หลายแถว · กด bulk-bar)
   ↓ fstatus 4→5 · 4-CH notify ลูกค้า "ภายใน 7 วัน"
↓
[A4 step 6] รอลูกค้าจ่าย (slip หรือ wallet) หรือ admin pay-on-behalf
   ↓ fstatus 5→6 · auto-issue receipt FRC{yyMM}-{NNNNN}
↓
[Step 7] admin driver scan barcode รถออก → fstatus 6→7
```

### ใบวางบิลรวม (combine-bill) — สำหรับลูกค้านิติบุคคลที่มีหลายตู้

| ขั้น | ใคร | path | สิ่งที่ทำ |
|:-:|:-:|---|---|
| 1 | 🟠 accounting | `/admin/forwarders/combine-bill/add` เลือก forwarders หลายตัวของลูกค้าเดียว | INSERT `tb_forwarder_invoice` (FRG{yyMM}-{NNNNN}) · เชื่อม `tb_forwarder_invoice_item` รายตู้ |
| 2 | 🟠 accounting | `/admin/forwarders/combine-bill/[id]` ดูบิลรวม + กด "ส่งให้ลูกค้า" | 🔔 ลูกค้า "ใบวางบิล #FRG... ฿X ภายใน [date]" + deep-link |
| 3 | 🟢 ลูกค้า | คลิก link จาก SMS/LINE → `/billing-run/[id]` (deep-link · ไม่มี sidebar) → ดู+พิมพ์บิล | — |
| 4 | 🟢 ลูกค้า | จ่ายตามบิล (ตัด wallet หรือ slip) — ตัดทุก forwarder ที่อยู่ในบิลพร้อมกัน | UPDATE fstatus 5→6 ทุกตัวในบิล · UPDATE `tb_forwarder_invoice.status='paid'` |

---

## B5. หลังลูกค้าฝากชำระสินค้า (A5) → admin process

| ขั้น | ใคร | path | สิ่งที่ทำ |
|:-:|:-:|---|---|
| 1 | 🟠 admin | `/admin/yuan-payments` (default 60d filter) | ดู pending paystatus=1/2 |
| 2 | 🟠 admin | `/admin/yuan-payments/[id]/edit` ตรวจสอบ + อัพเดท rsRate ถ้าจำเป็น | UPDATE `tb_payment` |
| 3 | 🟠 admin | ใช้ Alipay/WeChat App ของจริงโอนเงินไปร้านจีน → กลับมา click "อนุมัติ" | UPDATE paystatus 2→3 · 🔔 ลูกค้า |
| 3b | 🟠 admin (alt) | ปฏิเสธ | refund wallet · 🔔 |

---

## B6. Wallet approve (B1 + B2 + B3 + A6 admin side)

| Sub-flow | ใคร | path | สิ่งที่ทำ |
|---|:-:|---|---|
| **Deposit slip approve** | 🟠 accounting | `/admin/wallet?kind=deposit` | คลิก row → ดูสลิป (signed URL) → กด approve (มี confirm) → `adminApproveWalletDeposit` → CREDIT wallet · 🔔 |
| **Deposit reject** | 🟠 | (same) | กด reject + reason · ไม่ใส่เงินใน wallet · 🔔 |
| **Withdraw approve** | 🟠 accounting | `/admin/withdrawals?status=1` | review + ใช้ bank app โอนจริง → upload slip → กด "จ่ายแล้ว" (มี confirm) · status 1→2 · 🔔 |
| **Withdraw reject** | 🟠 | (same) | reject + reason · REFUND wallet · 🔔 |
| **Forwarder slip approve (single)** | 🟠 | `/admin/forwarders/[fNo]` | กด approve type=4 wallet_hs · fstatus 5→6 + auto-receipt · 🔔 |
| **Forwarder slip approve (bulk)** | 🟠 | `/admin/forwarder-check` | เลือกหลายแถว + bulk-approve · DEBIT wallet · fstatus 5→6 · auto-receipt ทุกแถว · 🔔 |

---

## B7. ใบกำกับ + ใบเสร็จ + ใบขน (3-tax-doc mode)

ลูกค้าตั้ง `tax_doc_pref` ในโปรไฟล์ (1 ใน 3):

| Mode | Behavior | ผู้ใช้ |
|---|---|---|
| **tax_invoice** (default) | auto-issue ใบกำกับ + WHT 1% หลังจ่าย | นิติบุคคลทั่วไป |
| **customs** | issue ใบขนสินค้า (VAT base ต่างกัน · accounting policy · ภูม flag) | ลูกค้านำเข้าเอง · เคลียร์ศุลกากรเอง |
| **none** | ไม่ออกเอกสาร (= ใบเสร็จเปล่า) | ลูกค้าทั่วไป |

**Auto-issue:** payment land (hstatus=3 หรือ fstatus=6) → `auto-issue-receipt.ts` mint receipt + ถ้า opt-in → mint ใบกำกับด้วย → 🔔 ลูกค้า "ดาวน์โหลดได้ที่ history"

---

## B8. CRM + Sales rep dashboard

| Feature | path | ทำอะไร |
|---|---|---|
| **CRM omni-inbox** | `/admin/crm` | LINE message thread (real) · FB stub · customer-360 |
| **Sales-rep routing** | `/admin/customers/transfer-rep` | บัลค์ reassign sales rep · เซลที่ลาออก/พัก |
| **Sales report** | `/admin/reports/sales-by-rep` | per-rep MTD + commission |
| **Commission earn** | auto-trigger | forwarder fstatus=6 + paid → INSERT `tb_user_sales` row earn |
| **Commission pay** | `/admin/sales-payouts` | super + accounting · approve รายเดือน |
| **Leads/cold-call** | `/admin/leads` | 6,936 inactive customers · call-queue (CEO Phase priority 1) |

---

## B9. Reports + BI

| Report | path | สิ่งที่เห็น |
|---|---|---|
| **Cockpit** | `/admin/reports/cockpit` | AR ฿917k · funnel · MTD orders > 15k flag (margin advisory) |
| **AR-aging** | `/admin/accounting/ar-aging` | bucket อายุหนี้ + top-50 debtors + CSV export |
| **KPI dashboard** | `/admin/kpi` | revenue + signups + wallet + MTD |
| **Reports hub** | `/admin/reports` | 5 sub-reports (credit-pending · pending-payments · refunds · monthly-orders · sales-by-rep + อื่นๆ) |

---

# ส่วน C · Notifications + Communication

ทุก state transition ที่ flip ตัวเลข hstatus หรือ fstatus → automatic notify ผ่าน 4-CH:

| Channel | trigger | content |
|---|---|---|
| **SMS** (ThaiBulkSMS Corporate · "Pacred" sender) | shop-order 1→2 · forwarder 4→5 · withdraw approve · deposit approve | short text + amount |
| **LINE OA push** (Pacred Shipping @pacred · พิสูจน์ live) | same triggers + LIFF deep-link to relevant page | Flex card + link |
| **LINE staff group** (groupId `C09344be50f51abbfb8ca9fddb24e10f9`) | ลูกค้าสมัครใหม่ · ลูกค้า submit cart · ลูกค้า pay slip | staff ดูได้ทันที |
| **Email** | (legacy parity · เลือกได้) | สรุปคำสั่งซื้อ + ใบเสร็จ PDF attach |

`NOTIFY_BYPASS` env (B-1 launch blocker) — ถ้า `true` ใน test → ไม่ส่งจริง · prod ต้อง `false`

---

# ส่วน D · Edge cases ภูม ต้องระวังตอนเทส

1. **Cashback double-spend** — เมื่อ refund มา ต้อง refund cashback back (ADR-0025 · verify ใน Wave A trust-sweep)
2. **Credit-line over-limit** — `getMyCredit` ตรวจ `tb_users.userCreditValue − tb_credit.creditvalue` (ADR-0023) · ลูกค้านิติบุคคลที่ over-limit จะถูก gate
3. **Wallet over-draw** — `payServiceOrderFromWallet` มี pre-check + idempotency guard 60s · บัญชีคงเหลือ < total = error
4. **MOMO user_code typo** — MOMO operator อาจกรอก "023" = ID 23 = PR1395 ผิด (ภูม รู้แล้ว · ตรวจรูปจริงเสมอ)
5. **Cabinet vs routing batch** — ห้าม write routing batch ID ลง `fcabinetnumber` (Wave 30 propagation fix) · ของจริงต้องเป็น GZS260529-1 ฯลฯ
6. **Forwarder cancel-while-fstatus=1 only** — ลูกค้า self-cancel ได้แค่ตอน fstatus=1 + reforder ว่าง · หลังจากนั้นห้าม
7. **OTP rate limit** — 3/hour/phone · เทสบ่อยๆ จะติด → ใช้ `OTP_BYPASS=true` ใน dev
8. **Slip upload cap 5MB** — เดิม legacy 9MB · Pacred ลดเป็น 5MB (Wave 23 P0 fix · กัน Vercel body limit)
9. **/admin/forwarders/new "เปิดออเดอร์" varchar(10) overflow** — Wave 23 P0 fix ปิดแล้ว · adminid string limit
10. **Sales rep assignment ใน register** — ต้องมี active sales rep ใน `admins` ที่มี `legacy_admin_id` · ถ้าไม่มี = null assign (ภูม ระวัง · admin_pee + admin_may เป็น default)

---

# ส่วน E · ที่ ภูม ต้อง verify ก่อน hard-launch

| รายการ | วิธีเช็ค |
|---|---|
| Vercel prod env: `OTP_BYPASS=false` + `THAIBULKSMS_FORCE=corporate` + `PACRED_TAMIT_DETAIL_URL=…/api-product-2026` | Vercel Settings → Env Vars |
| ThaiBulkSMS quota เหลือเพียงพอ | dashboard ThaiBulkSMS |
| LINE OA quota plan (FREE 300 push/mo → Light/Standard) | dashboard LINE |
| `PROMPTPAY_ID=0105564077716` set on Vercel | env list |
| Admin staff พร้อม Day 1 → approve deposit slip + ออกบิลภายในวัน | shift schedule |
| ภูม recreate 13 admins ผ่าน `/admin/admins/new` | dashboard `/admin/admins` shows 13 |
| Migration 0140 (yuan_tax_doc_pref) applied prod | Supabase migration list |
| Sentry `NEXT_PUBLIC_SENTRY_DSN` set | env |

---

**ผู้รับผิดชอบ flow** (ใครแก้/ส่งงานต่อ)

| ส่วน | คน |
|---|---|
| Customer side (A) — frontend + protected layout | ปอน (InwPond007) · กับ ภูม co-edit ใน shop-order/forwarder |
| Admin side (B) — back-office + actions | ภูม (Poom-pacred) primary · เดฟ integrator |
| Cron + integrations (B3) — MOMO/JMF/CN | ก๊อต partner-API + ภูม consume |
| Notifications (C) | ปอน Cloudflare Worker (LINE webhook) + ภูม ผูก trigger |
| BI/reports (B9) | เดฟ + ภูม |

---

**END.** ไฟล์นี้ live · update ทุก wave ที่ใหญ่พอจะเปลี่ยน flow.
